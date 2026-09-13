import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// The first scheduled/cron job in this repo. CRON_SECRET (not a
// project-invented name) is Vercel's own convention: when an env var
// literally named CRON_SECRET is set, Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on requests it makes to the paths
// listed in vercel.json's `crons` array — no custom header wiring needed
// on the platform side, just checking for it here.
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
// new occurrence. Exported for route.test.ts.
export function isDue(party: DueCheckParty, now = new Date()): boolean {
  if (!party.last_notified_at) return true;
  if (party.repeat_rule === "none") return false;
  const elapsedMs = now.getTime() - new Date(party.last_notified_at).getTime();
  if (party.repeat_rule === "daily") return elapsedMs >= 24 * 60 * 60 * 1000;
  if (party.repeat_rule === "weekly") return elapsedMs >= 7 * 24 * 60 * 60 * 1000;
  return false;
}

// Vercel Cron Jobs invoke via GET, not POST — this must be a GET handler
// or the scheduled trigger configured in vercel.json will never reach it.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = new Date();

  const { data: candidates, error } = await supabase
    .from("watch_parties")
    .select("id, host_id, repeat_rule, last_notified_at")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", now.toISOString());

  if (error) {
    return NextResponse.json({ error: "Could not load scheduled parties" }, { status: 500 });
  }

  let notified = 0;
  for (const party of candidates ?? []) {
    if (!isDue(party, now)) continue;

    const { data: followers } = await supabase.from("follows").select("follower_id").eq("followee_id", party.host_id);
    const recipientIds = (followers ?? []).map((row) => row.follower_id as string);

    if (recipientIds.length > 0) {
      await supabase.from("notifications").insert(
        recipientIds.map((recipientId) => ({
          recipient_id: recipientId,
          actor_id: party.host_id,
          type: "party_starting",
          party_id: party.id,
        }))
      );
    }

    await supabase.from("watch_parties").update({ last_notified_at: now.toISOString() }).eq("id", party.id);
    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
