import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let profileRow: { invite_redeemed_at: string | null } | null = { invite_redeemed_at: "2026-01-01T00:00:00Z" };
const insertSpy = vi.fn();
let insertResult: { data: unknown; error: { message: string } | null } = {
  data: { id: "cmt-1", text: "Nice shot", created_at: "2026-01-01T00:00:00Z", parent_id: null, user: null },
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: profileRow, error: null }) }) }) };
      }
      if (table === "comments") {
        return {
          insert: (row: unknown) => {
            insertSpy(row);
            return { select: () => ({ single: async () => insertResult }) };
          },
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

const { POST } = await import("./route");

const validBody = { videoId: "44ec8be3-32c6-4dec-a2bb-23f04121c4d4", text: "Nice shot", parentId: null };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/comments", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z" };
  insertSpy.mockClear();
  insertResult = {
    data: { id: "cmt-1", text: "Nice shot", created_at: "2026-01-01T00:00:00Z", parent_id: null, user: null },
    error: null,
  };
});

describe("POST /api/comments", () => {
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

  it("rejects an empty comment", async () => {
    const res = await POST(request({ ...validBody, text: "   " }));
    expect(res.status).toBe(400);
  });

  it("rejects a comment over 2000 characters", async () => {
    const res = await POST(request({ ...validBody, text: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("derives user_id from the session, never from the request body", async () => {
    const res = await POST(request({ ...validBody, userId: "someone-else" }));
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u1" }));
  });

  it("surfaces an RLS rejection (e.g. private/not-ready target video) as a 400, not a crash", async () => {
    insertResult = { data: null, error: { message: "new row violates row-level security policy" } };
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
  });

  it("posts a top-level comment on valid input", async () => {
    const res = await POST(request(validBody));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: "cmt-1", text: "Nice shot" });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ video_id: validBody.videoId, text: "Nice shot", parent_id: null })
    );
  });

  it("posts a reply with parent_id set", async () => {
    const parentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const res = await POST(request({ ...validBody, parentId }));
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ parent_id: parentId }));
  });
});
