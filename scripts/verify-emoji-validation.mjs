// Direct, no-mocks verification of is_valid_reaction_emoji() and
// set_dm_reaction()'s catalogue-backed acceptance against a REAL Postgres
// instance (a table-lookup function still can't be unit-tested any other
// way — this is SQL, not JS). Defaults to local Supabase (`supabase
// start`); point SEED_URL/SEED_ANON/SEED_SERVICE at another instance to
// run elsewhere. Never run against production — this migration should
// reach it only via the normal deploy path, not this script.
//
// Usage:
//   node scripts/verify-emoji-validation.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const URL_BASE = process.env.SEED_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SEED_ANON ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  process.env.SEED_SERVICE ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(URL_BASE, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0;
let fail = 0;
function log(label, ok, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${extra ? " " + extra : ""}`);
}

const stamp = Date.now();
const password = "TestPass123!verifyemoji";

async function makeUser(tag) {
  const email = `emojiv-${tag}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `EmojiV ${tag}`, username: `emojiv${tag}${stamp}` },
  });
  if (error) throw error;
  await admin.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user.id);
  const client = createClient(URL_BASE, ANON_KEY);
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user.id, email, client };
}

let A, B, C, thread;
const cleanupUserIds = [];
const cleanupThreadIds = [];

try {
  // --- is_valid_reaction_emoji() directly, via the service role (revoked
  // from other roles — this checks the function still WORKS for the roles
  // that need it internally, not that arbitrary roles can call it). ---
  const cases = [
    // [emoji, expected, label]
    ["❤️", true, "current quick reaction: red heart + VS16"],
    ["👍", true, "current quick reaction: thumbs up (explicit catalogue supplement — see generate-emoji-catalogue.mjs)"],
    ["😂", true, "current quick reaction: face with tears of joy"],
    ["😮", true, "current quick reaction: face with open mouth"],
    ["😢", true, "current quick reaction: crying face"],
    ["🙏", true, "current quick reaction: folded hands"],
    ["👨‍👩‍👧‍👦", true, "ZWJ sequence: family (man+woman+girl+boy)"],
    ["🤝🏽", true, "skin-tone modified: handshake, medium skin tone"],
    ["👩🏽‍❤️‍💋‍👨🏿", true, "ZWJ sequence with two different skin tones: kiss"],
    ["🏳️‍🌈", true, "ZWJ sequence: rainbow flag (white flag + VS16 + ZWJ + rainbow)"],
    ["🏴󠁧󠁢󠁥󠁮󠁧󠁿", true, "subdivision flag: England (black flag + TAG sequence, U+E0000 block — the structural walker this replaced had no rule for these at all)"],
    ["🇺🇸", true, "flag: two regional indicators (US)"],
    ["🇯🇵", true, "flag: two regional indicators (Japan)"],
    ["5️⃣", true, "keycap: digit 5"],
    ["#️⃣", true, "keycap: hash"],
    ["*️⃣", true, "keycap: asterisk"],
    ["🫠", true, "recent-vintage emoji (melting face, Unicode 14.0) — present because it's in the shipped catalogue, not a range guess"],
    ["🩷", true, "recent-vintage emoji (pink heart, Unicode 15.0)"],
    [null, false, "null (handled by the column allowing NULL, not this function, but must not crash)"],
    ["", false, "empty string"],
    ["a", false, "plain ASCII letter"],
    ["x".repeat(50), false, "oversized plain text payload"],
    ["😀😀", false, "two unrelated emoji concatenated, no ZWJ"],
    ["😀🎉", false, "two different unrelated emoji concatenated, no ZWJ"],
    ["😀️😀", false, "two emoji separated only by a stray VS16, no ZWJ"],
    ["🇺🇸🇯🇵", false, "two flags concatenated (4 regional indicators) — not a valid single flag"],
    // A lone regional indicator letter ("🇺") is a real row in the same
    // data.json the picker itself reads (label: "regional indicator U",
    // no group/subgroup — likely unreachable by category browsing, but
    // not excluded from the data the catalogue is generated from). The
    // catalogue's whole design is to accept exactly what that source
    // contains, not to second-guess which of its entries "should" count
    // as a real flag — so this is correctly accepted, not a regression.
    ["🇺", true, "a single lone regional indicator letter — present in the same source data.json, so correctly accepted like everything else in it"],
    ["42", false, "bare digits outside the keycap pattern"],
    ["#", false, "a bare hash outside the keycap pattern"],
    ["<script>alert(1)</script>", false, "HTML/script injection shaped string"],
    ["😀 ", false, "emoji plus trailing whitespace"],
    [" 😀", false, "leading whitespace plus emoji"],
    ["ok 👍", false, "real text with an emoji appended"],
    ["👍".repeat(10), false, "the same emoji repeated many times, no ZWJ between any pair"],
    ["\u200d😀", false, "leading ZWJ before a single emoji — not a real sequence (the structural walker this replaced wrongly accepted this)"],
    ["😀\u200d", false, "trailing ZWJ after a single emoji — not a real sequence (ditto)"],
    ["👨‍👩‍👧‍👦😀", false, "a real ZWJ sequence with an unrelated emoji appended, no joiner between them"],
    ["👨‍🚀‍👩", false, "two well-formed-looking ZWJ-joined bases that aren't an actual defined combination — catalogue lookup rejects what the structural walker's adjacency rule alone could not distinguish from a real sequence"],
  ];

  for (const [emoji, expected, label] of cases) {
    const { data, error } = await admin.rpc("is_valid_reaction_emoji", { p_emoji: emoji });
    if (error) {
      log(label, false, `(RPC error: ${error.message})`);
      continue;
    }
    log(label, data === expected, `(got ${data}, expected ${expected})`);
  }

  // --- Every emoji the picker can actually produce, verified against the
  // real validator — not a sample, the entire generated catalogue plus its
  // quick-reaction supplement (~3980 entries), in batches to stay fast
  // without opening thousands of connections at once. ---
  const catalogueSql = readFileSync(join(root, "supabase/migrations/20260917070000_dm_reaction_emoji_validation.sql"), "utf8");
  const beginIdx = catalogueSql.indexOf("BEGIN GENERATED CATALOGUE");
  const endIdx = catalogueSql.indexOf("END GENERATED CATALOGUE");
  const catalogueBlock = catalogueSql.slice(beginIdx, endIdx);
  const catalogueEmoji = [...catalogueBlock.matchAll(/\(\s*'((?:[^'\\]|'')*)'\s*,\s*'[^']*'\s*\)/g)].map(([, e]) => e.replace(/''/g, "'"));
  if (catalogueEmoji.length < 3000) {
    log("Extracted the generated catalogue from the migration file for a full sweep", false, `(only parsed ${catalogueEmoji.length} entries — regex likely out of sync with the generator's output format)`);
  } else {
    const BATCH = 200;
    let allValid = true;
    let checked = 0;
    const failures = [];
    for (let i = 0; i < catalogueEmoji.length; i += BATCH) {
      const batch = catalogueEmoji.slice(i, i + BATCH);
      const results = await Promise.all(batch.map((e) => admin.rpc("is_valid_reaction_emoji", { p_emoji: e })));
      results.forEach((r, j) => {
        checked++;
        if (r.error || r.data !== true) {
          allValid = false;
          failures.push({ emoji: batch[j], error: r.error?.message, data: r.data });
        }
      });
    }
    log(
      `Every emoji in the generated catalogue (${checked} checked) is accepted by is_valid_reaction_emoji`,
      allValid,
      allValid ? "" : `(${failures.length} failed, first few: ${JSON.stringify(failures.slice(0, 5))})`
    );
  }

  // --- End-to-end through set_dm_reaction() as a real participant ---
  A = await makeUser("a");
  B = await makeUser("b");
  C = await makeUser("c");
  cleanupUserIds.push(A.id, B.id, C.id);
  const { data: threadId, error: threadErr } = await A.client.rpc("get_or_create_dm_thread", { other_user_id: B.id });
  if (threadErr) throw threadErr;
  thread = threadId;
  cleanupThreadIds.push(thread);

  const { data: msg, error: msgErr } = await A.client
    .from("dm_messages")
    .insert({ thread_id: thread, sender_id: A.id, text: "react to me" })
    .select("id")
    .single();
  if (msgErr) throw new Error(`setup insert failed: ${msgErr.message}`);

  const { error: familyErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "👨‍👩‍👧‍👦" });
  log("A real participant can react with a complex ZWJ family emoji via set_dm_reaction", !familyErr, familyErr?.message ?? "");

  const { data: afterFamily } = await admin.from("dm_reactions").select("emoji").eq("message_id", msg.id).eq("user_id", B.id).single();
  log("The stored emoji round-trips exactly (no mangling of the ZWJ sequence)", afterFamily?.emoji === "👨‍👩‍👧‍👦", JSON.stringify(afterFamily));

  const { error: kissErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "👩🏽‍❤️‍💋‍👨🏿" });
  log("Changing to another complex ZWJ+skin-tone sequence succeeds", !kissErr, kissErr?.message ?? "");

  const { error: junkErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "not an emoji at all" });
  log("Arbitrary text is rejected by set_dm_reaction (server boundary, not just the picker)", !!junkErr, junkErr ? `(${junkErr.message})` : "(NO ERROR — BUG)");

  const { error: concatErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "😀😀😀" });
  log("Multiple unrelated emoji submitted as one reaction is rejected", !!concatErr, concatErr ? `(${concatErr.message})` : "(NO ERROR — BUG)");

  const { error: emptyErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "" });
  log("Empty string is rejected", !!emptyErr, emptyErr ? `(${emptyErr.message})` : "(NO ERROR — BUG)");

  const { error: oversizedErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "🇺🇸".repeat(20) });
  log("An oversized payload is rejected", !!oversizedErr, oversizedErr ? `(${oversizedErr.message})` : "(NO ERROR — BUG)");

  // The one-reaction-per-participant-per-message invariant still holds
  // after this migration (unchanged by it, but worth re-confirming here).
  const { error: replaceErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "🫠" });
  const { data: rows } = await admin.from("dm_reactions").select("emoji").eq("message_id", msg.id).eq("user_id", B.id);
  log("Still exactly one row per participant per message after several changes", !replaceErr && rows?.length === 1 && rows[0].emoji === "🫠", JSON.stringify(rows));

  // --- Preserved invariants from the original migration ---
  const { error: directInsertErr } = await B.client
    .from("dm_reactions")
    .insert({ message_id: msg.id, thread_id: thread, user_id: B.id, emoji: "❤️" });
  log("Direct insert into dm_reactions is still rejected — writes only via set_dm_reaction", !!directInsertErr, directInsertErr ? `(${directInsertErr.message})` : "(NO ERROR — BUG)");

  const { data: readBack, error: readBackErr } = await B.client.from("dm_reactions").select("emoji").eq("message_id", msg.id);
  log("A participant can still read their own reaction back", !readBackErr && readBack?.some((r) => r.emoji === "🫠"), readBackErr?.message ?? "");

  const { data: outsiderRead, error: outsiderReadErr } = await C.client.from("dm_reactions").select("message_id").eq("message_id", msg.id);
  log("A non-participant still gets zero rows, not the real data", !outsiderReadErr && Array.isArray(outsiderRead) && outsiderRead.length === 0, outsiderReadErr ? `(error: ${outsiderReadErr.message})` : `(${outsiderRead?.length} rows)`);

  const { error: outsiderReactErr } = await C.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "👍" });
  log("A non-participant still cannot react", !!outsiderReactErr, outsiderReactErr ? `(${outsiderReactErr.message})` : "(NO ERROR — BUG)");

  // Blocked pair — bidirectional.
  await A.client.from("blocks").insert({ blocker_id: A.id, blocked_id: B.id });
  const { error: blockedReactErr } = await B.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "😂" });
  log("Once blocked, the blocked side cannot react", !!blockedReactErr, blockedReactErr ? `(${blockedReactErr.message})` : "(NO ERROR — BUG)");
  const { error: blockerReactErr } = await A.client.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "😂" });
  log("Once blocked, the BLOCKER side also cannot react (bidirectional enforcement)", !!blockerReactErr, blockerReactErr ? `(${blockerReactErr.message})` : "(NO ERROR — BUG)");
  await A.client.from("blocks").delete().eq("blocker_id", A.id).eq("blocked_id", B.id);

  // Concurrency-safe rate limiting across MULTIPLE threads for one sender —
  // the cap is per-user, not per-thread. Three threads, 25 seed messages
  // each (25 < enforce_dm_rate_limit's 30/minute-per-sender cap, so each
  // batch insert itself doesn't trip a DIFFERENT rate limit — the message
  // one, not the reaction one this test targets), 75 total targets so the
  // reaction cap (60/minute) genuinely gets exceeded and some real
  // rejections are guaranteed regardless of scheduling.
  const D = await makeUser("d");
  const E = await makeUser("e");
  cleanupUserIds.push(D.id, E.id);
  const threadDA = await A.client.rpc("get_or_create_dm_thread", { other_user_id: D.id }).then((r) => r.data);
  const threadDC = await C.client.rpc("get_or_create_dm_thread", { other_user_id: D.id }).then((r) => r.data);
  const threadDE = await E.client.rpc("get_or_create_dm_thread", { other_user_id: D.id }).then((r) => r.data);
  cleanupThreadIds.push(threadDA, threadDC, threadDE);
  const seedBatches = await Promise.all(
    [
      [threadDA, A.id],
      [threadDC, C.id],
      [threadDE, E.id],
    ].map(([threadId, senderId]) =>
      admin
        .from("dm_messages")
        .insert(Array.from({ length: 25 }, (_, i) => ({ thread_id: threadId, sender_id: senderId, text: `m${i}` })))
        .select("id")
    )
  );
  for (const batch of seedBatches) {
    if (batch.error) throw new Error(`rate-limit setup insert failed: ${batch.error.message}`);
  }
  const targets = seedBatches.flatMap((batch) => batch.data.map((m) => ({ id: m.id })));
  log("Seeded 75 target messages across 3 threads for the reaction rate-limit check", targets.length === 75, `(${targets.length})`);
  const results = await Promise.all(targets.map((m) => D.client.rpc("set_dm_reaction", { p_message_id: m.id, p_emoji: "🙏" })));
  const succeeded = results.filter((r) => !r.error);
  const failed = results.filter((r) => r.error);
  log(
    "Exactly 60 of 75 concurrent reactions across THREE different threads succeed (rate limit is per-user, not per-thread)",
    succeeded.length === 60,
    `(${succeeded.length} succeeded, ${failed.length} rejected)`
  );
  log("All rejections are genuine rate-limit errors", failed.every((r) => /too many reactions/i.test(r.error?.message ?? "")), JSON.stringify([...new Set(failed.map((r) => r.error?.message))]));
} catch (err) {
  console.error("\nSCRIPT ERROR (not a check failure — a setup/assertion step itself threw):", err);
  fail++;
} finally {
  console.log("\ncleaning up...");
  let cleanupFailed = false;
  for (const id of new Set(cleanupThreadIds)) {
    const { error } = await admin.from("dm_threads").delete().eq("id", id);
    if (error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting thread ${id}: ${error.message}`);
    }
  }
  for (const id of new Set(cleanupUserIds)) {
    const rr = await admin.from("dm_reaction_rate_state").delete().eq("user_id", id);
    if (rr.error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting reaction rate state for ${id}: ${rr.error.message}`);
    }
    const rl = await admin.from("dm_rate_limit_state").delete().eq("sender_id", id);
    if (rl.error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting message rate-limit state for ${id}: ${rl.error.message}`);
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      cleanupFailed = true;
      console.error(`  cleanup FAILED deleting user ${id}: ${error.message}`);
    }
  }
  if (cleanupFailed) {
    fail++;
    console.error("cleanup reported failures — see above.");
  } else {
    console.log("done.");
  }
  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}
