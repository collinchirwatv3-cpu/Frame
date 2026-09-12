import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let rpcError: { message: string } | null = null;
const rpcSpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    rpc: (fn: string, args: unknown) => {
      rpcSpy(fn, args);
      return Promise.resolve({ error: rpcError });
    },
  }),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: async () =>
      rateLimitOk
        ? { success: true, limit: 120, remaining: 119, reset: 0 }
        : { success: false, limit: 120, remaining: 0, reset: Date.now() + 1000 },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: (fn: string, args: unknown) => {
      rpcSpy(fn, args);
      return Promise.resolve({ error: rpcError });
    },
  }),
}));

const { POST } = await import("./route");

const SESSION_ID = "8e52e400-a58b-4879-b6c8-bd2646701108";
const SESSION_TOKEN = "5a5f265d-1e0d-4773-990b-30d681e41eeb";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/watch-sessions/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  rpcError = null;
  rpcSpy.mockClear();
});

describe("POST /api/watch-sessions/heartbeat", () => {
  it("works for a signed-out caller too", async () => {
    mockUser = null;
    const res = await POST(
      request({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN, deltaSeconds: 5, positionSeconds: 12 })
    );
    expect(res.status).toBe(200);
  });

  it("calls record_watch_heartbeat with the exact claimed values — clamping is the function's job, not this route's", async () => {
    const res = await POST(
      request({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN, deltaSeconds: 9999, positionSeconds: 12 })
    );
    expect(res.status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledWith("record_watch_heartbeat", {
      p_session_id: SESSION_ID,
      p_session_token: SESSION_TOKEN,
      p_delta_seconds: 9999,
      p_position_seconds: 12,
    });
  });

  it("rejects when rate limited", async () => {
    rateLimitOk = false;
    const res = await POST(
      request({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN, deltaSeconds: 5, positionSeconds: 12 })
    );
    expect(res.status).toBe(429);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("returns 403 when the function rejects an invalid session/token pair", async () => {
    rpcError = { message: "invalid session" };
    const res = await POST(
      request({ sessionId: SESSION_ID, sessionToken: SESSION_TOKEN, deltaSeconds: 5, positionSeconds: 12 })
    );
    expect(res.status).toBe(403);
  });

  it("rejects an invalid body", async () => {
    const res = await POST(request({ sessionId: "not-a-uuid" }));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
