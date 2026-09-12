import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockUser: { id: string } | null = null; // ads can be served to signed-out viewers too
let rateLimitOk = true;
let campaignRow: { id: string } | null = null;
let rpcResult: { data: string | null; error: { message: string } | null } = { data: "impression-1", error: null };
const rpcSpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
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
      if (table !== "campaigns") throw new Error(`unexpected table: ${table}`);
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.maybeSingle = async () => ({ data: campaignRow, error: null });
      return builder;
    },
    rpc: (fn: string, args: unknown) => {
      rpcSpy(fn, args);
      return Promise.resolve(rpcResult);
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
  return new NextRequest("http://localhost/api/ads/serve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = null;
  rateLimitOk = true;
  campaignRow = null;
  rpcResult = { data: "impression-1", error: null };
  rpcSpy.mockClear();
});

describe("POST /api/ads/serve", () => {
  it("returns ad: null when no active business_ad campaign exists — the Phase 1 default state", async () => {
    campaignRow = null;
    const res = await POST(request({ placement: "shorts_feed", contextVideoId: VIDEO_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ad).toBeNull();
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("records an impression and returns the campaign/impression ids when one exists", async () => {
    campaignRow = { id: CAMPAIGN_ID };
    const res = await POST(request({ placement: "shorts_feed", contextVideoId: VIDEO_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ad).toEqual({ campaignId: CAMPAIGN_ID, impressionId: "impression-1" });
    expect(rpcSpy).toHaveBeenCalledWith(
      "record_ad_impression",
      expect.objectContaining({ p_campaign_id: CAMPAIGN_ID, p_placement: "shorts_feed" })
    );
  });

  it("returns ad: null (not an error) when record_ad_impression rejects — e.g. frequency cap", async () => {
    campaignRow = { id: CAMPAIGN_ID };
    rpcResult = { data: null, error: { message: "frequency cap reached for this viewer" } };
    const res = await POST(request({ placement: "shorts_feed", contextVideoId: VIDEO_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ad).toBeNull();
  });

  it("uses anon_id for a signed-out caller, viewer_id for a signed-in one", async () => {
    campaignRow = { id: CAMPAIGN_ID };
    await POST(request({ placement: "shorts_feed", contextVideoId: VIDEO_ID }));
    expect(rpcSpy).toHaveBeenLastCalledWith(
      "record_ad_impression",
      expect.objectContaining({ p_viewer_id: null, p_anon_id: "anon-test-id" })
    );

    mockUser = { id: "u1" };
    await POST(request({ placement: "shorts_feed", contextVideoId: VIDEO_ID }));
    expect(rpcSpy).toHaveBeenLastCalledWith(
      "record_ad_impression",
      expect.objectContaining({ p_viewer_id: "u1", p_anon_id: null })
    );
  });

  it("rejects when rate limited", async () => {
    rateLimitOk = false;
    const res = await POST(request({ placement: "shorts_feed", contextVideoId: VIDEO_ID }));
    expect(res.status).toBe(429);
  });

  it("rejects an invalid placement", async () => {
    const res = await POST(request({ placement: "banner", contextVideoId: VIDEO_ID }));
    expect(res.status).toBe(400);
  });
});
