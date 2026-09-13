// Live concurrency test for claim_and_notify_due_parties()
// (supabase/migrations/20260914130000_atomic_party_notification_claim.sql).
// A vitest mock cannot prove real Postgres row-locking behavior — this
// fires two genuinely concurrent RPC calls at the real database and
// confirms `for update skip locked` actually prevents a double-send, which
// is the entire point of that migration.
//
// Usage: node --env-file=.env.local scripts/verify-rls-party-notifications.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
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

async function makeUser(label) {
  const email = `verify-party-notif-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data } = await svc.auth.admin.createUser({ email, email_confirm: true });
  return data.user.id;
}

const cleanup = { authUsers: [], parties: [], notifications: [] };

async function main() {
  const host = await makeUser("host");
  cleanup.authUsers.push(host);
  const followerIds = [];
  for (let i = 0; i < 3; i++) {
    const id = await makeUser(`follower-${i}`);
    cleanup.authUsers.push(id);
    followerIds.push(id);
  }
  await new Promise((r) => setTimeout(r, 1500)); // handle_new_user trigger

  await svc.from("follows").insert(followerIds.map((follower_id) => ({ follower_id, followee_id: host })));

  const { data: video } = await svc.from("videos").select("id").eq("visibility", "public").limit(1).single();

  const { data: party } = await svc
    .from("watch_parties")
    .insert({
      host_id: host,
      title: "verify-party-notifications — will be deleted",
      video_id: video.id,
      scheduled_at: new Date(Date.now() - 60_000).toISOString(), // already due
      repeat_rule: "none",
      last_notified_at: null,
    })
    .select("id")
    .single();
  cleanup.parties.push(party.id);

  // --- Fire two concurrent claim calls, exactly like an overlapping cron retry ---
  const [r1, r2] = await Promise.all([
    svc.rpc("claim_and_notify_due_parties"),
    svc.rpc("claim_and_notify_due_parties"),
  ]);

  if (r1.error) console.error("call 1 error:", r1.error.message);
  if (r2.error) console.error("call 2 error:", r2.error.message);

  const claimedByEither = [...(r1.data ?? []), ...(r2.data ?? [])].filter((row) => row.party_id === party.id);
  check("exactly one of the two concurrent calls claimed the party", claimedByEither.length === 1, {
    claimedByEither,
  });

  const { data: notifications } = await svc
    .from("notifications")
    .select("id, recipient_id")
    .eq("party_id", party.id);
  cleanup.notifications.push(...(notifications ?? []).map((n) => n.id));
  check(
    "exactly one notification per follower was created (no duplicates)",
    (notifications?.length ?? -1) === followerIds.length,
    { notifications, expected: followerIds.length }
  );

  const { data: afterParty } = await svc.from("watch_parties").select("last_notified_at").eq("id", party.id).single();
  check("last_notified_at was set exactly once", afterParty.last_notified_at !== null);

  // A third call, now that the party is no longer due, must claim nothing.
  const { data: thirdCall } = await svc.rpc("claim_and_notify_due_parties");
  const claimedAgain = (thirdCall ?? []).filter((row) => row.party_id === party.id);
  check("a subsequent call does not re-notify an already-notified 'none' party", claimedAgain.length === 0, {
    claimedAgain,
  });

  console.log(`\n${pass} passed, ${fail} failed`);
}

async function doCleanup() {
  for (const id of cleanup.notifications) await svc.from("notifications").delete().eq("id", id);
  for (const id of cleanup.parties) await svc.from("watch_parties").delete().eq("id", id);
  for (const id of cleanup.authUsers) await svc.auth.admin.deleteUser(id);
  console.log("cleanup done");
}

main()
  .catch((e) => {
    console.error("verify-rls-party-notifications.mjs crashed:", e);
    fail++;
  })
  .finally(async () => {
    await doCleanup();
    process.exit(fail > 0 ? 1 : 0);
  });
