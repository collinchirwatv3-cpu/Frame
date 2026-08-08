import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// First test for any Route Handler in this repo — no existing convention to
// follow beyond the store/component tests' own "mock the module, not the
// network" pattern, extended here to @/lib/supabase/server and
// @/lib/rate-limit instead of @/lib/supabase/client.
let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
const insertSpy = vi.fn();
const deleteMatchSpy = vi.fn();
let dbError: { message: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertSpy(table, row);
        return Promise.resolve({ error: dbError });
      },
      delete: () => ({
        match: (row: unknown) => {
          deleteMatchSpy(table, row);
          return Promise.resolve({ error: dbError });
        },
      }),
    }),
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

const { POST } = await import("./route");

// Real v4-shaped UUIDs, not just any 8-4-4-4-12 hex string — zod's .uuid()
// enforces the RFC 4122 variant/version nibbles, which a hand-typed
// "1111-1111-..." placeholder fails (learned the hard way debugging this
// suite: the route was fine, the fixtures weren't valid UUIDs).
const VIDEO_ID = "8e52e400-a58b-4879-b6c8-bd2646701108";
const CREATOR_ID = "5a5f265d-1e0d-4773-990b-30d681e41eeb";
const COLLECTION_ID = "f6974f16-9c6f-42b9-8dfa-06206523c4d1";
const OTHER_ID = "8d3420c7-a7ce-40b9-8387-82cae45a31d5";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/engagement/like", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function paramsFor(kind: string) {
  return { params: Promise.resolve({ kind }) };
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  dbError = null;
  insertSpy.mockClear();
  deleteMatchSpy.mockClear();
});

describe("POST /api/engagement/[kind]", () => {
  it("requires auth", async () => {
    mockUser = null;
    const res = await POST(request({ targetId: VIDEO_ID, active: true }), paramsFor("like"));
    expect(res.status).toBe(401);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind", async () => {
    const res = await POST(request({ targetId: VIDEO_ID, active: true }), paramsFor("bookmark"));
    expect(res.status).toBe(404);
  });

  it("rejects an invalid body", async () => {
    const res = await POST(request({ targetId: "not-a-uuid", active: true }), paramsFor("like"));
    expect(res.status).toBe(400);
  });

  it("enforces the rate limit before touching the database", async () => {
    rateLimitOk = false;
    const res = await POST(request({ targetId: VIDEO_ID, active: true }), paramsFor("like"));
    expect(res.status).toBe(429);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("inserts into the right table with the caller's own id when active:true", async () => {
    const res = await POST(request({ targetId: VIDEO_ID, active: true }), paramsFor("like"));
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledWith("likes", { user_id: "u1", video_id: VIDEO_ID });
  });

  it("deletes when active:false", async () => {
    const res = await POST(request({ targetId: VIDEO_ID, active: false }), paramsFor("save"));
    expect(res.status).toBe(200);
    expect(deleteMatchSpy).toHaveBeenCalledWith("saves", { user_id: "u1", video_id: VIDEO_ID });
  });

  it("dispatches follow to the follower_id/followee_id columns", async () => {
    await POST(request({ targetId: CREATOR_ID, active: true }), paramsFor("follow"));
    expect(insertSpy).toHaveBeenCalledWith("follows", { follower_id: "u1", followee_id: CREATOR_ID });
  });

  it("dispatches saved-collection to saved_collections", async () => {
    await POST(request({ targetId: COLLECTION_ID, active: true }), paramsFor("saved-collection"));
    expect(insertSpy).toHaveBeenCalledWith("saved_collections", {
      user_id: "u1",
      collection_id: COLLECTION_ID,
    });
  });

  it("returns 500 without leaking the raw db error when the write fails", async () => {
    dbError = { message: "constraint violation: no_self_follow" };
    const res = await POST(request({ targetId: OTHER_ID, active: true }), paramsFor("follow"));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).not.toContain("constraint");
  });
});
