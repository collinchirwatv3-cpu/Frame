// Verifies 20260917050000_dm_fixes_5.sql's backfill_dm_thread_positions()
// against the legacy-shaped data dm-legacy-migration-seed.mjs writes —
// run this AFTER applying 20260917030000_dm_fixes_3.sql through
// 20260917050000_dm_fixes_5.sql on top of that seeded data (see
// verify-dm-migration-chain.sh, which orchestrates the whole sequence).
// Local-only, same as the seed script.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SEED_URL ?? "http://127.0.0.1:54321";
const SERVICE =
  process.env.SEED_SERVICE ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) {
  console.error(`Refusing to run against a non-local URL (${URL}).`);
  process.exit(1);
}

const expectedRaw = process.env.SEED_RESULT;
if (!expectedRaw) {
  console.error("Missing SEED_RESULT — pass the JSON line dm-legacy-migration-seed.mjs printed.");
  process.exit(1);
}
const expected = JSON.parse(expectedRaw);

let pass = 0;
let fail = 0;
function check(label, ok, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${extra ? " " + extra : ""}`);
}

/** Mirrors src/lib/dm.ts's isUnread() exactly — kept in sync deliberately,
 * not imported, since this is a plain Node script with no TS toolchain.
 * If dm.ts's version changes, update this alongside it. */
function isUnread(lastMessageAt, lastMessageId, lastReadAt, lastReadId) {
  if (!lastMessageAt || !lastMessageId) return false;
  if (!lastReadAt || !lastReadId) return true;
  if (lastReadAt !== lastMessageAt) return lastReadAt < lastMessageAt;
  return lastReadId < lastMessageId;
}

async function row(id) {
  const { data, error } = await admin.from("dm_threads").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

try {
  {
    const t = await row(expected.threadRead);
    check("read-thread: last_message_id backfilled to the true latest message", t.last_message_id === expected.threadReadLatestId, `(${t.last_message_id})`);
    const col = `user_${expected.threadReadRole}_last_read_message_id`;
    check("read-thread: reader's last_read_message_id backfilled to that same latest message", t[col] === expected.threadReadLatestId);
    const unread = isUnread(t.last_message_at, t.last_message_id, t[`user_${expected.threadReadRole}_last_read_at`], t[col]);
    check("read-thread: isUnread() correctly reports READ (false), not just correct columns", unread === false);
  }

  {
    const t = await row(expected.threadUnread);
    check("unread-thread: last_message_id backfilled to the true latest message", t.last_message_id === expected.threadUnreadLatestId);
    const col = `user_${expected.threadUnreadRole}_last_read_message_id`;
    check("unread-thread: reader's last_read_message_id backfilled to the MIDDLE message, not the latest", t[col] === expected.threadUnreadMiddleId, `(${t[col]})`);
    const unread = isUnread(t.last_message_at, t.last_message_id, t[`user_${expected.threadUnreadRole}_last_read_at`], t[col]);
    check("unread-thread: isUnread() correctly reports UNREAD (true) — the actual point of this migration", unread === true);
  }

  {
    const t = await row(expected.threadEmpty);
    check("empty-thread: last_message_id stays null (no messages to backfill from)", t.last_message_id === null);
    check("empty-thread: last_message_at stays null", t.last_message_at === null);
    const unread = isUnread(t.last_message_at, t.last_message_id, t.user_a_last_read_at, t.user_a_last_read_message_id);
    check("empty-thread: isUnread() reports false, not a crash or a fabricated unread state", unread === false);
  }

  {
    const t = await row(expected.threadBlocked);
    check("blocked-thread: last_message_id backfilled despite the block", t.last_message_id === expected.threadBlockedLatestId);
  }

  {
    const t = await row(expected.threadTied);
    check(
      "tied-thread: last_message_id backfilled to the higher-id message of the final tied pair",
      t.last_message_id === expected.threadTiedHighId,
      `(${t.last_message_id})`
    );
    const col = `user_${expected.threadTiedRole}_last_read_message_id`;
    check(
      "tied-thread: a read marker landing exactly on a tied timestamp resolves to the HIGH-id message, not the low one",
      t[col] === expected.threadTiedHighId,
      `(${t[col]}, high=${expected.threadTiedHighId}, low=${expected.threadTiedLowId})`
    );
  }

  {
    const before = await row(expected.threadRead);
    const { error } = await admin.rpc("backfill_dm_thread_positions");
    check("backfill_dm_thread_positions is callable a second time without error", !error, error?.message ?? "");
    const after = await row(expected.threadRead);
    check(
      "re-running the backfill is a true no-op on already-backfilled data",
      after.last_message_id === before.last_message_id &&
        after.user_a_last_read_message_id === before.user_a_last_read_message_id &&
        after.user_b_last_read_message_id === before.user_b_last_read_message_id
    );
  }
} catch (err) {
  console.error("SCRIPT ERROR:", err);
  fail++;
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
