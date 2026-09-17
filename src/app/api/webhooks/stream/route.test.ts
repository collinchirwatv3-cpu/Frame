import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";

// Same "mock the module, not the network" convention as
// src/app/api/uploads/route.test.ts. verifyStreamWebhookSignature is kept
// real (via importOriginal) so signature verification is genuinely
// exercised, not just assumed — only getStreamVideoDetails (a real network
// call to Cloudflare) is replaced with a controllable fixture.
let streamDetails: {
  uid: string;
  readyToStream: boolean;
  state: string;
  playbackHlsUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
} = {
  uid: "stream-uid-1",
  readyToStream: true,
  state: "ready",
  playbackHlsUrl: "https://videodelivery.example/1/manifest/video.m3u8",
  thumbnailUrl: "https://videodelivery.example/1/thumbnail.jpg",
  durationSeconds: 600,
  width: 1920,
  height: 1080,
};

vi.mock("@/lib/cloudflare-stream", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cloudflare-stream")>();
  return {
    ...actual,
    getStreamVideoDetails: async () => streamDetails,
  };
});

let videoRow: {
  content_type: string;
  publish_mode: string;
  trim_start_seconds: number;
  trim_end_seconds: number | null;
  poster_url: string | null;
} = {
  content_type: "film",
  publish_mode: "monetise",
  trim_start_seconds: 0,
  trim_end_seconds: null,
  poster_url: null,
};
const updateSpy = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== "videos") throw new Error(`unexpected table: ${table}`);
      return {
        // The route's own pre-update read (clamping a stale trim window
        // against the real duration) — same videoRow fixture, not a
        // separate table.
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: videoRow, error: null }) }) }),
        update: (values: Record<string, unknown>) => {
          updateSpy(values);
          // Applying the forced fields to videoRow lets assertions read
          // back "what the row would end up as" without a real database.
          if (typeof values.content_type === "string") videoRow.content_type = values.content_type;
          if (typeof values.publish_mode === "string") videoRow.publish_mode = values.publish_mode;
          if ("trim_start_seconds" in values) videoRow.trim_start_seconds = values.trim_start_seconds as number;
          if ("trim_end_seconds" in values) videoRow.trim_end_seconds = values.trim_end_seconds as number | null;
          if ("poster_url" in values) videoRow.poster_url = values.poster_url as string | null;
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  }),
}));

const { POST } = await import("./route");

const SECRET = "test-webhook-secret";

function signedRequest(body: string) {
  const time = Math.floor(Date.now() / 1000).toString();
  const sig1 = crypto.createHmac("sha256", SECRET).update(`${time}.${body}`).digest("hex");
  return new NextRequest("http://localhost/api/webhooks/stream", {
    method: "POST",
    headers: { "Webhook-Signature": `time=${time},sig1=${sig1}` },
    body,
  });
}

beforeEach(() => {
  videoRow = {
    content_type: "film",
    publish_mode: "monetise",
    trim_start_seconds: 0,
    trim_end_seconds: null,
    poster_url: null,
  };
  updateSpy.mockClear();
  vi.stubEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

describe("POST /api/webhooks/stream", () => {
  it("rejects a request with an invalid signature", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/webhooks/stream", {
        method: "POST",
        headers: { "Webhook-Signature": "time=1,sig1=deadbeef" },
        body: JSON.stringify({ uid: "stream-uid-1" }),
      })
    );
    expect(res.status).toBe(401);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("fails closed when the webhook secret is unconfigured", async () => {
    vi.stubEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET", "");
    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));
    expect(res.status).toBe(500);
  });

  it("forces content_type=short and publish_mode=post when the real duration is under the longform threshold — closing the monetised-short bypass", async () => {
    // Simulates the exploit: an upload was inserted as film/monetise using
    // a forged client-probed duration (> 360s), but the file actually
    // uploaded to Cloudflare Stream is short.
    streamDetails = { ...streamDetails, durationSeconds: 42 };

    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const update = updateSpy.mock.calls[0][0];
    expect(update.content_type).toBe("short");
    expect(update.publish_mode).toBe("post");
    expect(update.duration_seconds).toBe(42);
    expect(videoRow).toEqual({
      content_type: "short",
      publish_mode: "post",
      trim_start_seconds: 0,
      trim_end_seconds: null,
      poster_url: streamDetails.thumbnailUrl,
    });
  });

  it.each([359.9, 360, 360.1])("uses the authoritative six-minute boundary at %s seconds", async (durationSeconds) => {
    streamDetails = { ...streamDetails, durationSeconds };
    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));
    expect(res.status).toBe(200);
    expect(updateSpy.mock.calls[0][0].content_type).toBe(durationSeconds <= 360 ? "short" : undefined);
  });

  it("does not touch content_type/publish_mode for a genuinely long video", async () => {
    streamDetails = { ...streamDetails, durationSeconds: 600 };

    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(res.status).toBe(200);
    const update = updateSpy.mock.calls[0][0];
    expect(update.content_type).toBeUndefined();
    expect(update.publish_mode).toBeUndefined();
    // The row (inserted as film/monetise) is left exactly as it was, except
    // poster_url — this test's videoRow had none set, so Cloudflare's own
    // auto-thumbnail applies.
    expect(videoRow).toEqual({
      content_type: "film",
      publish_mode: "monetise",
      trim_start_seconds: 0,
      trim_end_seconds: null,
      poster_url: streamDetails.thumbnailUrl,
    });
  });

  it("forces short/post even for a video inserted as a short-but-not-post edge case", async () => {
    videoRow = {
      content_type: "film",
      publish_mode: "promote",
      trim_start_seconds: 0,
      trim_end_seconds: null,
      poster_url: null,
    };
    streamDetails = { ...streamDetails, durationSeconds: 10 };

    await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(videoRow).toEqual({
      content_type: "short",
      publish_mode: "post",
      trim_start_seconds: 0,
      trim_end_seconds: null,
      poster_url: streamDetails.thumbnailUrl,
    });
  });

  describe("poster_url — a client-captured cover must survive this webhook", () => {
    it("sets Cloudflare's own auto-thumbnail when no cover was captured", async () => {
      videoRow = { content_type: "film", publish_mode: "post", trim_start_seconds: 0, trim_end_seconds: null, poster_url: null };
      const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));
      expect(res.status).toBe(200);
      expect(updateSpy.mock.calls[0][0].poster_url).toBe(streamDetails.thumbnailUrl);
    });

    it("never overwrites a poster_url a creator already captured before encoding finished", async () => {
      videoRow = {
        content_type: "film",
        publish_mode: "post",
        trim_start_seconds: 0,
        trim_end_seconds: null,
        poster_url: "https://r2.example/covers/creator-captured.jpg",
      };
      const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));
      expect(res.status).toBe(200);
      expect(updateSpy.mock.calls[0][0].poster_url).toBeUndefined();
      expect(videoRow.poster_url).toBe("https://r2.example/covers/creator-captured.jpg");
    });
  });

  it("resets a stale trim window when it no longer fits the real (webhook-authoritative) duration", async () => {
    videoRow = { content_type: "film", publish_mode: "post", trim_start_seconds: 50, trim_end_seconds: 55, poster_url: null };
    // The client-probed duration this trim was set against was longer than
    // what Cloudflare actually measured — trim_start_seconds (50) is now
    // past the real duration, which would make the video unplayable rather
    // than just imprecisely trimmed.
    streamDetails = { ...streamDetails, durationSeconds: 42 };

    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(res.status).toBe(200);
    const update = updateSpy.mock.calls[0][0];
    expect(update.trim_start_seconds).toBe(0);
    expect(update.trim_end_seconds).toBeNull();
  });

  it("leaves a trim window untouched when it still fits the real duration", async () => {
    videoRow = { content_type: "film", publish_mode: "post", trim_start_seconds: 5, trim_end_seconds: 30, poster_url: null };
    streamDetails = { ...streamDetails, durationSeconds: 600 };

    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(res.status).toBe(200);
    const update = updateSpy.mock.calls[0][0];
    expect(update.trim_start_seconds).toBeUndefined();
    expect(update.trim_end_seconds).toBeUndefined();
  });

  it("marks the video failed when Stream reports an error state", async () => {
    streamDetails = {
      ...streamDetails,
      readyToStream: false,
      state: "error",
      playbackHlsUrl: null,
    };

    const res = await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({ processing_status: "failed" });
  });
});
