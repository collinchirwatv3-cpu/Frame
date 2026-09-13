import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let profileRow: { invite_redeemed_at: string | null } | null = { invite_redeemed_at: "2026-01-01T00:00:00Z" };
let scheduledCount = 0;
const serviceInsertSpy = vi.fn();
let serviceInsertResult: { data: { id: string } | null; error: { message: string } | null } = {
  data: { id: "party-1" },
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: profileRow, error: null }) }) }) };
      }
      if (table === "watch_parties") {
        return {
          select: () => ({
            eq: () => ({ not: async () => ({ count: scheduledCount, error: null }) }),
          }),
        };
      }
      throw new Error(`route.test.ts: unexpected table "${table}"`);
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== "watch_parties") throw new Error(`unexpected table: ${table}`);
      return {
        insert: (row: unknown) => {
          serviceInsertSpy(row);
          return { select: () => ({ single: async () => serviceInsertResult }) };
        },
      };
    },
  }),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: async () =>
      rateLimitOk
        ? { success: true, limit: 10, remaining: 9, reset: 0 }
        : { success: false, limit: 10, remaining: 0, reset: Date.now() + 1000 },
  };
});

const { POST } = await import("./route");

const validBody = {
  title: "Friday night watch party",
  videoId: "44ec8be3-32c6-4dec-a2bb-23f04121c4d4",
  visibility: "public",
  scheduledAt: null,
  repeatRule: "none",
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/parties", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z" };
  scheduledCount = 0;
  serviceInsertSpy.mockClear();
  serviceInsertResult = { data: { id: "party-1" }, error: null };
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

describe("POST /api/parties", () => {
  it("requires sign-in", async () => {
    mockUser = null;
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
  });

  it("requires an invite", async () => {
    profileRow = { invite_redeemed_at: null };
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("is rate limited", async () => {
    rateLimitOk = false;
    const res = await POST(request(validBody));
    expect(res.status).toBe(429);
  });

  it("rejects a scheduled time in the past", async () => {
    const res = await POST(request({ ...validBody, scheduledAt: "2020-01-01T00:00:00.000Z" }));
    expect(res.status).toBe(400);
  });

  it("rejects a repeat rule without a scheduled time", async () => {
    const res = await POST(request({ ...validBody, scheduledAt: null, repeatRule: "daily" }));
    expect(res.status).toBe(400);
  });

  it("rejects creation once the host is at the scheduled-party cap", async () => {
    scheduledCount = 20;
    const res = await POST(
      request({ ...validBody, scheduledAt: new Date(Date.now() + 3600_000).toISOString() })
    );
    expect(res.status).toBe(429);
    expect(serviceInsertSpy).not.toHaveBeenCalled();
  });

  it("derives host_id from the session, never from the request body", async () => {
    const res = await POST(request({ ...validBody, hostId: "someone-else" }));
    expect(res.status).toBe(200);
    expect(serviceInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ host_id: "u1" }));
  });

  it("creates a party via the service-role client on valid input", async () => {
    const res = await POST(request(validBody));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ id: "party-1" });
  });
});
