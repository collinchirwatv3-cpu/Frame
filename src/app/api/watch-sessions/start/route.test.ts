import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// This route uses two different clients — the user's own RLS-scoped one
// (@/lib/supabase/server, for the actual watch_sessions insert) and a
// service-role one (@supabase/supabase-js directly, for the ad_impressions
// cross-check, which has zero client-facing RLS access) — both mocked
// separately, same "mock the module, not the network" convention as every
// other route test in this repo.
let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let insertResult: { data: { id: string; client_session_token: string } | null; error: unknown } = {
  data: { id: "session-1", client_session_token: "token-1" },
  error: null,
};
const watchSessionsInsertSpy = vi.fn();
let recentImpressionRow: { id: string } | null = null;
const adImpressionsQuerySpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table !== "watch_sessions") throw new Error(`unexpected user-scoped table: ${table}`);
      return {
        insert: (row: unknown) => {
          watchSessionsInsertSpy(row);
          return { select: () => ({ single: async () => insertResult }) };
        },
      };
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "videos") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.eq = chain;
        builder.maybeSingle = async () => ({ data: { id: VIDEO_ID }, error: null });
        return builder;
      }
      if (table === "watch_sessions") {
        return {
          insert: (row: unknown) => {
            watchSessionsInsertSpy(row);
            return { select: () => ({ single: async () => insertResult }) };
          },
        };
      }
      if (table !== "ad_impressions") throw new Error(`unexpected service-role table: ${table}`);
      const builder: Record<string, unknown> = {};
      const chain = (...args: unknown[]) => {
        adImpressionsQuerySpy(...args);
        return builder;
      };
      builder.select = chain;
      builder.eq = chain;
      builder.gte = chain;
      builder.limit = chain;
      builder.maybeSingle = async () => ({ data: recentImpressionRow, error: null });
      return builder;
    },
  }),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: async () =>
      rateLimitOk
        ? { success: true, limit: 60, remaining: 59, reset: 0 }
        : { success: false, limit: 60, remaining: 0, reset: Date.now() + 1000 },
  };
});

vi.mock("@/lib/anon-id", () => ({
  getOrCreateAnonId: async () => "anon-test-id",
}));

const { POST } = await import("./route");

const VIDEO_ID = "8e52e400-a58b-4879-b6c8-bd2646701108";
const CAMPAIGN_ID = "5a5f265d-1e0d-4773-990b-30d681e41eeb";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/watch-sessions/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  insertResult = { data: { id: "session-1", client_session_token: "token-1" }, error: null };
  recentImpressionRow = null;
  watchSessionsInsertSpy.mockClear();
  adImpressionsQuerySpy.mockClear();
});

describe("POST /api/watch-sessions/start", () => {
  it("works for a signed-out caller — watching has always been open to signed-out visitors", async () => {
    mockUser = null;
    const res = await POST(request({ videoId: VIDEO_ID }));
    expect(res.status).toBe(200);
    expect(watchSessionsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ viewer_id: null, anon_id: "anon-test-id" })
    );
  });

  it("sets viewer_id (and no anon_id) for a signed-in caller", async () => {
    const res = await POST(request({ videoId: VIDEO_ID }));
    expect(res.status).toBe(200);
    expect(watchSessionsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ viewer_id: "u1", anon_id: null })
    );
  });

  it("uses a service-role insert after deriving all accounting fields server-side", async () => {
    const res = await POST(request({ videoId: VIDEO_ID }));
    expect(res.status).toBe(200);
    expect(watchSessionsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ video_id: VIDEO_ID, viewer_id: "u1", campaign_id: null })
    );
  });

  it("rejects when rate limited", async () => {
    rateLimitOk = false;
    const res = await POST(request({ videoId: VIDEO_ID }));
    expect(res.status).toBe(429);
    expect(watchSessionsInsertSpy).not.toHaveBeenCalled();
  });

  it("does not set campaign_id when no campaignId is claimed", async () => {
    await POST(request({ videoId: VIDEO_ID }));
    expect(watchSessionsInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: null }));
    expect(adImpressionsQuerySpy).not.toHaveBeenCalled();
  });

  it("ignores a claimed campaignId when no matching ad_impressions row exists — never a bare client claim", async () => {
    recentImpressionRow = null;
    const res = await POST(request({ videoId: VIDEO_ID, campaignId: CAMPAIGN_ID }));
    expect(res.status).toBe(200);
    expect(watchSessionsInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ campaign_id: null }));
  });

  it("trusts a claimed campaignId once a real, recent shorts_feed ad_impressions row is found", async () => {
    recentImpressionRow = { id: "impression-1" };
    const res = await POST(request({ videoId: VIDEO_ID, campaignId: CAMPAIGN_ID }));
    expect(res.status).toBe(200);
    expect(watchSessionsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ campaign_id: CAMPAIGN_ID })
    );
  });
});
