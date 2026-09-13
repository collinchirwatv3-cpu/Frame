// Live RLS regression test for clips (supabase/migrations/20260914060000_
// harden_clips_insert.sql + 20260914110000_complete_clips_authorization.sql).
// Runs against the REAL configured Supabase project — no mocks, matching
// this project's standing rule that RLS behavior is only ever trusted once
// it's been exercised with a real request, not read off the migration file.
//
// Usage: node --env-file=.env.local scripts/verify-rls-clips.mjs
//
// Creates and tears down its own throwaway videos/clips/auth users — safe
// to run against a real project repeatedly.
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

async function makeInvitedUser(label) {
  const email = `verify-rls-clips-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true });
  await new Promise((r) => setTimeout(r, 1200)); // handle_new_user trigger
  await svc.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", created.user.id);
  return { id: created.user.id, email };
}

async function makeUninvitedUser(label) {
  const email = `verify-rls-clips-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true });
  await new Promise((r) => setTimeout(r, 1200));
  return { id: created.user.id, email };
}

async function makeVideo(creatorId, overrides) {
  const { data, error } = await svc
    .from("videos")
    .insert({
      creator_id: creatorId,
      stream_uid: `verify-rls-clips-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "verify-rls-clips test video",
      description: "",
      category: "Travel",
      content_type: "film",
      publish_mode: "post",
      visibility: "public",
      processing_status: "ready",
      width: 1920,
      height: 1080,
      duration_seconds: 300,
      playback_url: "https://example.com/x.m3u8",
      poster_url: "https://example.com/x.jpg",
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`makeVideo failed: ${error.message}`);
  return data.id;
}

const cleanup = { authUsers: [], videos: [], clips: [] };

async function main() {
  const owner = await makeInvitedUser("owner");
  cleanup.authUsers.push(owner.id);
  const invited = await makeInvitedUser("invited");
  cleanup.authUsers.push(invited.id);
  const uninvited = await makeUninvitedUser("uninvited");
  cleanup.authUsers.push(uninvited.id);

  const publicReadyVideo = await makeVideo(owner.id, { visibility: "public", processing_status: "ready" });
  cleanup.videos.push(publicReadyVideo);
  const privateVideo = await makeVideo(owner.id, { visibility: "private", processing_status: "ready" });
  cleanup.videos.push(privateVideo);
  const processingVideo = await makeVideo(owner.id, {
    visibility: "public",
    processing_status: "processing",
    width: null,
    height: null,
    duration_seconds: null,
    playback_url: null,
    poster_url: null,
  });
  cleanup.videos.push(processingVideo);
  const failedVideo = await makeVideo(owner.id, {
    visibility: "public",
    processing_status: "failed",
    width: null,
    height: null,
    duration_seconds: null,
    playback_url: null,
    poster_url: null,
  });
  cleanup.videos.push(failedVideo);

  const asOwner = await sessionFor(owner.email);
  const asInvited = await sessionFor(invited.email);
  const asUninvited = await sessionFor(uninvited.email);

  function tryClip(client, userId, videoId) {
    return client
      .from("clips")
      .insert({ video_id: videoId, user_id: userId, start_seconds: 0, end_seconds: 10, title: "test clip" })
      .select("id")
      .single();
  }

  // --- INSERT ---
  const { error: uninvitedErr } = await tryClip(asUninvited, uninvited.id, publicReadyVideo);
  check("uninvited insert denied", !!uninvitedErr, { uninvitedErr: uninvitedErr?.message });

  const { error: privateErr } = await tryClip(asInvited, invited.id, privateVideo);
  check("invited insert against private video denied", !!privateErr, { privateErr: privateErr?.message });

  const { error: processingErr } = await tryClip(asInvited, invited.id, processingVideo);
  check("invited insert against processing video denied", !!processingErr, { processingErr: processingErr?.message });

  const { error: failedErr } = await tryClip(asInvited, invited.id, failedVideo);
  check("invited insert against failed video denied", !!failedErr, { failedErr: failedErr?.message });

  const { error: ownerOnOwnNonReadyErr } = await tryClip(asOwner, owner.id, processingVideo);
  check(
    "owner CANNOT insert a clip against their own non-ready video (no insert-time owner exception)",
    !!ownerOnOwnNonReadyErr,
    { ownerOnOwnNonReadyErr: ownerOnOwnNonReadyErr?.message }
  );

  const { data: legitClip, error: legitErr } = await tryClip(asInvited, invited.id, publicReadyVideo);
  check("invited insert against public+ready video succeeds", !legitErr, { legitErr: legitErr?.message });
  if (legitClip) cleanup.clips.push(legitClip.id);

  // --- SELECT ---
  const { data: uninvitedSees } = await asUninvited
    .from("clips")
    .select("id")
    .eq("id", legitClip?.id ?? "00000000-0000-0000-0000-000000000000");
  check("an uninvited (but signed-in) user CAN still see a public/ready video's clips", (uninvitedSees?.length ?? 0) === 1);

  // A clip made (by the owner, via service role, bypassing the no-owner-
  // exception insert rule above) against the private video must not be
  // selectable by anyone except the video's owner.
  const { data: privateClip } = await svc
    .from("clips")
    .insert({ video_id: privateVideo, user_id: owner.id, start_seconds: 0, end_seconds: 10, title: "private clip" })
    .select("id")
    .single();
  cleanup.clips.push(privateClip.id);

  const { data: invitedSeesPrivate } = await asInvited.from("clips").select("id").eq("id", privateClip.id);
  check("a non-owner CANNOT see a clip on a private video", (invitedSeesPrivate?.length ?? 0) === 0);

  const { data: ownerSeesPrivate } = await asOwner.from("clips").select("id").eq("id", privateClip.id);
  check("the video's OWNER CAN see a clip on their own private video (explicit owner exception)", (ownerSeesPrivate?.length ?? 0) === 1);

  // --- DELETE ---
  const { error: nonOwnerDeleteErr } = await asUninvited.from("clips").delete().eq("id", legitClip.id);
  const { data: stillThereAfterNonOwnerAttempt } = await svc.from("clips").select("id").eq("id", legitClip.id);
  check(
    "non-owner (not clip creator, not video owner) cannot delete a clip",
    (stillThereAfterNonOwnerAttempt?.length ?? 0) === 1,
    { nonOwnerDeleteErr: nonOwnerDeleteErr?.message }
  );

  const { error: videoOwnerModerationErr } = await asOwner.from("clips").delete().eq("id", legitClip.id);
  const { data: afterModeration } = await svc.from("clips").select("id").eq("id", legitClip.id);
  check(
    "the video owner CAN delete another user's clip on their video (moderation)",
    (afterModeration?.length ?? 0) === 0,
    { videoOwnerModerationErr: videoOwnerModerationErr?.message }
  );
  cleanup.clips = cleanup.clips.filter((id) => id !== legitClip.id);

  console.log(`\n${pass} passed, ${fail} failed`);
}

async function doCleanup() {
  for (const id of cleanup.clips) await svc.from("clips").delete().eq("id", id);
  for (const id of cleanup.videos) await svc.from("videos").delete().eq("id", id);
  for (const id of cleanup.authUsers) await svc.auth.admin.deleteUser(id);
  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error("verify-rls-clips.mjs crashed:", e);
    fail++;
  })
  .finally(async () => {
    await doCleanup();
    process.exit(fail > 0 ? 1 : 0);
  });
