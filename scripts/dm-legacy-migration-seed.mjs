// Seeds DM data shaped exactly like it would have existed BEFORE
// 20260917030000_dm_fixes_3.sql added last_message_id /
// user_a_last_read_message_id / user_b_last_read_message_id — i.e. this
// must be run against a database where migrations are applied only
// through 20260917020000_dm_fixes_2.sql, so those columns genuinely don't
// exist yet and every row this script writes is legacy-shaped by
// construction, not simulated by nulling columns out afterwards.
//
// Part of the "upgrading an existing populated schema" verification for
// 20260917050000_dm_fixes_5.sql's backfill (see dm-legacy-migration-verify.mjs
// and verify-dm-migration-chain.sh, which orchestrates both against a local
// Supabase instance). Local-only: uses the Supabase CLI's standard,
// publicly-documented local dev demo keys (same for every `supabase start`
// project, signed with the well-known local-only JWT secret) — never point
// this at a real project.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SEED_URL ?? "http://127.0.0.1:54321";
const ANON =
  process.env.SEED_ANON ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  process.env.SEED_SERVICE ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) {
  console.error(`Refusing to run against a non-local URL (${URL}) — this script only makes sense against a throwaway local Supabase instance.`);
  process.exit(1);
}

const stamp = Date.now();
const password = "TestPass123!legacyseed";

async function makeUser(tag) {
  const email = `legacyseed-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Legacy ${tag}`, username: `legacyseed${tag}${stamp}` },
  });
  if (error) throw error;
  await admin.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user.id);
  const client = createClient(URL, ANON);
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
 * which side initiated the call or which JS variable name it has here. */
async function roleOf(threadId, userId) {
  const { data } = await admin.from("dm_threads").select("user_a_id, user_b_id").eq("id", threadId).single();
  return data.user_a_id === userId ? "a" : "b";
}

const A = await makeUser("a");
const B = await makeUser("b");
const C = await makeUser("c");
const D = await makeUser("d");
const E = await makeUser("e");
const F = await makeUser("f");

const base = Date.now();
const ts = (offsetMs) => new Date(base + offsetMs).toISOString();

// --- Thread 1: "read" — the reader (B) has a legacy read timestamp
// strictly after the true latest message (old mark_dm_thread_read(uuid)
// always wrote now(), which is always >= any existing message's
// created_at at the time it's called). ---
const threadRead = await threadBetween(A.client, B.id);
const { data: readMsgs } = await admin
  .from("dm_messages")
  .insert([
    { thread_id: threadRead, sender_id: A.id, text: "r-1", created_at: ts(0) },
    { thread_id: threadRead, sender_id: B.id, text: "r-2", created_at: ts(1000) },
    { thread_id: threadRead, sender_id: A.id, text: "r-3", created_at: ts(2000) },
  ])
  .select("id, created_at");
const bRole = await roleOf(threadRead, B.id);
await admin.from("dm_threads").update({ [`user_${bRole}_last_read_at`]: ts(2500) }).eq("id", threadRead);

// --- Thread 2: "unread" — the reader (C) has read only through an
// EARLIER message; the true latest message must still be unread. ---
const threadUnread = await threadBetween(A.client, C.id);
const { data: unreadMsgs } = await admin
  .from("dm_messages")
  .insert([
    { thread_id: threadUnread, sender_id: A.id, text: "u-1", created_at: ts(10000) },
    { thread_id: threadUnread, sender_id: C.id, text: "u-2", created_at: ts(11000) },
    { thread_id: threadUnread, sender_id: A.id, text: "u-3 (unread)", created_at: ts(12000) },
  ])
  .select("id, created_at");
const cRole = await roleOf(threadUnread, C.id);
await admin.from("dm_threads").update({ [`user_${cRole}_last_read_at`]: ts(11500) }).eq("id", threadUnread);

// --- Thread 3: "empty" — no messages at all. ---
const threadEmpty = await threadBetween(A.client, D.id);

// --- Thread 4: "blocked" — history exists, then A blocks E. ---
const threadBlocked = await threadBetween(A.client, E.id);
const { data: blockedMsgs } = await admin
  .from("dm_messages")
  .insert([
    { thread_id: threadBlocked, sender_id: A.id, text: "b-1", created_at: ts(20000) },
    { thread_id: threadBlocked, sender_id: E.id, text: "b-2", created_at: ts(21000) },
  ])
  .select("id, created_at");
await A.client.from("blocks").insert({ blocker_id: A.id, blocked_id: E.id });

// --- Thread 5: tied latest-message timestamps, plus a legacy read marker
// landing exactly on the tied instant (the "null IDs at equal timestamps"
// case) — must resolve to the HIGHER-id message of the tie, not the lower
// one, matching the (created_at, id) ordering used everywhere else. ---
const threadTied = await threadBetween(A.client, F.id);
const tiedAt = ts(30000);
const { data: tiedMsgs } = await admin
  .from("dm_messages")
  .insert([
    { thread_id: threadTied, sender_id: A.id, text: "t-1", created_at: ts(29000) },
    { thread_id: threadTied, sender_id: A.id, text: "tie-x", created_at: tiedAt },
    { thread_id: threadTied, sender_id: F.id, text: "tie-y", created_at: tiedAt },
  ])
  .select("id, created_at");
const tiedPair = tiedMsgs.slice(1).sort((a, b) => a.id.localeCompare(b.id));
const fRole = await roleOf(threadTied, F.id);
await admin.from("dm_threads").update({ [`user_${fRole}_last_read_at`]: tiedAt }).eq("id", threadTied);

console.log(
  JSON.stringify({
    threadRead,
    threadReadRole: bRole,
    threadReadLatestId: readMsgs[readMsgs.length - 1].id,
    threadUnread,
    threadUnreadRole: cRole,
    threadUnreadMiddleId: unreadMsgs[1].id,
    threadUnreadLatestId: unreadMsgs[2].id,
    threadEmpty,
    threadBlocked,
    threadBlockedLatestId: blockedMsgs[blockedMsgs.length - 1].id,
    threadTied,
    threadTiedRole: fRole,
    threadTiedLowId: tiedPair[0].id,
    threadTiedHighId: tiedPair[1].id,
  })
);
