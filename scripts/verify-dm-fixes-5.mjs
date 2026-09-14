// Live regression test for the fourth round of DM review fixes
// (supabase/migrations/20260917050000_dm_fixes_5.sql): atomic concurrent
// read acknowledgements, atomic concurrent latest-message positioning, and
// the legacy-thread backfill (re-verified here against fresh live data;
// see scripts/verify-dm-migration-chain.sh for the from-legacy-schema
// version of that same check, which this script cannot reproduce against
// a real project — migrations 3-5 are already applied here, so there's no
// way to generate genuinely pre-migration-3 rows on this project anymore).
// Runs against the REAL configured Supabase project — no mocks.
//
// Usage: node --env-file=.env.local scripts/verify-dm-fixes-5.mjs
//
// Creates and tears down its own throwaway users/threads/messages — safe
// to run against a real project repeatedly.
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

/** Mirrors src/lib/dm.ts's isUnread() exactly — see that file if this ever
 * needs updating; kept as a plain inline copy since this is a Node script
 * with no TS import toolchain. */
function isUnread(lastMessageAt, lastMessageId, lastReadAt, lastReadId) {
  if (!lastMessageAt || !lastMessageId) return false;
  if (!lastReadAt || !lastReadId) return true;
  if (lastReadAt !== lastMessageAt) return lastReadAt < lastMessageAt;
  return lastReadId < lastMessageId;
}

const stamp = Date.now();
const password = "TestPass123!verifydm5";

async function makeUser(tag) {
  const email = `dmfix5-${tag}-${stamp}@example.com`;
  const { data } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `DMFix5 ${tag}`, username: `dmfix5${tag}_${stamp}` },
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

/** Never assume which of two users lands in user_a_id vs user_b_id —
 * get_or_create_dm_thread orders by raw UUID comparison, unrelated to
 * which side initiated the call. Always read the real row back. */
async function roleOf(threadId, userId) {
  const { data, error } = await admin.from("dm_threads").select("user_a_id, user_b_id").eq("id", threadId).single();
  if (error) throw error;
  return data.user_a_id === userId ? "a" : "b";
}

async function threadRow(threadId) {
  const { data, error } = await admin.from("dm_threads").select("*").eq("id", threadId).single();
  if (error) throw error;
  return data;
}

let A, B;
let threadAB;
const cleanupMessageIds = [];
const cleanupThreadIds = [];
const cleanupUserIds = [];

/** Finding 1, run once per participant position (both "a" and "b" get
 * exercised across the two calls this makes on the SAME thread, since A
 * and B are necessarily on opposite sides of it). Controlled-ordering
 * concurrency, not sequential calls: every mark_dm_thread_read call for a
 * given cursor set fires via Promise.all, so arrival order at the
 * database is left entirely to real network/scheduling — the assertion is
 * that the FINAL state is always the objectively latest cursor submitted,
 * which only holds if the advancement decision is atomic. */
async function runConcurrentReadAckChecks(readerClient, readerId, targetThreadId, msgPrefix) {
  const role = await roleOf(targetThreadId, readerId);
  const col = (suffix) => `user_${role}_${suffix}`;

  // --- Increasing, non-tied cursors fired concurrently ---
  const N = 8;
  const { data: seq, error: seqErr } = await admin
    .from("dm_messages")
    .insert(
      Array.from({ length: N }, (_, i) => ({
        thread_id: targetThreadId,
        sender_id: readerId,
        text: `${msgPrefix}-seq-${i}`,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      }))
    )
    .select("id, created_at");
  if (seqErr) throw new Error(`setup insert failed: ${seqErr.message}`);
  seq.forEach((m) => cleanupMessageIds.push(m.id));

  // Fire all N boundaries concurrently, in the SAME (increasing) order as
  // an array — Promise.all does not guarantee the underlying HTTP
  // requests are actually processed by Postgres in that order, which is
  // exactly the point: arrival order is uncontrolled, only the final
  // result is asserted.
  const results = await Promise.all(
    seq.map((m) =>
      readerClient.rpc("mark_dm_thread_read", {
        target_thread_id: targetThreadId,
        p_through_created_at: m.created_at,
        p_through_id: m.id,
      })
    )
  );
  log(
    `[${role}] all ${N} concurrent non-tied read-ack calls succeed (no unexpected errors)`,
    results.every((r) => !r.error),
    JSON.stringify(results.filter((r) => r.error).map((r) => r.error.message))
  );
  const afterSeq = await threadRow(targetThreadId);
  const latest = seq[seq.length - 1];
  log(
    `[${role}] final read position after concurrent increasing cursors is the objectively LATEST one submitted, regardless of arrival order`,
    afterSeq[col("last_read_message_id")] === latest.id && afterSeq[col("last_read_at")] === latest.created_at,
    `(got ${afterSeq[col("last_read_message_id")]}, expected ${latest.id})`
  );

  // --- Tied timestamps fired concurrently ---
  const tiedAt = new Date(Date.now() + 60000).toISOString();
  const { data: tiedRows, error: tiedErr } = await admin
    .from("dm_messages")
    .insert([
      { thread_id: targetThreadId, sender_id: readerId, text: `${msgPrefix}-tie-1`, created_at: tiedAt },
      { thread_id: targetThreadId, sender_id: readerId, text: `${msgPrefix}-tie-2`, created_at: tiedAt },
    ])
    .select("id, created_at");
  if (tiedErr) throw new Error(`setup insert failed: ${tiedErr.message}`);
  tiedRows.forEach((m) => cleanupMessageIds.push(m.id));
  const [lowTied, highTied] = [...tiedRows].sort((a, b) => a.id.localeCompare(b.id));

  const tiedResults = await Promise.all([
    readerClient.rpc("mark_dm_thread_read", { target_thread_id: targetThreadId, p_through_created_at: lowTied.created_at, p_through_id: lowTied.id }),
    readerClient.rpc("mark_dm_thread_read", { target_thread_id: targetThreadId, p_through_created_at: highTied.created_at, p_through_id: highTied.id }),
  ]);
  log(
    `[${role}] both concurrent tied-timestamp read-ack calls succeed`,
    tiedResults.every((r) => !r.error),
    JSON.stringify(tiedResults.filter((r) => r.error).map((r) => r.error.message))
  );
  const afterTied = await threadRow(targetThreadId);
  log(
    `[${role}] final read position after concurrent TIED cursors is always the higher-id message of the tie, regardless of which request the database processed last`,
    afterTied[col("last_read_message_id")] === highTied.id,
    `(got ${afterTied[col("last_read_message_id")]}, low=${lowTied.id}, high=${highTied.id})`
  );
}

try {
  const { error: schemaCheckErr } = await admin.rpc("backfill_dm_thread_positions");
  if (schemaCheckErr && /could not find the function|does not exist/i.test(schemaCheckErr.message)) {
    console.log("BLOCKED — 20260917050000_dm_fixes_5.sql has not been applied to this project yet.");
    console.log("  (" + schemaCheckErr.message + ")");
    console.log("Remaining step: apply supabase/migrations/20260917050000_dm_fixes_5.sql, then re-run this script.");
    process.exit(1);
  }

  A = await makeUser("a");
  B = await makeUser("b");
  cleanupUserIds.push(A.id, B.id);
  threadAB = await threadBetween(A.client, B.id);
  cleanupThreadIds.push(threadAB);

  // --- Finding 1: concurrent read acknowledgements, both positions ---
  await runConcurrentReadAckChecks(B.client, B.id, threadAB, "b-reads");
  await runConcurrentReadAckChecks(A.client, A.id, threadAB, "a-reads");

  // --- Finding 2a: latest-message position, deterministic REVERSE-ID
  // insert order at a tied timestamp. Ids are server-generated, but admin
  // (service role) can supply explicit ones, which is the only way to
  // force a specific, reproducible id ordering rather than hoping for one
  // via chance. The row inserted SECOND deliberately has the SMALLER id —
  // the old unconditional-overwrite trigger would leave last_message_id
  // pointing at the LOWER id (whichever inserted last), which is wrong
  // under the (created_at, id) ordering the rest of the schema uses. ---
  // Comfortably later than the tied-timestamp cursors runConcurrentReadAckChecks
  // already inserted above (each up to Date.now()+60000 AT THE TIME IT RAN,
  // a few hundred ms earlier) — plain new Date() here would be chronologically
  // BEFORE those already-committed rows, so this section's own messages
  // wouldn't actually be the thread's true latest and the assertion below
  // would be checking the wrong row entirely.
  const tiedLatestAt = new Date(Date.now() + 90000).toISOString();
  const highIdFirst = "ffffffff-ffff-4fff-9fff-ffffffffffff";
  const lowIdSecond = "00000000-0000-4000-9000-000000000001";
  const { error: highInsertErr } = await admin
    .from("dm_messages")
    .insert({ id: highIdFirst, thread_id: threadAB, sender_id: A.id, text: "reverse-order-high", created_at: tiedLatestAt });
  if (highInsertErr) throw new Error(`reverse-order setup (high id, inserted first) failed: ${highInsertErr.message}`);
  cleanupMessageIds.push(highIdFirst);
  const { error: lowInsertErr } = await admin
    .from("dm_messages")
    .insert({ id: lowIdSecond, thread_id: threadAB, sender_id: A.id, text: "reverse-order-low", created_at: tiedLatestAt });
  if (lowInsertErr) throw new Error(`reverse-order setup (low id, inserted second) failed: ${lowInsertErr.message}`);
  cleanupMessageIds.push(lowIdSecond);

  const afterReverseOrder = await threadRow(threadAB);
  log(
    "touch_dm_thread_on_message: inserting the LOWER-id message of a tied pair SECOND does not regress last_message_id back down to it",
    afterReverseOrder.last_message_id === highIdFirst,
    `(got ${afterReverseOrder.last_message_id}, expected ${highIdFirst})`
  );

  // --- Finding 2b: latest-message position under true concurrent inserts
  // with strictly increasing timestamps — the trigger must converge on
  // the true max regardless of which insert's trigger commits last. ---
  const concurrentBase = Date.now() + 120000;
  const concurrentInserts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      admin
        .from("dm_messages")
        .insert({ thread_id: threadAB, sender_id: A.id, text: `concurrent-latest-${i}`, created_at: new Date(concurrentBase + i * 500).toISOString() })
        .select("id, created_at")
        .single()
    )
  );
  log(
    "all 10 concurrent inserts for the latest-position race succeed",
    concurrentInserts.every((r) => !r.error),
    JSON.stringify(concurrentInserts.filter((r) => r.error).map((r) => r.error.message))
  );
  concurrentInserts.forEach((r) => r.data?.id && cleanupMessageIds.push(r.data.id));
  const sortedByTime = [...concurrentInserts].filter((r) => r.data).sort((a, b) => (a.data.created_at < b.data.created_at ? 1 : -1));
  const trueLatest = sortedByTime[0].data;
  const afterConcurrent = await threadRow(threadAB);
  log(
    "final last_message_id after 10 concurrent inserts is the objectively latest message, not whichever trigger happened to commit last",
    afterConcurrent.last_message_id === trueLatest.id,
    `(got ${afterConcurrent.last_message_id}, expected ${trueLatest.id})`
  );

  // --- Finding 2c: verify UNREAD DETECTION itself, not just the stored
  // column — a participant who read up through the pre-concurrent-batch
  // state must now show unread again given the new latest message. ---
  const readerRole = await roleOf(threadAB, B.id);
  await B.client.rpc("mark_dm_thread_read", {
    target_thread_id: threadAB,
    p_through_created_at: afterReverseOrder.last_message_at,
    p_through_id: afterReverseOrder.last_message_id,
  });
  const finalRow = await threadRow(threadAB);
  const bUnread = isUnread(
    finalRow.last_message_at,
    finalRow.last_message_id,
    finalRow[`user_${readerRole}_last_read_at`],
    finalRow[`user_${readerRole}_last_read_message_id`]
  );
  log(
    "isUnread() correctly reports B as unread once a real, later message exists beyond what they've read — not just a stored-column check",
    bUnread === true
  );
} catch (err) {
  console.error("\nSCRIPT ERROR (not a check failure — a setup/assertion step itself threw):", err);
  fail++;
} finally {
  console.log("\ncleaning up...");
  let cleanupFailed = false;
  for (const id of cleanupMessageIds) {
    const { error } = await admin.from("dm_messages").delete().eq("id", id);
    if (error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting message ${id}: ${error.message}`);
    }
  }
  for (const id of cleanupThreadIds) {
    const { error } = await admin.from("dm_threads").delete().eq("id", id);
    if (error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting thread ${id}: ${error.message}`);
    }
  }
  for (const id of cleanupUserIds) {
    const rl = await admin.from("dm_rate_limit_state").delete().eq("sender_id", id);
    if (rl.error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting rate-limit state for ${id}: ${rl.error.message}`);
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting user ${id}: ${error.message}`);
    }
  }
  if (cleanupFailed) {
    fail++;
    console.error("cleanup reported failures — see above (test data may still be lingering on this project).");
  } else {
    console.log("done.");
  }
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}
