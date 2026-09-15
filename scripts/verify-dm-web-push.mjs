// Live RLS/RPC verification for DM Web Push
// (supabase/migrations/20260918100000_dm_web_push.sql). Runs against the
// LOCAL Supabase instance only — no mocks, matching this project's standing
// rule that RLS/plpgsql behavior is only trusted once exercised with a real
// request. Creates and tears down its own throwaway users/threads/messages.
//
// Usage: node --env-file=.env.local scripts/verify-dm-web-push.mjs
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
  const email = `verify-dm-push-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await svc.auth.admin.createUser({ email, email_confirm: true });
  await new Promise((r) => setTimeout(r, 1200)); // handle_new_user trigger
  await svc.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, email };
}

const cleanup = { authUsers: [], threads: [] };
const FAKE_ENDPOINT = (n) => `https://fcm.googleapis.com/fcm/send/verify-dm-push-${n}-${Date.now()}`;

async function main() {
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  cleanup.authUsers.push(alice.id, bob.id);
  const aliceClient = await sessionFor(alice.email);
  const bobClient = await sessionFor(bob.email);

  // --- Registration: ownership + validation ---
  const { data: subId, error: regErr } = await aliceClient.rpc("register_push_subscription", {
    p_endpoint: FAKE_ENDPOINT("alice"),
    p_p256dh: "test-p256dh-key-value",
    p_auth: "test-auth-key",
  });
  check("register_push_subscription succeeds for an authenticated user", !regErr && !!subId, regErr);

  const { error: ssrfErr1 } = await aliceClient.rpc("register_push_subscription", {
    p_endpoint: "https://internal.evil.example/steal-payload",
    p_p256dh: "k",
    p_auth: "k",
  });
  check("an arbitrary non-push-service https endpoint is rejected", !!ssrfErr1, ssrfErr1);

  const { error: ssrfErr2 } = await aliceClient.rpc("register_push_subscription", {
    p_endpoint: "http://169.254.169.254/latest/meta-data/",
    p_p256dh: "k",
    p_auth: "k",
  });
  check("a cloud-metadata-shaped (SSRF) endpoint is rejected", !!ssrfErr2, ssrfErr2);

  const { data: aliceOwnRow } = await aliceClient.from("push_subscriptions").select("id").eq("id", subId).maybeSingle();
  check("owner can select their own subscription", !!aliceOwnRow);

  const { data: bobReadOfAlice } = await bobClient.from("push_subscriptions").select("id").eq("id", subId).maybeSingle();
  check("another user cannot select someone else's subscription", bobReadOfAlice === null, bobReadOfAlice);

  const { error: bobDeleteOfAlice } = await bobClient.from("push_subscriptions").delete().eq("id", subId);
  const { data: stillThere } = await svc.from("push_subscriptions").select("id").eq("id", subId).maybeSingle();
  check("another user's delete does not remove someone else's subscription", !!stillThere, {
    bobDeleteOfAlice,
    stillThere,
  });

  const { error: directInsertErr } = await bobClient
    .from("push_subscriptions")
    .insert({ user_id: bob.id, endpoint: FAKE_ENDPOINT("bob-direct"), p256dh: "k", auth_key: "k" });
  check("a direct client insert (bypassing the RPC) is rejected", !!directInsertErr, directInsertErr);

  // --- Repeated registration / shared-device reassignment ---
  const sharedEndpoint = FAKE_ENDPOINT("shared-device");
  await aliceClient.rpc("register_push_subscription", { p_endpoint: sharedEndpoint, p_p256dh: "k1", p_auth: "k1" });
  const { data: reassigned, error: reassignErr } = await bobClient.rpc("register_push_subscription", {
    p_endpoint: sharedEndpoint,
    p_p256dh: "k2",
    p_auth: "k2",
  });
  const { data: sharedRow } = await svc.from("push_subscriptions").select("user_id").eq("id", reassigned).maybeSingle();
  check(
    "re-registering the same endpoint under a different account reassigns ownership (no duplicate row)",
    !reassignErr && sharedRow?.user_id === bob.id,
    { reassignErr, sharedRow }
  );

  // --- DM thread + trigger fan-out ---
  const { data: threadId } = await aliceClient.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
  cleanup.threads.push(threadId);

  // Direct authenticated insert into dm_messages (not the /api/dm/messages
  // route) — the whole point of a DB trigger is that this still produces a
  // job, since the API route is not the only writer RLS permits.
  const { data: msg, error: msgErr } = await aliceClient
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: alice.id, text: "hi bob" })
    .select("id, created_at")
    .single();
  check("direct authenticated dm_messages insert succeeds", !msgErr && !!msg, msgErr);

  const { data: jobsForMsg } = await svc.from("push_jobs").select("*").eq("message_id", msg.id);
  check(
    "one push job was created, for bob's subscription, not alice's (sender never notified)",
    jobsForMsg?.length === 1 && jobsForMsg[0].recipient_id === bob.id,
    jobsForMsg
  );

  // Sender's own subscription must never get a job for their own message.
  await aliceClient.rpc("register_push_subscription", { p_endpoint: FAKE_ENDPOINT("alice-2"), p_p256dh: "k", p_auth: "k" });
  const { data: msg2 } = await aliceClient
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: alice.id, text: "second message" })
    .select("id")
    .single();
  const { data: jobsForMsg2 } = await svc.from("push_jobs").select("recipient_id").eq("message_id", msg2.id);
  check(
    "sender is never among the notified recipients even when the sender also has a subscription",
    (jobsForMsg2 ?? []).every((j) => j.recipient_id === bob.id),
    jobsForMsg2
  );

  // Recipient with no subscription at all -> zero jobs, no error.
  const carol = await makeUser("carol");
  cleanup.authUsers.push(carol.id);
  const { data: threadAC } = await aliceClient.rpc("get_or_create_dm_thread", { other_user_id: carol.id });
  cleanup.threads.push(threadAC);
  const { data: msgToCarol } = await aliceClient
    .from("dm_messages")
    .insert({ thread_id: threadAC, sender_id: alice.id, text: "hi carol, no subscription yet" })
    .select("id")
    .single();
  const { data: jobsForCarol } = await svc.from("push_jobs").select("id").eq("message_id", msgToCarol.id);
  check("a recipient with zero subscriptions produces zero jobs (not an error)", (jobsForCarol ?? []).length === 0);

  // --- push_jobs is fully inaccessible to clients ---
  const { data: bobReadJobs, error: bobJobsErr } = await bobClient.from("push_jobs").select("id").eq("message_id", msg.id);
  check("push_jobs is not selectable by any authenticated client, even the recipient", (bobReadJobs ?? []).length === 0, {
    bobReadJobs,
    bobJobsErr,
  });

  // --- claim_push_jobs: already-read suppression ---
  const { data: msgAfterReadTest } = await aliceClient
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: alice.id, text: "will be marked read before claim" })
    .select("id, created_at")
    .single();
  await bobClient.rpc("mark_dm_thread_read", {
    target_thread_id: threadId,
    p_through_created_at: msgAfterReadTest.created_at,
    p_through_id: msgAfterReadTest.id,
  });
  await svc.rpc("claim_push_jobs", { p_limit: 50 });
  const { data: jobRowAfterRead } = await svc
    .from("push_jobs")
    .select("status")
    .eq("message_id", msgAfterReadTest.id)
    .maybeSingle();
  check(
    "a message the recipient already read before claim time is suppressed (status=skipped, never returned to the worker)",
    jobRowAfterRead?.status === "skipped",
    jobRowAfterRead
  );

  // --- claim_push_jobs: blocked-pair suppression ---
  const dave = await makeUser("dave");
  cleanup.authUsers.push(dave.id);
  const daveClient = await sessionFor(dave.email);
  await daveClient.rpc("register_push_subscription", { p_endpoint: FAKE_ENDPOINT("dave"), p_p256dh: "k", p_auth: "k" });
  const { data: threadAD } = await aliceClient.rpc("get_or_create_dm_thread", { other_user_id: dave.id });
  cleanup.threads.push(threadAD);
  const { data: msgToDave } = await aliceClient
    .from("dm_messages")
    .insert({ thread_id: threadAD, sender_id: alice.id, text: "hi dave" })
    .select("id")
    .single();
  await svc.from("blocks").insert({ blocker_id: dave.id, blocked_id: alice.id }); // blocked AFTER the job was enqueued
  await svc.rpc("claim_push_jobs", { p_limit: 50 });
  const { data: daveJobRow } = await svc.from("push_jobs").select("status").eq("message_id", msgToDave.id).maybeSingle();
  check(
    "a block formed after enqueue but before claim suppresses delivery (status=skipped)",
    daveJobRow?.status === "skipped",
    daveJobRow
  );
  await svc.from("blocks").delete().eq("blocker_id", dave.id).eq("blocked_id", alice.id);

  // --- claim_push_jobs: real send-eligible job + concurrency + expired cleanup ---
  const eve = await makeUser("eve");
  cleanup.authUsers.push(eve.id);
  const eveClient = await sessionFor(eve.email);
  const { data: eveSubId } = await eveClient.rpc("register_push_subscription", {
    p_endpoint: FAKE_ENDPOINT("eve"),
    p_p256dh: "k",
    p_auth: "k",
  });
  const { data: threadAE } = await aliceClient.rpc("get_or_create_dm_thread", { other_user_id: eve.id });
  cleanup.threads.push(threadAE);
  await aliceClient.from("dm_messages").insert({ thread_id: threadAE, sender_id: alice.id, text: "hi eve" });

  const [c1, c2] = await Promise.all([svc.rpc("claim_push_jobs", { p_limit: 50 }), svc.rpc("claim_push_jobs", { p_limit: 50 })]);
  const claimedEve = [...(c1.data ?? []), ...(c2.data ?? [])].filter((j) => j.subscription_id === eveSubId);
  check("two concurrent claim calls never both claim the same job", claimedEve.length === 1, {
    c1err: c1.error,
    c2err: c2.error,
    claimedEve,
  });

  if (claimedEve[0]) {
    await svc.rpc("mark_push_job_failed", { p_job_id: claimedEve[0].job_id, p_error: "simulated 410 gone", p_expired: true });
    const { data: subAfterExpiry } = await svc.from("push_subscriptions").select("id").eq("id", eveSubId).maybeSingle();
    check("an expired (410-marked) subscription is deleted, not just the job", subAfterExpiry === null, subAfterExpiry);
  } else {
    check("an expired (410-marked) subscription is deleted, not just the job", false, "no job was claimed to test with");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
}

async function doCleanup() {
  for (const id of cleanup.threads) await svc.from("dm_threads").delete().eq("id", id);
  for (const id of cleanup.authUsers) await svc.auth.admin.deleteUser(id);
  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error("verify-dm-web-push.mjs crashed:", e);
    fail++;
  })
  .finally(async () => {
    await doCleanup();
    process.exit(fail > 0 ? 1 : 0);
  });
