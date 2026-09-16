import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// videos_update_own/videos_delete_own's own real ownership + column-grant
// behavior is covered live against local Postgres by
// scripts/verify-video-self-edit.mjs — this exercises the route wrapper's
// auth/rate-limit/validation/dispatch/error-shaping behavior only.
let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
const updateEqSpy = vi.fn();
let updateResult: { data: unknown; error: { message: string } | null } = {
  data: { id: "v1", title: "New title", description: "New description" },
  error: null,
};
const deleteEqSpy = vi.fn();
let deleteResult: { data: unknown; error: { message: string } | null } = {
  data: { stream_uid: "stream-uid-1" },
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from: (table: string) => {
      if (table !== "videos") throw new Error(`route.test.ts: unexpected table "${table}"`);
      return {
        update: (row: unknown) => ({
          eq: (col: string, val: unknown) => {
            updateEqSpy(row, col, val);
            return {
              select: () => ({ maybeSingle: async () => updateResult }),
            };
          },
        }),
        delete: () => ({
          eq: (col: string, val: unknown) => {
            deleteEqSpy(col, val);
            return {
              select: () => ({ maybeSingle: async () => deleteResult }),
            };
          },
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
        ? { success: true, limit: 20, remaining: 19, reset: 0 }
        : { success: false, limit: 20, remaining: 0, reset: Date.now() + 1000 },
  };
});

const deleteStreamVideoSpy = vi.fn(async (uid: string) => {
  void uid;
});
vi.mock("@/lib/cloudflare-stream", () => ({
  deleteStreamVideo: (uid: string) => deleteStreamVideoSpy(uid),
}));

const { PATCH, DELETE } = await import("./route");

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/videos/v1", { method: "PATCH", body: JSON.stringify(body) });
}
function deleteRequest() {
  return new NextRequest("http://localhost/api/videos/v1", { method: "DELETE" });
}
const params = Promise.resolve({ id: "v1" });

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  updateEqSpy.mockClear();
  updateResult = { data: { id: "v1", title: "New title", description: "New description" }, error: null };
  deleteEqSpy.mockClear();
  deleteResult = { data: { stream_uid: "stream-uid-1" }, error: null };
  deleteStreamVideoSpy.mockClear();
});

describe("PATCH /api/videos/[id]", () => {
  it("requires sign-in", async () => {
    mockUser = null;
    const res = await PATCH(patchRequest({ title: "x" }), { params });
    expect(res.status).toBe(401);
    expect(updateEqSpy).not.toHaveBeenCalled();
  });

  it("rate limits", async () => {
    rateLimitOk = false;
    const res = await PATCH(patchRequest({ title: "x" }), { params });
    expect(res.status).toBe(429);
  });

  it("rejects an empty title before touching the database", async () => {
    const res = await PATCH(patchRequest({ title: "" }), { params });
    expect(res.status).toBe(400);
    expect(updateEqSpy).not.toHaveBeenCalled();
  });

  it("rejects a title over 120 characters", async () => {
    const res = await PATCH(patchRequest({ title: "x".repeat(121) }), { params });
    expect(res.status).toBe(400);
  });

  it("scopes the update to the given video id and only title/description", async () => {
    const res = await PATCH(patchRequest({ title: "New title", description: "New description" }), { params });
    expect(res.status).toBe(200);
    expect(updateEqSpy).toHaveBeenCalledWith(
      { title: "New title", description: "New description" },
      "id",
      "v1"
    );
  });

  it("returns 404 when the update matches no row (not owned, or doesn't exist) rather than a generic error", async () => {
    updateResult = { data: null, error: null };
    const res = await PATCH(patchRequest({ title: "New title" }), { params });
    expect(res.status).toBe(404);
  });

  it("surfaces a database error as 400, not a raw db error", async () => {
    updateResult = { data: null, error: { message: "constraint violated: some internal detail" } };
    const res = await PATCH(patchRequest({ title: "New title" }), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toMatch(/constraint violated/);
  });
});

describe("DELETE /api/videos/[id]", () => {
  it("requires sign-in", async () => {
    mockUser = null;
    const res = await DELETE(deleteRequest(), { params });
    expect(res.status).toBe(401);
    expect(deleteEqSpy).not.toHaveBeenCalled();
  });

  it("rate limits", async () => {
    rateLimitOk = false;
    const res = await DELETE(deleteRequest(), { params });
    expect(res.status).toBe(429);
  });

  it("returns 404 when the delete matches no row", async () => {
    deleteResult = { data: null, error: null };
    const res = await DELETE(deleteRequest(), { params });
    expect(res.status).toBe(404);
    expect(deleteStreamVideoSpy).not.toHaveBeenCalled();
  });

  it("deletes the row scoped to the given id, then cleans up the Stream asset", async () => {
    const res = await DELETE(deleteRequest(), { params });
    expect(res.status).toBe(200);
    expect(deleteEqSpy).toHaveBeenCalledWith("id", "v1");
    expect(deleteStreamVideoSpy).toHaveBeenCalledWith("stream-uid-1");
  });

  it("still reports success (with a warning) if Stream cleanup fails — the row is already gone either way", async () => {
    deleteStreamVideoSpy.mockRejectedValueOnce(new Error("Cloudflare down"));
    const res = await DELETE(deleteRequest(), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.warning).toBeTruthy();
  });

  it("skips Stream cleanup entirely when the video had no stream_uid", async () => {
    deleteResult = { data: { stream_uid: null }, error: null };
    const res = await DELETE(deleteRequest(), { params });
    expect(res.status).toBe(200);
    expect(deleteStreamVideoSpy).not.toHaveBeenCalled();
  });
});
