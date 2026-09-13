import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Two separate Supabase clients to mock, matching the route's own two-tier
// write: the caller's own RLS-bound client for the blocks row (and, on
// unblock, the caller's own follows row), and a service-role client for the
// OTHER direction's follow row on block — not the caller's own row under
// follows_delete_own's `auth.uid() = follower_id`, so RLS alone can't do it.
let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let blocksInsertError: { code?: string; message: string } | null = null;
let blocksDeleteError: { message: string } | null = null;
const blocksInsertSpy = vi.fn();
const blocksDeleteSpy = vi.fn();
const followsDeleteSpy = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table !== "blocks") throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: unknown) => {
          blocksInsertSpy(row);
          return Promise.resolve({ error: blocksInsertError });
        },
        delete: () => ({
          eq: (col1: string, val1: unknown) => ({
            eq: (col2: string, val2: unknown) => {
              blocksDeleteSpy({ [col1]: val1, [col2]: val2 });
              return Promise.resolve({ error: blocksDeleteError });
            },
          }),
        }),
      };
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== "follows") throw new Error(`unexpected table ${table}`);
      return {
        delete: () => ({
          eq: (col1: string, val1: unknown) => ({
            eq: (col2: string, val2: unknown) => {
              followsDeleteSpy({ [col1]: val1, [col2]: val2 });
              return Promise.resolve({ error: null });
            },
          }),
        }),
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
        ? { success: true, limit: 30, remaining: 29, reset: 0 }
        : { success: false, limit: 30, remaining: 0, reset: Date.now() + 1000 },
  };
});

const { POST } = await import("./route");

// Real v4-shaped UUID — zod's .uuid() enforces the RFC 4122 variant/version
// nibbles, a hand-typed placeholder fails that (precedent: engagement/[kind]'s
// own route test hit this same thing first).
const TARGET_ID = "5a5f265d-1e0d-4773-990b-30d681e41eeb";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/block", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  blocksInsertError = null;
  blocksDeleteError = null;
  blocksInsertSpy.mockClear();
  blocksDeleteSpy.mockClear();
  followsDeleteSpy.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

describe("POST /api/block", () => {
  it("requires auth", async () => {
    mockUser = null;
    const res = await POST(request({ targetId: TARGET_ID, active: true }));
    expect(res.status).toBe(401);
    expect(blocksInsertSpy).not.toHaveBeenCalled();
  });

  it("rejects an invalid body", async () => {
    const res = await POST(request({ targetId: "not-a-uuid", active: true }));
    expect(res.status).toBe(400);
  });

  it("rejects blocking yourself", async () => {
    const res = await POST(request({ targetId: "u1", active: true }));
    expect(res.status).toBe(400);
    expect(blocksInsertSpy).not.toHaveBeenCalled();
  });

  it("enforces the rate limit before touching the database", async () => {
    rateLimitOk = false;
    const res = await POST(request({ targetId: TARGET_ID, active: true }));
    expect(res.status).toBe(429);
    expect(blocksInsertSpy).not.toHaveBeenCalled();
  });

  it("inserts the block row and force-unfollows both directions", async () => {
    const res = await POST(request({ targetId: TARGET_ID, active: true }));
    expect(res.status).toBe(200);
    expect(blocksInsertSpy).toHaveBeenCalledWith({ blocker_id: "u1", blocked_id: TARGET_ID });
    expect(followsDeleteSpy).toHaveBeenCalledWith({ follower_id: "u1", followee_id: TARGET_ID });
    expect(followsDeleteSpy).toHaveBeenCalledWith({ follower_id: TARGET_ID, followee_id: "u1" });
  });

  it("treats an already-blocked duplicate insert as success, not an error", async () => {
    blocksInsertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const res = await POST(request({ targetId: TARGET_ID, active: true }));
    expect(res.status).toBe(200);
  });

  it("returns 500 without leaking the raw db error on a real insert failure", async () => {
    blocksInsertError = { code: "23503", message: "constraint violation: xyz" };
    const res = await POST(request({ targetId: TARGET_ID, active: true }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("constraint");
    expect(followsDeleteSpy).not.toHaveBeenCalled();
  });

  it("unblocks by deleting only the caller's own block row, without touching follows", async () => {
    const res = await POST(request({ targetId: TARGET_ID, active: false }));
    expect(res.status).toBe(200);
    expect(blocksDeleteSpy).toHaveBeenCalledWith({ blocker_id: "u1", blocked_id: TARGET_ID });
    expect(followsDeleteSpy).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking the raw db error on an unblock failure", async () => {
    blocksDeleteError = { message: "constraint violation: xyz" };
    const res = await POST(request({ targetId: TARGET_ID, active: false }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("constraint");
  });
});
