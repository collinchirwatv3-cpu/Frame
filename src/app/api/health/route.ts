import { NextResponse } from "next/server";

// Never cache — an uptime monitor needs the real, current state every time.
export const dynamic = "force-dynamic";

/**
 * Shallow liveness check for external uptime monitoring (UptimeRobot, Better
 * Uptime, etc.) — confirms the server process is up and responding at all.
 * Deliberately does NOT make a network call to Supabase/Cloudflare on every
 * hit (uptime monitors poll every 30s–1min; a deep dependency check at that
 * frequency adds real load for little benefit). Always returns 200 — a
 * health check flapping between 200/503 can trigger unwanted auto-restarts
 * in some deploy setups; `status: "degraded"` is a signal for a human or a
 * smarter monitor to notice, not a downtime alert.
 */
export async function GET() {
  const requiredEnvVars = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const missingConfig = requiredEnvVars.filter((key) => !process.env[key]);

  return NextResponse.json(
    {
      status: missingConfig.length === 0 ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      ...(missingConfig.length > 0 && { missingConfig }),
    },
    { status: 200 }
  );
}
