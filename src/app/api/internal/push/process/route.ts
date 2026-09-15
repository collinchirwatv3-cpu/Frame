import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Same CRON_SECRET convention as /api/internal/parties/notify-scheduled —
// see that route's own comment for the full explanation. Short version:
// when an env var literally named CRON_SECRET is set, Vercel sends
// `Authorization: Bearer <CRON_SECRET>` on requests it makes to a
// vercel.json `crons` entry; this checks for that header, nothing else.
//
// NOT CURRENTLY WIRED UP in vercel.json, and deliberately so here too: the
// project is on Vercel's Hobby plan (cron jobs there run at most once a
// day), which is not a usable cadence for "notify on a new DM" — a once-
// daily fire would mean pushes routinely arriving many hours late. This
// route is complete and tested; nothing calls it automatically until
// either the plan is upgraded (Pro allows sub-daily cron) or an external
// pinger hits this URL every 1-2 minutes with the CRON_SECRET header — see
// the handoff report for the concrete options.
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

type ClaimedJob = {
  job_id: string;
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  recipient_id: string;
  thread_id: string;
};

// A minimal, fixed payload by design — message content previews are out of
// scope for this first version (see the upload spec). Never put message
// text, sender identity, or anything else DM-specific in here.
function buildPayload(threadId: string) {
  return JSON.stringify({
    title: "FRAME",
    body: "You have a new message",
    url: `/inbox/messages/${threadId}`,
  });
}

type SendOutcome = "sent" | "failed" | "expired";

async function deliverJob(job: ClaimedJob): Promise<{ outcome: SendOutcome; error?: string }> {
  try {
    await webpush.sendNotification(
      { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth_key } },
      buildPayload(job.thread_id),
      { TTL: 60 * 60 }
    );
    return { outcome: "sent" };
  } catch (err) {
    const statusCode = (err as { statusCode?: number } | null)?.statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    // Never log the endpoint or keys (subscription secrets) — only the
    // status code, which is enough to diagnose a delivery problem.
    return { outcome: expired ? "expired" : "failed", error: `push send failed (status ${statusCode ?? "unknown"})` };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = serviceClient();
  const { data, error } = await supabase.rpc("claim_push_jobs", { p_limit: 25 });
  if (error) {
    return NextResponse.json({ error: "Could not claim push jobs" }, { status: 500 });
  }

  const jobs = (data ?? []) as ClaimedJob[];
  let sent = 0;
  let failed = 0;

  // Sequential, not Promise.all — this is a bounded 25-item batch on a
  // route that itself must finish inside one invocation (no unawaited
  // work after the response, matching the constraint that ruled out
  // fire-and-forget from the DM send route in the first place); sequential
  // keeps a single slow/hanging push service call from being unbounded
  // concurrency against it instead.
  for (const job of jobs) {
    const result = await deliverJob(job);
    if (result.outcome === "sent") {
      await supabase.rpc("mark_push_job_sent", { p_job_id: job.job_id });
      sent++;
    } else {
      await supabase.rpc("mark_push_job_failed", {
        p_job_id: job.job_id,
        p_error: result.error ?? "unknown error",
        p_expired: result.outcome === "expired",
      });
      failed++;
    }
  }

  return NextResponse.json({ claimed: jobs.length, sent, failed });
}
