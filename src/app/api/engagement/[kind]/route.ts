import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { engagementRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// engagement-store.ts's toggle() used to write likes/saves/follows/
// saved_collections straight to Postgres via the browser client — no route
// meant no server code to attach engagementRateLimiter to (it already
// existed, unused, for exactly this). Table/column names are looked up
// server-side from `kind`, never taken from the client, so this stays a
// thin rate-limit + auth gate in front of the exact same RLS-respecting
// writes the client used to make directly — not a new authorization layer,
// and not a generic "insert into any table" proxy.
const CONFIG = {
  like: { table: "likes", ownerCol: "user_id", targetCol: "video_id" },
  save: { table: "saves", ownerCol: "user_id", targetCol: "video_id" },
  follow: { table: "follows", ownerCol: "follower_id", targetCol: "followee_id" },
  "saved-collection": { table: "saved_collections", ownerCol: "user_id", targetCol: "collection_id" },
} as const;

type Kind = keyof typeof CONFIG;

const bodySchema = z.object({
  targetId: z.string().uuid(),
  // Mirrors the store's own optimistic-flip semantics: true = should now
  // exist (insert), false = should no longer exist (delete) — the client
  // already knows which, since it just flipped its local dict.
  active: z.boolean(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(kind in CONFIG)) {
    return NextResponse.json({ error: "Unknown engagement type" }, { status: 404 });
  }
  const { table, ownerCol, targetCol } = CONFIG[kind as Kind];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(engagementRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const row = { [ownerCol]: user.id, [targetCol]: parsed.data.targetId };
  const { error } = parsed.data.active
    ? await supabase.from(table).insert(row)
    : await supabase.from(table).delete().match(row);

  if (error) {
    return NextResponse.json({ error: "Could not update that" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
