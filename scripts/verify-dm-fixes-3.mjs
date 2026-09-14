// Live regression test for the third round of DM review fixes
// (supabase/migrations/20260917030000_dm_fixes_3.sql, plus a few checks
// that re-verify round 2's fixes are still intact under it). Runs against
// the REAL configured Supabase project — no mocks, matching this project's
// standing rule that RLS/grant/trigger behavior is only ever trusted once
// it's been exercised with a real request, not read off the migration file.
//
// Usage: node --env-file=.env.local scripts/verify-dm-fixes-3.mjs
//
// Creates and tears down its own throwaway users/threads/messages — safe
// to run against a real project repeatedly. Requires
// 20260917000000_direct_messages.sql, 20260917010000_dm_fixes.sql,
// 20260917020000_dm_fixes_2.sql, and 20260917030000_dm_fixes_3.sql to all
// be applied already; exits early with a clear message (not a wall of
// confusing downstream errors) if the round-3 migration specifically isn't.
import { createClient } from "@supabase/supabase-js";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const admin = createClient(URL_BASE, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0;
let fail = 0;
function log(label, ok, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${extra ? " " + extra : ""}`);
}

const stamp = Date.now();
const password = "TestPass123!verifydm3";

async function makeUser(tag) {
  const email = `dmfix3-${tag}-${stamp}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `DMFix3 ${tag}`, username: `dmfix3${tag}_${stamp}` },
  });
  await admin.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user.id);
  const client = createClient(URL_BASE, ANON_KEY);
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, client };
}

async function threadBetween(client, otherId) {
  const { data, error } = await client.rpc("get_or_create_dm_thread", { other_user_id: otherId });
  if (error) throw error;
  return data;
}

let A, B, C, threadAB, threadAC;
const cleanupMessageIds = [];
const cleanupThreadIds = [];
const cleanupUserIds = [];

try {
  // Guard: confirm the round-3 migration is actually applied before running
  // anything that depends on it.
  const { error: schemaCheckErr } = await admin
    .from("dm_threads")
    .select("last_message_id, user_a_last_read_message_id, user_b_last_read_message_id")
    .limit(1);
  if (schemaCheckErr && /does not exist/i.test(schemaCheckErr.message)) {
    console.log("BLOCKED — 20260917030000_dm_fixes_3.sql has not been applied to this project yet.");
    console.log("  (" + schemaCheckErr.message + ")");
    console.log("Remaining step: apply supabase/migrations/20260917020000_dm_fixes_2.sql and");
    console.log("20260917030000_dm_fixes_3.sql (in that order) to this project, then re-run this script.");
    process.exit(0);
  }

  A = await makeUser("a");
  B = await makeUser("b");
  C = await makeUser("c");
  cleanupUserIds.push(A.id, B.id, C.id);

  threadAB = await threadBetween(A.client, B.id);
  cleanupThreadIds.push(threadAB);

  // --- Restricted insert columns (round 2, re-verified under round 3) ---
  const { error: backdateErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: A.id, text: "backdated", created_at: "2020-01-01T00:00:00Z" });
  log(
    "Direct insert supplying created_at is rejected (column-scoped grant)",
    !!backdateErr,
    backdateErr ? `(${backdateErr.message})` : "(NO ERROR — BUG)"
  );

  const { data: normalMsg, error: normalErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: A.id, text: "normal message" })
    .select("id, created_at")
    .single();
  log(
    "The exact insert shape /api/dm/messages performs (thread_id, sender_id, text only) still succeeds under the restricted grant",
    !normalErr && !!normalMsg,
    normalErr ? `(${normalErr.message})` : ""
  );
  if (normalMsg) cleanupMessageIds.push(normalMsg.id);

  // --- Concurrent rate enforcement ACROSS threads (round 3: the app-level
  // and DB-level limiters are both keyed on sender_id alone, not per-thread
  // — a second thread must NOT grant a second, independent 30-message
  // budget). ---
  threadAC = await threadBetween(A.client, C.id);
  cleanupThreadIds.push(threadAC);

  const acrossThreadsInserts = [
    ...Array.from({ length: 25 }, (_, i) =>
      A.client.from("dm_messages").insert({ thread_id: threadAB, sender_id: A.id, text: `ab-flood ${i}` }).select("id")
    ),
    ...Array.from({ length: 25 }, (_, i) =>
      A.client.from("dm_messages").insert({ thread_id: threadAC, sender_id: A.id, text: `ac-flood ${i}` }).select("id")
    ),
  ];
  const acrossResults = await Promise.all(acrossThreadsInserts);
  const acrossSucceeded = acrossResults.filter((r) => !r.error);
  const acrossFailed = acrossResults.filter((r) => r.error);
  acrossSucceeded.forEach((r) => r.data?.[0]?.id && cleanupMessageIds.push(r.data[0].id));
  log(
    "The 30/minute cap is enforced in aggregate across two different threads from the same sender, not 30 per thread",
    acrossSucceeded.length <= 30 - 1, // minus the 1 "normal message" already sent above in threadAB
    `(${acrossSucceeded.length} of 50 succeeded across both threads, ${acrossFailed.length} rejected)`
  );
  log(
    "All rejections from the cross-thread flood are genuine rate-limit errors",
    acrossFailed.every((r) => /too many messages/i.test(r.error?.message ?? "")),
    JSON.stringify([...new Set(acrossFailed.map((r) => r.error?.message))])
  );

  // --- Concurrent thread creation (round 1 fix, re-verified: the upsert
  // must converge two racing callers onto the SAME thread row, never a
  // duplicate-key error and never two distinct threads for one pair). ---
  const D = await makeUser("d");
  cleanupUserIds.push(D.id);
  const concurrentThreadCalls = Array.from({ length: 10 }, () => threadBetween(A.client, D.id));
  const concurrentThreadIds = await Promise.all(concurrentThreadCalls);
  cleanupThreadIds.push(concurrentThreadIds[0]);
  log(
    "10 concurrent get_or_create_dm_thread calls for the same pair all converge on one thread id",
    new Set(concurrentThreadIds).size === 1,
    `(${new Set(concurrentThreadIds).size} distinct id(s))`
  );

  // --- Pagination authorization: fetch_dm_messages_after/before are
  // security invoker, not a new authorization layer — a user who is NOT a
  // participant in threadAB must get zero rows back, never that thread's
  // real messages and never an error that would distinguish "exists but
  // not yours" from "doesn't exist." ---
  const { data: outsiderAfter, error: outsiderAfterErr } = await C.client.rpc("fetch_dm_messages_after", {
    p_thread_id: threadAB,
    p_after_created_at: "2000-01-01T00:00:00Z",
    p_after_id: "00000000-0000-0000-0000-000000000000",
    p_limit: 50,
  });
  log(
    "fetch_dm_messages_after returns zero rows for a thread the caller isn't part of (RLS invoker enforced)",
    !outsiderAfterErr && Array.isArray(outsiderAfter) && outsiderAfter.length === 0,
    outsiderAfterErr ? `(error: ${outsiderAfterErr.message})` : `(${outsiderAfter?.length} rows)`
  );

  const { data: memberAfter, error: memberAfterErr } = await A.client.rpc("fetch_dm_messages_after", {
    p_thread_id: threadAB,
    p_after_created_at: "2000-01-01T00:00:00Z",
    p_after_id: "00000000-0000-0000-0000-000000000000",
    p_limit: 50,
  });
  log(
    "The same call from an actual participant returns real rows (the zero-rows result above is authorization, not a broken RPC)",
    !memberAfterErr && Array.isArray(memberAfter) && memberAfter.length > 0
  );

  // --- Read-boundary enforcement (round 3's core fix) ---
  // Via admin with sender_id: B.id, not A — A's own budget is already
  // exhausted by the cross-thread flood above (by design, to prove the cap
  // holds), and enforce_dm_rate_limit fires on every insert regardless of
  // caller role (it's a plain BEFORE INSERT trigger keyed on sender_id,
  // not an RLS check), so an admin-performed insert still attributed to A
  // would be rejected too. B hasn't sent anything, so it isn't limited —
  // and the read-boundary logic being tested here doesn't care who sent
  // the message, only that it's real.
  const { data: realMsg, error: realMsgErr } = await admin
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: B.id, text: "read-boundary target" })
    .select("id, created_at")
    .single();
  if (realMsgErr) throw new Error(`setup insert for read-boundary checks failed: ${realMsgErr.message}`);
  cleanupMessageIds.push(realMsg.id);

  const { error: fakeBoundaryErr } = await B.client.rpc("mark_dm_thread_read", {
    target_thread_id: threadAB,
    p_through_created_at: new Date().toISOString(),
    p_through_id: "00000000-0000-0000-0000-000000000000",
  });
  log(
    "mark_dm_thread_read rejects a boundary that doesn't name a real message in this thread",
    !!fakeBoundaryErr,
    fakeBoundaryErr ? `(${fakeBoundaryErr.message})` : "(NO ERROR — BUG: a client could claim to have read a message that doesn't exist)"
  );

  const { error: realBoundaryErr } = await B.client.rpc("mark_dm_thread_read", {
    target_thread_id: threadAB,
    p_through_created_at: realMsg.created_at,
    p_through_id: realMsg.id,
  });
  log("mark_dm_thread_read accepts a boundary naming a real message in this thread", !realBoundaryErr, realBoundaryErr?.message ?? "");

  const { data: afterRealRead } = await admin
    .from("dm_threads")
    .select("user_a_last_read_message_id, user_b_last_read_message_id")
    .eq("id", threadAB)
    .single();
  log(
    "The read call from B only advances B's own read column, never A's (caller-only)",
    afterRealRead.user_b_last_read_message_id === realMsg.id && afterRealRead.user_a_last_read_message_id !== realMsg.id
  );

  // Monotonic: a stale, earlier boundary must not regress what's recorded.
  const { data: earlierMsg } = await admin
    .from("dm_messages")
    .select("id, created_at")
    .eq("thread_id", threadAB)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  await B.client.rpc("mark_dm_thread_read", {
    target_thread_id: threadAB,
    p_through_created_at: earlierMsg.created_at,
    p_through_id: earlierMsg.id,
  });
  const { data: afterStaleRead } = await admin
    .from("dm_threads")
    .select("user_b_last_read_message_id")
    .eq("id", threadAB)
    .single();
  log(
    "A stale (earlier) read boundary is a no-op — read progress never regresses",
    afterStaleRead.user_b_last_read_message_id === realMsg.id,
    `(still ${afterStaleRead.user_b_last_read_message_id})`
  );

  // Tied timestamps + concurrent commits: two messages at the EXACT same
  // created_at (round 3's brief explicitly calls out ties, not just
  // sequential messages) — marking read through the first of the pair must
  // not count the second as read.
  const tiedTimestamp = new Date(Date.now() + 60000).toISOString();
  const { data: tiedRows, error: tiedRowsErr } = await admin
    .from("dm_messages")
    .insert([
      { thread_id: threadAB, sender_id: B.id, text: "tied-x", created_at: tiedTimestamp },
      { thread_id: threadAB, sender_id: B.id, text: "tied-y", created_at: tiedTimestamp },
    ])
    .select("id, created_at");
  if (tiedRowsErr) throw new Error(`setup insert for tied-timestamp checks failed: ${tiedRowsErr.message}`);
  tiedRows.forEach((r) => cleanupMessageIds.push(r.id));
  const [first, second] = [...tiedRows].sort((a, b) => a.id.localeCompare(b.id));

  await B.client.rpc("mark_dm_thread_read", {
    target_thread_id: threadAB,
    p_through_created_at: first.created_at,
    p_through_id: first.id,
  });
  const { data: afterTiedFirst } = await admin
    .from("dm_threads")
    .select("user_b_last_read_message_id")
    .eq("id", threadAB)
    .single();
  log(
    "Marking read through the FIRST of a tied-timestamp pair does not also count the second as read",
    afterTiedFirst.user_b_last_read_message_id === first.id
  );

  const { error: secondBoundaryErr } = await B.client.rpc("mark_dm_thread_read", {
    target_thread_id: threadAB,
    p_through_created_at: second.created_at,
    p_through_id: second.id,
  });
  const { data: afterTiedSecond } = await admin
    .from("dm_threads")
    .select("user_b_last_read_message_id")
    .eq("id", threadAB)
    .single();
  log(
    "Explicitly advancing through the SECOND of the tied pair now succeeds and does advance",
    !secondBoundaryErr && afterTiedSecond.user_b_last_read_message_id === second.id
  );
} catch (err) {
  // Surfaced explicitly rather than left to propagate past the finally
  // block below: process.exit() in finally would otherwise terminate the
  // process before an exception thrown here ever got printed, silently
  // truncating the pass/fail log with no indication anything went wrong.
  console.error("\nSCRIPT ERROR (not a check failure — a setup/assertion step itself threw):", err);
  fail++;
} finally {
  console.log("\ncleaning up...");
  for (const id of cleanupMessageIds) await admin.from("dm_messages").delete().eq("id", id);
  for (const id of cleanupThreadIds) await admin.from("dm_threads").delete().eq("id", id);
  for (const id of cleanupUserIds) {
    await admin.from("dm_rate_limit_state").delete().eq("sender_id", id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log("done.");
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}
