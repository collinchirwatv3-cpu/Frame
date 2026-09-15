import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// register_push_subscription/RLS's own real ownership + endpoint-allowlist
// behavior is covered live against local Postgres by
// scripts/verify-dm-web-push.mjs — this only exercises the route
// wrapper's auth/rate-limit/dispatch/error-shaping behavior, same split as
// every other route.test.ts in this repo.
let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
const rpcSpy = vi.fn();
let rpcResult: { error: { message: string } | null } = { error: null };
const deleteEqSpy = vi.fn();
let deleteResult: { error: { message: string } | null } = { error: null };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      return Promise.resolve(rpcResult);
    },
    from: (table: string) => {
      if (table === "push_subscriptions") {
        return {
          delete: () => ({
            eq: (col: string, val: unknown) => {
              deleteEqSpy(col, val);
              return {
                eq: (col2: string, val2: unknown) => {
                  deleteEqSpy(col2, val2);
                  return deleteResult;
                },
              };
            },
          }),
        };
      }
      throw new Error(`route.test.ts: unexpected table "${table}"`);
    },
  }),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: async () =>
      rateLimitOk
        ? { success: true, limit: 20, remaining: 19, reset: 0 }
        : { success: false, limit: 20, remaining: 0, reset: Date.now() + 1000 },
  };
});

const { POST, DELETE } = await import("./route");

const VALID_BODY = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", p256dh: "p256dh-key", auth: "auth-key" };

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/push/subscriptions", { method: "POST", body: JSON.stringify(body) });
}
function deleteRequest(body: unknown) {
  return new NextRequest("http://localhost/api/push/subscriptions", { method: "DELETE", body: JSON.stringify(body) });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  rpcSpy.mockClear();
  rpcResult = { error: null };
  deleteEqSpy.mockClear();
  deleteResult = { error: null };
});

describe("POST /api/push/subscriptions", () => {
  it("requires sign-in", async () => {
    mockUser = null;
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("rate limits", async () => {
    rateLimitOk = false;
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(429);
  });

  it("rejects a malformed body before ever calling the database", async () => {
    const res = await POST(postRequest({ endpoint: "not-a-url" }));
    expect(res.status).toBe(400);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("calls register_push_subscription with the parsed fields, never a client-supplied user id", async () => {
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(rpcSpy).toHaveBeenCalledWith("register_push_subscription", {
      p_endpoint: VALID_BODY.endpoint,
      p_p256dh: VALID_BODY.p256dh,
      p_auth: VALID_BODY.auth,
      p_user_agent: null,
    });
  });

  it("surfaces a database rejection (e.g. the endpoint allowlist) as a 400, not a raw db error", async () => {
    rpcResult = { error: { message: "Unsupported push endpoint" } };
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toMatch(/Unsupported push endpoint/); // no raw db error leaked
  });
});

describe("DELETE /api/push/subscriptions", () => {
  it("requires sign-in", async () => {
    mockUser = null;
    const res = await DELETE(deleteRequest({ endpoint: VALID_BODY.endpoint }));
    expect(res.status).toBe(401);
  });

  it("scopes the delete to the authenticated user's id and the given endpoint", async () => {
    const res = await DELETE(deleteRequest({ endpoint: VALID_BODY.endpoint }));
    expect(res.status).toBe(200);
    expect(deleteEqSpy).toHaveBeenCalledWith("user_id", "u1");
    expect(deleteEqSpy).toHaveBeenCalledWith("endpoint", VALID_BODY.endpoint);
  });

  it("rejects a malformed body", async () => {
    const res = await DELETE(deleteRequest({}));
    expect(res.status).toBe(400);
  });

  it("rate limits", async () => {
    rateLimitOk = false;
    const res = await DELETE(deleteRequest({ endpoint: VALID_BODY.endpoint }));
    expect(res.status).toBe(429);
  });
});
