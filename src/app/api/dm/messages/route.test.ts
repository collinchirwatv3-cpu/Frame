import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let profileRow: { invite_redeemed_at: string | null } | null = { invite_redeemed_at: "2026-01-01T00:00:00Z" };
const insertSpy = vi.fn();
let insertResult: { data: unknown; error: { message: string } | null } = {
  data: { id: "m1", thread_id: "t1", sender_id: "u1", text: "hey", created_at: "2026-01-01T00:00:00Z" },
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: profileRow, error: null }) }) }) };
      }
      if (table === "dm_messages") {
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
        ? { success: true, limit: 30, remaining: 29, reset: 0 }
        : { success: false, limit: 30, remaining: 0, reset: Date.now() + 1000 },
  };
});

const { POST } = await import("./route");

const THREAD_ID = "44ec8be3-32c6-4dec-a2bb-23f04121c4d4";
const validBody = { threadId: THREAD_ID, text: "hey" };

function request(body: unknown) {
  return new NextRequest("http://localhost/api/dm/messages", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z" };
  insertSpy.mockClear();
  insertResult = {
    data: { id: "m1", thread_id: THREAD_ID, sender_id: "u1", text: "hey", created_at: "2026-01-01T00:00:00Z" },
    error: null,
  };
});

describe("POST /api/dm/messages", () => {
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

  it("rejects an empty message", async () => {
    const res = await POST(request({ ...validBody, text: "   " }));
    expect(res.status).toBe(400);
  });

  it("rejects a message over 2000 characters", async () => {
    const res = await POST(request({ ...validBody, text: "x".repeat(2001) }));
    expect(res.status).toBe(400);
  });

  it("derives sender_id from the session, never from the request body", async () => {
    const res = await POST(request({ ...validBody, senderId: "someone-else" }));
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ sender_id: "u1" }));
  });

  it("surfaces an RLS rejection (a blocked pair, or not a participant) as a 400, not a crash", async () => {
    insertResult = { data: null, error: { message: "new row violates row-level security policy" } };
    const res = await POST(request(validBody));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain("row-level security");
  });

  it("sends a message on valid input", async () => {
    const res = await POST(request(validBody));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: "m1", text: "hey" });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ thread_id: THREAD_ID, sender_id: "u1", text: "hey" })
    );
  });
});
