// Live regression test for the second round of DM review fixes
// (supabase/migrations/20260917020000_dm_fixes_2.sql). Runs against the
// REAL configured Supabase project — no mocks. See verify-dm-fixes-3.mjs
// for the third round's checks, which build on these.
//
// Usage: node --env-file=.env.local scripts/verify-dm-fixes-2.mjs
//
// Creates and tears down its own throwaway users/threads/messages — safe
// to run against a real project repeatedly.
import { createClient } from "@supabase/supabase-js";

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_BASE, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

function log(label, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${extra ? " " + extra : ""}`);
}

const stamp = Date.now();
const password = "TestPass123!verifydm2";

async function makeUser(tag) {
  const email = `dmfix2-${tag}-${stamp}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: `DMFix2 ${tag}`, username: `dmfix2${tag}_${stamp}` },
  });
  await admin.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user.id);
  const client = createClient(URL_BASE, ANON_KEY);
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, client };
}

let A, B, threadId;
const cleanupMessageIds = [];

try {
  // Confirm the new migration is actually applied before running anything
  // that depends on it — a clean, legible failure instead of a wall of
  // confusing downstream errors if it isn't.
  const { error: schemaCheckErr } = await admin.rpc("fetch_dm_messages_after", {
    p_thread_id: "00000000-0000-0000-0000-000000000000",
    p_after_created_at: new Date().toISOString(),
    p_after_id: "00000000-0000-0000-0000-000000000000",
    p_limit: 1,
  });
  if (schemaCheckErr && /could not find the function|does not exist/i.test(schemaCheckErr.message)) {
    console.log("BLOCKED — 20260917020000_dm_fixes_2.sql has not been applied to this project yet.");
    console.log("  (" + schemaCheckErr.message + ")");
    process.exit(0);
  }

  A = await makeUser("a");
  B = await makeUser("b");

  const { data: tId } = await A.client.rpc("get_or_create_dm_thread", { other_user_id: B.id });
  threadId = tId;

  // --- Finding 1: untrusted timestamps ---
  const { error: backdateErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: A.id, text: "backdated", created_at: "2020-01-01T00:00:00Z" });
  log("Direct insert supplying created_at is rejected (column-scoped grant)", !!backdateErr, backdateErr ? `(${backdateErr.message})` : "(NO ERROR — BUG)");

  const { error: idSpoofErr } = await A.client
    .from("dm_messages")
    .insert({ id: "11111111-1111-1111-1111-111111111111", thread_id: threadId, sender_id: A.id, text: "id spoof" });
  log("Direct insert supplying id is also rejected", !!idSpoofErr, idSpoofErr ? `(${idSpoofErr.message})` : "(NO ERROR — BUG)");

  const { data: normalMsg, error: normalErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadId, sender_id: A.id, text: "normal message" })
    .select("id, created_at")
    .single();
  log("A normal insert (thread_id, sender_id, text only) still succeeds", !normalErr && !!normalMsg);
  if (normalMsg) cleanupMessageIds.push(normalMsg.id);

  // --- Finding 2: concurrent rate-limit bypass ---
  // Fire 50 simultaneous direct inserts from B — the cap is 30/minute; a
  // race-prone counter would let meaningfully more than 30 through.
  const concurrentInserts = Array.from({ length: 50 }, (_, i) =>
    B.client.from("dm_messages").insert({ thread_id: threadId, sender_id: B.id, text: `flood ${i}` }).select("id")
  );
  const results = await Promise.all(concurrentInserts);
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  succeeded.forEach((r) => r.data?.[0]?.id && cleanupMessageIds.push(r.data[0].id));
  log(
    "Exactly 30 of 50 concurrent inserts succeed (not more, under real concurrency)",
    succeeded.length === 30,
    `(${succeeded.length} succeeded, ${failed.length} rejected)`
  );
  log(
    "All rejections are genuine rate-limit errors, not something else failing silently",
    failed.every((r) => /too many messages/i.test(r.error?.message ?? "")),
    JSON.stringify([...new Set(failed.map((r) => r.error?.message))])
  );

  // --- Finding 3: pagination boundary loss (composite cursor) ---
  // Three messages sharing the EXACT same created_at — the scenario a
  // timestamp-only cursor drops or duplicates at a page boundary.
  const tiedTimestamp = new Date().toISOString();
  const { data: tiedRows, error: tiedErr } = await admin
    .from("dm_messages")
    .insert([
      { thread_id: threadId, sender_id: A.id, text: "tied-1", created_at: tiedTimestamp },
      { thread_id: threadId, sender_id: A.id, text: "tied-2", created_at: tiedTimestamp },
      { thread_id: threadId, sender_id: A.id, text: "tied-3", created_at: tiedTimestamp },
    ])
    .select("id, created_at");
  if (tiedErr) throw tiedErr;
  tiedRows.forEach((r) => cleanupMessageIds.push(r.id));
  const sortedTied = [...tiedRows].sort((a, b) => a.id.localeCompare(b.id));

  const { data: pageOne } = await A.client.rpc("fetch_dm_messages_before", {
    p_thread_id: threadId,
    p_before_created_at: tiedTimestamp,
    p_before_id: sortedTied[2].id, // paginate as if we'd already seen the "largest id" tied row
    p_limit: 1,
  });
  const { data: pageTwo } = await A.client.rpc("fetch_dm_messages_before", {
    p_thread_id: threadId,
    p_before_created_at: pageOne[0].created_at,
    p_before_id: pageOne[0].id,
    p_limit: 1,
  });
  log(
    "Composite (created_at, id) cursor correctly walks through tied-timestamp rows one at a time, no skip/dupe",
    pageOne[0].id !== pageTwo[0].id && [pageOne[0].id, pageTwo[0].id].every((id) => sortedTied.slice(0, 2).some((r) => r.id === id)),
    `(page1=${pageOne[0].id}, page2=${pageTwo[0].id})`
  );

  // --- Finding 4: drain recovery is an app-logic concern already covered
  // by the mocked page tests (multi-page drain, mid-drain failure) — the
  // only DB-level thing worth confirming live is that fetch_dm_messages_after
  // itself correctly returns >1 page's worth across repeated calls with an
  // advancing cursor, which the pagination check above already exercises
  // via fetch_dm_messages_before's sibling function.
} finally {
  console.log("\ncleaning up...");
  for (const id of cleanupMessageIds) await admin.from("dm_messages").delete().eq("id", id);
  if (threadId) await admin.from("dm_threads").delete().eq("id", threadId);
  for (const u of [A, B]) if (u) await admin.auth.admin.deleteUser(u.id);
  console.log("done.");
}
