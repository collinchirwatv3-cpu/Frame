// Live RLS/grant verification for video self-edit/delete
// (supabase/migrations/20260919100000_video_self_edit.sql). Runs against
// the LOCAL Supabase instance only.
//
// Usage: node --env-file=<local env file> scripts/verify-video-self-edit.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0;
let fail = 0;
function check(label, ok, extra) {
  if (ok) {
    pass++;
    console.log(`  OK  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}`, extra ?? "");
  }
}

async function sessionFor(email) {
  const { data } = await svc.auth.admin.generateLink({ type: "magiclink", email });
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: verified } = await client.auth.verifyOtp({ type: "email", token_hash: data.properties.hashed_token });
  await client.auth.setSession({
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  });
  return client;
}

async function makeUser(label) {
  const email = `verify-video-edit-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await svc.auth.admin.createUser({ email, email_confirm: true });
  await new Promise((r) => setTimeout(r, 1200)); // handle_new_user trigger
  return { id: data.user.id, email };
}

async function makeVideo(creatorId, streamUid) {
  const { data, error } = await svc
    .from("videos")
    .insert({
      creator_id: creatorId,
      stream_uid: streamUid,
      playback_url: "https://example.test/playback.mp4",
      poster_url: "https://example.test/poster.jpg",
      title: "Original title",
      description: "Original description",
      duration_seconds: 200, // >=180s — avoids the short-duration/content_type classification constraint, unrelated to what this script tests
      width: 1920,
      height: 1080,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const cleanup = { authUsers: [], videos: [] };

async function main() {
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  cleanup.authUsers.push(alice.id, bob.id);
  const aliceClient = await sessionFor(alice.email);
  const bobClient = await sessionFor(bob.email);

  const videoId = await makeVideo(alice.id, "verify-edit-stream-uid-1");
  cleanup.videos.push(videoId);

  // --- Owner can update title/description ---
  const { data: updated, error: updateErr } = await aliceClient
    .from("videos")
    .update({ title: "New title", description: "New description" })
    .eq("id", videoId)
    .select("title, description")
    .single();
  check(
    "owner can update title/description",
    !updateErr && updated?.title === "New title" && updated?.description === "New description",
    updateErr
  );

  // --- Owner cannot update a non-granted column (bypassing the API's own validation) ---
  const { error: qualityErr } = await aliceClient.from("videos").update({ quality_score: 999 }).eq("id", videoId);
  check("owner cannot update quality_score directly (not a granted column)", !!qualityErr, qualityErr);

  const { error: processingErr } = await aliceClient
    .from("videos")
    .update({ processing_status: "ready" })
    .eq("id", videoId);
  check("owner cannot update processing_status directly", !!processingErr, processingErr);

  // --- Database CHECK constraints ---
  const { error: tooLongTitleErr } = await aliceClient
    .from("videos")
    .update({ title: "x".repeat(121) })
    .eq("id", videoId);
  check("a 121-char title is rejected by the DB check constraint", !!tooLongTitleErr, tooLongTitleErr);

  const { error: emptyTitleErr } = await aliceClient.from("videos").update({ title: "" }).eq("id", videoId);
  check("an empty title is rejected", !!emptyTitleErr, emptyTitleErr);

  // --- Another user cannot edit someone else's video ---
  const { data: bobUpdate, error: bobUpdateErr } = await bobClient
    .from("videos")
    .update({ title: "Hijacked" })
    .eq("id", videoId)
    .select("id");
  check(
    "another user's update matches zero rows (RLS-scoped, not just app-layer)",
    !bobUpdateErr && (bobUpdate ?? []).length === 0,
    { bobUpdate, bobUpdateErr }
  );
  const { data: stillOriginal } = await svc.from("videos").select("title").eq("id", videoId).single();
  check("the video's title is unchanged after another user's attempted edit", stillOriginal?.title === "New title", stillOriginal);

  // --- Another user cannot delete someone else's video ---
  const { data: bobDelete, error: bobDeleteErr } = await bobClient.from("videos").delete().eq("id", videoId).select("id");
  check(
    "another user's delete matches zero rows",
    !bobDeleteErr && (bobDelete ?? []).length === 0,
    { bobDelete, bobDeleteErr }
  );
  const { data: stillExists } = await svc.from("videos").select("id").eq("id", videoId).maybeSingle();
  check("the video still exists after another user's attempted delete", !!stillExists);

  // --- Owner can delete their own video ---
  const { data: aliceDelete, error: aliceDeleteErr } = await aliceClient
    .from("videos")
    .delete()
    .eq("id", videoId)
    .select("id")
    .maybeSingle();
  check("owner can delete their own video", !aliceDeleteErr && aliceDelete?.id === videoId, aliceDeleteErr);
  const { data: goneNow } = await svc.from("videos").select("id").eq("id", videoId).maybeSingle();
  check("the video row is actually gone", goneNow === null, goneNow);
  cleanup.videos = []; // already deleted, nothing left to clean up

  console.log(`\n${pass} passed, ${fail} failed`);
}

async function doCleanup() {
  for (const id of cleanup.videos) await svc.from("videos").delete().eq("id", id);
  for (const id of cleanup.authUsers) await svc.auth.admin.deleteUser(id);
  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error("verify-video-self-edit.mjs crashed:", e);
    fail++;
  })
  .finally(async () => {
    await doCleanup();
    process.exit(fail > 0 ? 1 : 0);
  });
