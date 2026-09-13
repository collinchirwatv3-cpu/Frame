import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The first scheduled/cron job in this repo. CRON_SECRET (not a
// project-invented name) is Vercel's own convention: when an env var
// literally named CRON_SECRET is set, Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on requests it makes to the paths
// listed in vercel.json's `crons` array — no custom header wiring needed
// on the platform side, just checking for it here.
//
// NOT CURRENTLY WIRED UP: vercel.json's crons entry for this route was
// removed because the project is on Vercel's Hobby plan, which only allows
// once-daily cron jobs — the */5 * * * * cadence this was built for needs
// either a Pro plan, a once-daily cadence (real, disclosed limitation:
// "starts now" reminders could then land hours late), or an external
// pinger (e.g. a free cron service hitting this URL with the header). This
// route and its logic are otherwise complete and tested — nothing calls it
// automatically until one of those is decided and vercel.json is restored.
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed — unconfigured must never mean "no check"
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type DueCheckParty = {
  repeat_rule: "none" | "daily" | "weekly";
  last_notified_at: string | null;
};

// Recurrence here means the REMINDER repeats, not the session — a
// repeating party is one row whose scheduled_at never changes; this decides
// whether it's time to re-fire the notification, not whether to create a
// new occurrence. Exported for route.test.ts, and mirrored exactly in SQL
// by claim_and_notify_due_parties() (20260914130000_atomic_party_notification_claim.sql)
// — that DB function is the one actually making this decision at runtime;
// this copy exists for the unit test coverage a plpgsql function can't get
// from vitest.
export function isDue(party: DueCheckParty, now = new Date()): boolean {
  if (!party.last_notified_at) return true;
  if (party.repeat_rule === "none") return false;
  const elapsedMs = now.getTime() - new Date(party.last_notified_at).getTime();
  if (party.repeat_rule === "daily") return elapsedMs >= 24 * 60 * 60 * 1000;
  if (party.repeat_rule === "weekly") return elapsedMs >= 7 * 24 * 60 * 60 * 1000;
  return false;
}

type ClaimResult = { party_id: string; notified_count: number; outcome: string };

// Vercel Cron Jobs invoke via GET, not POST — this must be a GET handler
// or the scheduled trigger configured in vercel.json will never reach it.
//
// The entire claim -> due-check -> notify -> mark-notified sequence now
// happens inside one atomic database call (claim_and_notify_due_parties)
// rather than as separate round trips from here — see that function's own
// migration for why: `for update skip locked` there means two overlapping
// invocations of this route (a retry, a manual re-trigger while a real
// cron fire is still in flight) can never both notify the same party, and
// last_notified_at is only set after a party's notification insert
// actually succeeds, so a transient failure gets retried instead of
// silently marked done.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("claim_and_notify_due_parties");

  if (error) {
    return NextResponse.json({ error: "Could not process scheduled parties" }, { status: 500 });
  }

  const results = (data ?? []) as ClaimResult[];
  const notified = results.filter((r) => r.outcome === "notified").length;
  const failed = results.filter((r) => r.outcome !== "notified");
  if (failed.length > 0) {
    console.error("notify-scheduled: some parties failed to notify and will be retried:", failed);
  }

  return NextResponse.json({ ok: true, notified, failed: failed.length });
}
