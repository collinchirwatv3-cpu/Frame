// Live regression test for supabase/migrations/20260917060000_dm_replies_reactions.sql:
// reply-to constraints (same-thread only, no self-reply, restricted insert
// column), reaction RLS (participant-only read, no direct writes), and
// set_dm_reaction's atomic rate limiting under real concurrency. Runs
// against whichever Supabase project NEXT_PUBLIC_SUPABASE_URL points at —
// no mocks. Pass SEED_URL/SEED_ANON/SEED_SERVICE to point at a local
// instance instead (see scripts/verify-dm-migration-chain.sh's pattern);
// otherwise falls back to reading .env.local's real project vars directly.
//
// Usage:
//   node --env-file=.env.local scripts/verify-dm-reactions-replies.mjs
//   SEED_URL=http://127.0.0.1:54321 SEED_ANON=... SEED_SERVICE=... node scripts/verify-dm-reactions-replies.mjs
//
// Creates and tears down its own throwaway users/threads/messages — safe
// to run against a real project repeatedly.
import { createClient } from "@supabase/supabase-js";

const URL_BASE = process.env.SEED_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SEED_ANON ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SEED_SERVICE ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (or SEED_* equivalents)");
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
const password = "TestPass123!verifyreact";

async function makeUser(tag) {
  const email = `dmreact-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `DMReact ${tag}`, username: `dmreact${tag}${stamp}` },
  });
  if (error) throw error;
  await admin.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user.id);
  const client = createClient(URL_BASE, ANON_KEY);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, email, client };
}

async function threadBetween(client, otherId) {
  const { data, error } = await client.rpc("get_or_create_dm_thread", { other_user_id: otherId });
  if (error) throw error;
  return data;
}

let A, B, C, threadAB, threadAC;
const cleanupThreadIds = [];
const cleanupUserIds = [];
const cleanupRateStateIds = [];

try {
  const { error: schemaCheckErr } = await admin.from("dm_reactions").select("message_id").limit(1);
  if (schemaCheckErr && /does not exist/i.test(schemaCheckErr.message)) {
    console.log("BLOCKED — 20260917060000_dm_replies_reactions.sql has not been applied to this project yet.");
    console.log("  (" + schemaCheckErr.message + ")");
    process.exit(1);
  }

  A = await makeUser("a");
  B = await makeUser("b");
  C = await makeUser("c");
  cleanupUserIds.push(A.id, B.id, C.id);

  threadAB = await threadBetween(A.client, B.id);
  cleanupThreadIds.push(threadAB);
  threadAC = await threadBetween(A.client, C.id);
  cleanupThreadIds.push(threadAC);

  // --- Reply constraints ---
  const { data: msg1, error: msg1Err } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: A.id, text: "first" })
    .select("id, created_at")
    .single();
  if (msg1Err) throw new Error(`setup insert failed: ${msg1Err.message}`);

  const { data: reply1, error: reply1Err } = await B.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: B.id, text: "a real reply", reply_to_id: msg1.id })
    .select("id, reply_to_id")
    .single();
  log("A reply to a real message in the same thread succeeds", !reply1Err && reply1?.reply_to_id === msg1.id, reply1Err?.message ?? "");

  const { error: selfReplyErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: A.id, text: "self reply" })
    .select("id")
    .single()
    .then(async ({ data }) => {
      if (!data) return { error: new Error("setup insert failed") };
      return admin.from("dm_messages").update({ reply_to_id: data.id }).eq("id", data.id);
    });
  log(
    "A message cannot reply to itself (dm_messages_reply_not_self)",
    !!selfReplyErr,
    selfReplyErr ? `(${selfReplyErr.message})` : "(NO ERROR — BUG)"
  );

  const { data: otherThreadMsg, error: otherThreadMsgErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAC, sender_id: A.id, text: "lives in a different thread" })
    .select("id")
    .single();
  if (otherThreadMsgErr) throw new Error(`setup insert failed: ${otherThreadMsgErr.message}`);

  const { error: crossThreadReplyErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: A.id, text: "cross-thread reply attempt", reply_to_id: otherThreadMsg.id });
  log(
    "A reply cannot target a message from a DIFFERENT thread (composite FK dm_messages_reply_same_thread)",
    !!crossThreadReplyErr,
    crossThreadReplyErr ? `(${crossThreadReplyErr.message})` : "(NO ERROR — BUG: cross-thread reply spoofing possible)"
  );

  const { error: extraColumnErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: threadAB, sender_id: A.id, text: "trying to backdate via insert", reply_to_id: msg1.id, created_at: "2020-01-01T00:00:00Z" });
  log(
    "The restricted insert grant still rejects created_at even with reply_to_id present",
    !!extraColumnErr,
    extraColumnErr ? `(${extraColumnErr.message})` : "(NO ERROR — BUG)"
  );

  // --- Reaction RLS: participant-only read, no direct writes ---
  const { error: directInsertErr } = await B.client
    .from("dm_reactions")
    .insert({ message_id: msg1.id, thread_id: threadAB, user_id: B.id, emoji: "❤️" });
  log(
    "Direct insert into dm_reactions is rejected — writes only via set_dm_reaction",
    !!directInsertErr,
    directInsertErr ? `(${directInsertErr.message})` : "(NO ERROR — BUG)"
  );

  const { error: setReactionErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg1.id, p_emoji: "❤️" });
  log("set_dm_reaction succeeds for a real participant on a real message", !setReactionErr, setReactionErr?.message ?? "");

  const { data: readBack, error: readBackErr } = await B.client
    .from("dm_reactions")
    .select("message_id, user_id, emoji")
    .eq("message_id", msg1.id);
  log(
    "A participant can read the reaction back",
    !readBackErr && readBack?.some((r) => r.user_id === B.id && r.emoji === "❤️"),
    readBackErr?.message ?? ""
  );

  const { data: outsiderRead, error: outsiderReadErr } = await C.client
    .from("dm_reactions")
    .select("message_id")
    .eq("message_id", msg1.id);
  log(
    "A non-participant (C) reading the same reaction gets zero rows, not an error or the real data",
    !outsiderReadErr && Array.isArray(outsiderRead) && outsiderRead.length === 0,
    outsiderReadErr ? `(error: ${outsiderReadErr.message})` : `(${outsiderRead?.length} rows)`
  );

  const { error: outsiderReactErr } = await C.client.rpc("set_dm_reaction", { p_message_id: msg1.id, p_emoji: "👍" });
  log(
    "A non-participant (C) cannot react to a message in someone else's thread",
    !!outsiderReactErr,
    outsiderReactErr ? `(${outsiderReactErr.message})` : "(NO ERROR — BUG)"
  );

  const { error: invalidEmojiErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg1.id, p_emoji: "🍕" });
  log(
    "An emoji outside the fixed set is rejected",
    !!invalidEmojiErr,
    invalidEmojiErr ? `(${invalidEmojiErr.message})` : "(NO ERROR — BUG)"
  );

  // --- Reaction toggling: idempotent set, then null "removes" without a
  // real DELETE (see the migration's own comment on why). ---
  const { error: changeErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg1.id, p_emoji: "👍" });
  const { data: afterChange } = await admin.from("dm_reactions").select("emoji").eq("message_id", msg1.id).eq("user_id", B.id).single();
  log("Changing an existing reaction updates the emoji in place", !changeErr && afterChange?.emoji === "👍", changeErr?.message ?? "");

  const { error: removeErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg1.id, p_emoji: null });
  const { data: afterRemove } = await admin.from("dm_reactions").select("emoji").eq("message_id", msg1.id).eq("user_id", B.id).single();
  log(
    "Removing a reaction (null emoji) writes null rather than deleting the row",
    !removeErr && afterRemove !== null && afterRemove.emoji === null,
    removeErr?.message ?? JSON.stringify(afterRemove)
  );

  // --- Blocked pair cannot react ---
  await A.client.from("blocks").insert({ blocker_id: A.id, blocked_id: B.id });
  const { error: blockedReactErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg1.id, p_emoji: "😂" });
  log(
    "Once blocked, the other side can no longer react in that thread",
    !!blockedReactErr,
    blockedReactErr ? `(${blockedReactErr.message})` : "(NO ERROR — BUG)"
  );
  await A.client.from("blocks").delete().eq("blocker_id", A.id).eq("blocked_id", B.id);

  // --- Rate limiting: controlled concurrency, not sequential calls.
  // Cap is 60/minute; fire 90 concurrent calls from a fresh sender (D) and
  // confirm the atomic upsert-in-WHERE-clause holds the line under real
  // concurrency, the same class of check the message-rate-limit fix
  // needed (20260917020000_dm_fixes_2.sql). ---
  const D = await makeUser("d");
  cleanupUserIds.push(D.id);
  const threadAD = await threadBetween(A.client, D.id);
  cleanupThreadIds.push(threadAD);
  // Round-robined across 4 senders, not just A — enforce_dm_rate_limit
  // (the MESSAGE rate limiter, a separate cap from the one being tested
  // here) trips at 30/minute per sender_id, and a single admin batch
  // insert is one atomic statement: tripping it here would roll back all
  // 90 rows, not just fail the ones past 30.
  const senders = [A.id, B.id, C.id, D.id];
  const { data: rateMsgs, error: rateMsgsErr } = await admin
    .from("dm_messages")
    .insert(Array.from({ length: 90 }, (_, i) => ({ thread_id: threadAD, sender_id: senders[i % senders.length], text: `r${i}` })))
    .select("id");
  if (rateMsgsErr) throw new Error(`rate-limit setup insert failed: ${rateMsgsErr.message}`);
  cleanupRateStateIds.push(D.id);

  const rateResults = await Promise.all(rateMsgs.map((m) => D.client.rpc("set_dm_reaction", { p_message_id: m.id, p_emoji: "🙏" })));
  const rateSucceeded = rateResults.filter((r) => !r.error);
  const rateFailed = rateResults.filter((r) => r.error);
  log(
    "Exactly 60 of 90 concurrent reaction calls succeed (not more, under real concurrency)",
    rateSucceeded.length === 60,
    `(${rateSucceeded.length} succeeded, ${rateFailed.length} rejected)`
  );
  log(
    "All rejections are genuine rate-limit errors",
    rateFailed.every((r) => /too many reactions/i.test(r.error?.message ?? "")),
    JSON.stringify([...new Set(rateFailed.map((r) => r.error?.message))])
  );
} catch (err) {
  console.error("\nSCRIPT ERROR (not a check failure — a setup/assertion step itself threw):", err);
  fail++;
} finally {
  console.log("\ncleaning up...");
  let cleanupFailed = false;
  // Threads first, not individual messages: dm_messages.thread_id cascades
  // on thread deletion, which removes a reply and the message it targets
  // together in one operation — deleting messages one at a time in a
  // separate loop can hit dm_messages_reply_same_thread's FK if a parent
  // happens to be removed before a reply that still points to it.
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
    const rr = await admin.from("dm_reaction_rate_state").delete().eq("user_id", id);
    if (rr.error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting reaction rate state for ${id}: ${rr.error.message}`);
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
