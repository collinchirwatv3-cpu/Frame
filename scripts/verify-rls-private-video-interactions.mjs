// Live RLS regression test for likes/comments video-visibility boundaries
// (supabase/migrations/20260914140000_restore_private_video_interaction_boundaries.sql).
// Runs against the REAL configured Supabase project.
//
// Usage: node --env-file=.env.local scripts/verify-rls-private-video-interactions.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  const email = `verify-rls-private-video-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data: created } = await svc.auth.admin.createUser({ email, email_confirm: true });
  await new Promise((r) => setTimeout(r, 1200));
  await svc.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", created.user.id);
  return { id: created.user.id, email };
}

async function makeVideo(creatorId, overrides) {
  const { data, error } = await svc
    .from("videos")
    .insert({
      creator_id: creatorId,
      stream_uid: `verify-rls-private-video-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: "verify-rls-private-video test",
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

const cleanup = { authUsers: [], videos: [], likes: [], comments: [] };

async function main() {
  const owner = await makeInvitedUser("owner");
  cleanup.authUsers.push(owner.id);
  const other = await makeInvitedUser("other");
  cleanup.authUsers.push(other.id);

  const publicReady = await makeVideo(owner.id, { visibility: "public", processing_status: "ready" });
  cleanup.videos.push(publicReady);
  const privateVideo = await makeVideo(owner.id, { visibility: "private", processing_status: "ready" });
  cleanup.videos.push(privateVideo);
  const uploadingVideo = await makeVideo(owner.id, {
    visibility: "public",
    processing_status: "uploading",
    width: null,
    height: null,
    duration_seconds: null,
    playback_url: null,
    poster_url: null,
  });
  cleanup.videos.push(uploadingVideo);

  const asOwner = await sessionFor(owner.email);
  const asOther = await sessionFor(other.email);

  // --- INSERT: likes ---
  const { error: likePrivateErr } = await asOther.from("likes").insert({ user_id: other.id, video_id: privateVideo });
  check("cannot like a private video", !!likePrivateErr, { likePrivateErr: likePrivateErr?.message });

  const { error: likeUploadingErr } = await asOther
    .from("likes")
    .insert({ user_id: other.id, video_id: uploadingVideo });
  check("cannot like an uploading (not-ready) video", !!likeUploadingErr, { likeUploadingErr: likeUploadingErr?.message });

  const { error: ownerLikeOwnPrivateErr } = await asOwner
    .from("likes")
    .insert({ user_id: owner.id, video_id: privateVideo });
  check("owner cannot like their own private video either (no insert-time owner exception)", !!ownerLikeOwnPrivateErr);

  const { error: likeOkErr } = await asOther.from("likes").insert({ user_id: other.id, video_id: publicReady });
  check("can like a public+ready video", !likeOkErr, { likeOkErr: likeOkErr?.message });
  cleanup.likes.push({ user_id: other.id, video_id: publicReady });

  // --- SELECT: likes ---
  await svc.from("likes").insert({ user_id: owner.id, video_id: privateVideo });
  cleanup.likes.push({ user_id: owner.id, video_id: privateVideo });

  const { data: otherSeesPrivateLike } = await asOther.from("likes").select("*").eq("video_id", privateVideo);
  check("a non-owner cannot see likes on a private video", (otherSeesPrivateLike?.length ?? -1) === 0);

  const { data: ownerSeesOwnPrivateLike } = await asOwner.from("likes").select("*").eq("video_id", privateVideo);
  check("the video owner CAN see likes on their own private video", (ownerSeesOwnPrivateLike?.length ?? 0) === 1);

  const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: anonSeesPrivateLike } = await anon.from("likes").select("*").eq("video_id", privateVideo);
  check("a signed-out visitor cannot see likes on a private video", (anonSeesPrivateLike?.length ?? -1) === 0);

  // --- INSERT: comments ---
  const { error: commentPrivateErr } = await asOther
    .from("comments")
    .insert({ user_id: other.id, video_id: privateVideo, text: "nope" });
  check("cannot comment on a private video", !!commentPrivateErr, { commentPrivateErr: commentPrivateErr?.message });

  const { error: commentUploadingErr } = await asOther
    .from("comments")
    .insert({ user_id: other.id, video_id: uploadingVideo, text: "nope" });
  check("cannot comment on an uploading (not-ready) video", !!commentUploadingErr);

  const { data: legitComment, error: commentOkErr } = await asOther
    .from("comments")
    .insert({ user_id: other.id, video_id: publicReady, text: "Nice shot" })
    .select("id")
    .single();
  check("can comment on a public+ready video", !commentOkErr, { commentOkErr: commentOkErr?.message });
  if (legitComment) cleanup.comments.push(legitComment.id);

  // --- SELECT: comments ---
  const { data: privateComment } = await svc
    .from("comments")
    .insert({ user_id: owner.id, video_id: privateVideo, text: "private note" })
    .select("id")
    .single();
  cleanup.comments.push(privateComment.id);

  const { data: otherSeesPrivateComment } = await asOther.from("comments").select("id").eq("id", privateComment.id);
  check("a non-owner cannot see a comment on a private video", (otherSeesPrivateComment?.length ?? -1) === 0);

  const { data: ownerSeesPrivateComment } = await asOwner.from("comments").select("id").eq("id", privateComment.id);
  check("the video owner CAN see a comment on their own private video", (ownerSeesPrivateComment?.length ?? 0) === 1);

  console.log(`\n${pass} passed, ${fail} failed`);
}

async function doCleanup() {
  for (const id of cleanup.comments) await svc.from("comments").delete().eq("id", id);
  for (const { user_id, video_id } of cleanup.likes) await svc.from("likes").delete().match({ user_id, video_id });
  for (const id of cleanup.videos) await svc.from("videos").delete().eq("id", id);
  for (const id of cleanup.authUsers) await svc.auth.admin.deleteUser(id);
  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error("verify-rls-private-video-interactions.mjs crashed:", e);
    fail++;
  })
  .finally(async () => {
    await doCleanup();
    process.exit(fail > 0 ? 1 : 0);
  });
