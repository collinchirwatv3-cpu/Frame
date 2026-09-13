import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real claim -> due-check -> notify -> mark-notified sequence now runs
// atomically inside claim_and_notify_due_parties() (see
// supabase/migrations/20260914130000_atomic_party_notification_claim.sql)
// — this route is now a thin wrapper around one .rpc() call, so this test
// only exercises the wrapper's auth/response-shaping behavior. The
// function's own due/recurrence/concurrency/failure-atomicity behavior is
// covered live against a real database by
// scripts/verify-rls-party-notifications.mjs, matching this repo's
// standing rule that RLS/plpgsql behavior is verified with a real request,
// not a mock.
let rpcResult: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const rpcSpy = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: (name: string) => {
      rpcSpy(name);
      return Promise.resolve(rpcResult);
    },
  }),
}));

const { GET, isDue } = await import("./route");

function request() {
  return new NextRequest("http://localhost/api/internal/parties/notify-scheduled", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  rpcResult = { data: [], error: null };
  rpcSpy.mockClear();
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

describe("isDue", () => {
  const now = new Date("2026-01-08T12:00:00Z");

  it("is due when never notified, regardless of repeat_rule", () => {
    expect(isDue({ repeat_rule: "none", last_notified_at: null }, now)).toBe(true);
    expect(isDue({ repeat_rule: "weekly", last_notified_at: null }, now)).toBe(true);
  });

  it("a one-off ('none') party is never due again once notified", () => {
    expect(isDue({ repeat_rule: "none", last_notified_at: "2026-01-01T12:00:00Z" }, now)).toBe(false);
  });

  it("a daily party is not due before 24h have elapsed", () => {
    expect(isDue({ repeat_rule: "daily", last_notified_at: "2026-01-08T00:00:00Z" }, now)).toBe(false);
  });

  it("a daily party is due once 24h have elapsed", () => {
    expect(isDue({ repeat_rule: "daily", last_notified_at: "2026-01-07T11:00:00Z" }, now)).toBe(true);
  });

  it("a weekly party is not due before 7 days have elapsed", () => {
    expect(isDue({ repeat_rule: "weekly", last_notified_at: "2026-01-05T12:00:00Z" }, now)).toBe(false);
  });

  it("a weekly party is due once 7 days have elapsed", () => {
    expect(isDue({ repeat_rule: "weekly", last_notified_at: "2026-01-01T11:00:00Z" }, now)).toBe(true);
  });
});

describe("GET /api/internal/parties/notify-scheduled", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "the-real-secret");
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("calls the atomic claim RPC and reports how many parties were notified", async () => {
    rpcResult = {
      data: [
        { party_id: "party-1", notified_count: 2, outcome: "notified" },
        { party_id: "party-2", notified_count: 0, outcome: "notified" },
      ],
      error: null,
    };

    const res = await GET(request());
    const body = await res.json();

    expect(rpcSpy).toHaveBeenCalledWith("claim_and_notify_due_parties");
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, notified: 2, failed: 0 });
  });

  it("reports failed parties separately without failing the whole request", async () => {
    rpcResult = {
      data: [
        { party_id: "party-1", notified_count: 2, outcome: "notified" },
        { party_id: "party-2", notified_count: 0, outcome: "failed: some db error" },
      ],
      error: null,
    };

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, notified: 1, failed: 1 });
  });

  it("returns 500 when the RPC call itself errors", async () => {
    rpcResult = { data: null, error: { message: "connection reset" } };
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
