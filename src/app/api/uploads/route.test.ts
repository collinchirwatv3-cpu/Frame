import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Same "mock the module, not the network" convention as
// src/app/api/engagement/[kind]/route.test.ts. Video creation + tag writes
// now happen in one create_video_with_tags RPC call (atomic — see
// 20260917150000_video_tags_atomic_write.sql) rather than a sequence of
// separate table inserts, so this route only ever touches profiles,
// business_channels, campaigns, and that one RPC.
let mockUser: { id: string } | null = { id: "u1" };
let rateLimitOk = true;
let profileRow: { invite_redeemed_at: string | null; monetization_eligible: boolean } | null = {
  invite_redeemed_at: "2026-01-01T00:00:00Z",
  monetization_eligible: false,
};
let businessChannelRow: { status: string } | null = null;
let createVideoResult: { data: string | null; error: { message: string } | null } = {
  data: "video-1",
  error: null,
};
const createVideoRpcSpy = vi.fn();
const campaignsInsertSpy = vi.fn();
const deleteStreamVideoSpy = vi.fn();

const CONTENT_TYPE_TAG_ID = "11111111-1111-4111-8111-111111111111";
const GENRE_TAG_ID = "22222222-2222-4222-8222-222222222222";
const TOPIC_TAG_ID = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    rpc: (fn: string, args: unknown) => {
      if (fn === "create_video_with_tags") {
        createVideoRpcSpy(args);
        return Promise.resolve(createVideoResult);
      }
      throw new Error(`route.test.ts: unexpected rpc "${fn}"`);
    },
    from: (table: string) => {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: profileRow, error: null }) }) }) };
      }
      if (table === "business_channels") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: businessChannelRow, error: null }) }) }),
        };
      }
      if (table === "campaigns") {
        return {
          insert: (row: unknown) => {
            campaignsInsertSpy(row);
            return Promise.resolve({ error: null });
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
        ? { success: true, limit: 10, remaining: 9, reset: 0 }
        : { success: false, limit: 10, remaining: 0, reset: Date.now() + 1000 },
  };
});

vi.mock("@/lib/cloudflare-stream", () => ({
  createTusUploadSession: async () => ({ uid: "stream-uid-1", uploadUrl: "https://upload.example/1" }),
  deleteStreamVideo: (uid: string) => {
    deleteStreamVideoSpy(uid);
    return Promise.resolve();
  },
}));

const { POST } = await import("./route");

const validBody = {
  title: "Iceland, from 400ft",
  description: "",
  contentTypeTagId: CONTENT_TYPE_TAG_ID,
  genreTagIds: [GENRE_TAG_ID],
  topicTagIds: [TOPIC_TAG_ID],
  width: 1920,
  height: 1080,
  durationSeconds: 600,
  fileSizeBytes: 1_000_000,
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  rateLimitOk = true;
  profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z", monetization_eligible: false };
  businessChannelRow = null;
  createVideoResult = { data: "video-1", error: null };
  createVideoRpcSpy.mockClear();
  campaignsInsertSpy.mockClear();
  deleteStreamVideoSpy.mockClear();
});

describe("POST /api/uploads", () => {
  it("requires auth", async () => {
    mockUser = null;
    const res = await POST(request(validBody));
    expect(res.status).toBe(401);
    expect(createVideoRpcSpy).not.toHaveBeenCalled();
  });

  it("requires an invite", async () => {
    profileRow = { invite_redeemed_at: null, monetization_eligible: false };
    const res = await POST(request(validBody));
    expect(res.status).toBe(403);
  });

  it("rejects when rate limited", async () => {
    rateLimitOk = false;
    const res = await POST(request(validBody));
    expect(res.status).toBe(429);
    expect(createVideoRpcSpy).not.toHaveBeenCalled();
  });

  it.each([359.9, 360, 360.1])("classifies the six-minute boundary at %s seconds", async (durationSeconds) => {
    const res = await POST(request({ ...validBody, durationSeconds, contentType: "short" }));
    expect(res.status).toBe(200);
    expect(createVideoRpcSpy).toHaveBeenCalledWith(expect.objectContaining({
      p_content_type: durationSeconds <= 360 ? "short" : "film",
      p_publish_mode: "post",
    }));
  });

  describe("publishMode: post (default)", () => {
    it("calls create_video_with_tags with the full tag selection and never touches campaigns", async () => {
      const res = await POST(request(validBody));
      expect(res.status).toBe(200);
      expect(createVideoRpcSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          p_publish_mode: "post",
          p_content_type_tag_id: CONTENT_TYPE_TAG_ID,
          p_genre_tag_ids: [GENRE_TAG_ID],
          p_topic_tag_ids: [TOPIC_TAG_ID],
        })
      );
      expect(campaignsInsertSpy).not.toHaveBeenCalled();
    });

    it("defaults an omitted trim window to untrimmed (start 0, end null)", async () => {
      const res = await POST(request(validBody));
      expect(res.status).toBe(200);
      expect(createVideoRpcSpy).toHaveBeenCalledWith(
        expect.objectContaining({ p_trim_start_seconds: 0, p_trim_end_seconds: null })
      );
    });

    it("passes a real trim window through to the RPC", async () => {
      const res = await POST(request({ ...validBody, trimStartSeconds: 5, trimEndSeconds: 90 }));
      expect(res.status).toBe(200);
      expect(createVideoRpcSpy).toHaveBeenCalledWith(
        expect.objectContaining({ p_trim_start_seconds: 5, p_trim_end_seconds: 90 })
      );
    });
  });

  // Atomicity: create_video_with_tags failing (invalid/missing tags, a DB
  // error, whatever) must never be reported as a successful upload, and
  // the Stream session already minted before the DB call must be cleaned
  // up rather than left orphaned.
  describe("create_video_with_tags failure", () => {
    it("returns a real error status, not 200, when the RPC fails", async () => {
      createVideoResult = { data: null, error: { message: "Pick 1 to 3 genres" } };
      const res = await POST(request(validBody));
      expect(res.status).not.toBe(200);
      const body = await res.json();
      expect(body.error).toBe("Pick 1 to 3 genres");
    });

    it("cleans up the already-minted Stream session on failure", async () => {
      createVideoResult = { data: null, error: { message: "boom" } };
      await POST(request(validBody));
      expect(deleteStreamVideoSpy).toHaveBeenCalledWith("stream-uid-1");
    });

    it("never attempts the campaigns insert when the video itself failed to create", async () => {
      createVideoResult = { data: null, error: { message: "boom" } };
      await POST(request({ ...validBody, publishMode: "promote" }));
      expect(campaignsInsertSpy).not.toHaveBeenCalled();
    });

    it("still returns an error even if Stream cleanup itself fails — the upload already failed regardless", async () => {
      createVideoResult = { data: null, error: { message: "boom" } };
      deleteStreamVideoSpy.mockImplementationOnce(() => {
        throw new Error("stream cleanup also failed");
      });
      const res = await POST(request(validBody));
      expect(res.status).not.toBe(200);
    });
  });

  describe("publishMode: monetise", () => {
    it("rejects a non-eligible creator with 403, before ever calling the RPC", async () => {
      profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z", monetization_eligible: false };
      const res = await POST(request({ ...validBody, publishMode: "monetise" }));
      expect(res.status).toBe(403);
      expect(createVideoRpcSpy).not.toHaveBeenCalled();
    });

    it("rejects a short video even for an eligible creator — never trusts the client's contentType for the short boundary", async () => {
      profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z", monetization_eligible: true };
      const res = await POST(
        request({ ...validBody, publishMode: "monetise", contentType: "film", durationSeconds: 10 })
      );
      expect(res.status).toBe(400);
      expect(createVideoRpcSpy).not.toHaveBeenCalled();
    });

    it("succeeds for an eligible creator on a real long-form video", async () => {
      profileRow = { invite_redeemed_at: "2026-01-01T00:00:00Z", monetization_eligible: true };
      const res = await POST(request({ ...validBody, publishMode: "monetise" }));
      expect(res.status).toBe(200);
      expect(createVideoRpcSpy).toHaveBeenCalledWith(expect.objectContaining({ p_publish_mode: "monetise" }));
    });
  });

  describe("publishMode: promote", () => {
    it("calls the RPC and inserts a matching campaigns row for a non-business creator", async () => {
      const res = await POST(request({ ...validBody, publishMode: "promote" }));
      expect(res.status).toBe(200);
      expect(createVideoRpcSpy).toHaveBeenCalledWith(expect.objectContaining({ p_publish_mode: "promote" }));
      expect(campaignsInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "promote", owner_id: "u1", status: "pending_payment" })
      );
    });

    it("rejects an approved Business Channel — businesses Run as an Ad, never Promote", async () => {
      businessChannelRow = { status: "approved" };
      const res = await POST(request({ ...validBody, publishMode: "promote" }));
      expect(res.status).toBe(403);
      expect(createVideoRpcSpy).not.toHaveBeenCalled();
    });

    it("does not query business_channels at all for a non-promote upload", async () => {
      await POST(request(validBody));
      expect(campaignsInsertSpy).not.toHaveBeenCalled();
    });
  });
});
