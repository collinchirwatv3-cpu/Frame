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

let videoRow: { content_type: string; publish_mode: string } = { content_type: "film", publish_mode: "monetise" };
const updateSpy = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== "videos") throw new Error(`unexpected table: ${table}`);
      return {
        update: (values: Record<string, unknown>) => {
          updateSpy(values);
          // Applying the forced fields to videoRow lets assertions read
          // back "what the row would end up as" without a real database.
          if (typeof values.content_type === "string") videoRow.content_type = values.content_type;
          if (typeof values.publish_mode === "string") videoRow.publish_mode = values.publish_mode;
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
  videoRow = { content_type: "film", publish_mode: "monetise" };
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
    expect(videoRow).toEqual({ content_type: "short", publish_mode: "post" });
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
    // The row (inserted as film/monetise) is left exactly as it was.
    expect(videoRow).toEqual({ content_type: "film", publish_mode: "monetise" });
  });

  it("forces short/post even for a video inserted as a short-but-not-post edge case", async () => {
    videoRow = { content_type: "film", publish_mode: "promote" };
    streamDetails = { ...streamDetails, durationSeconds: 10 };

    await POST(signedRequest(JSON.stringify({ uid: "stream-uid-1" })));

    expect(videoRow).toEqual({ content_type: "short", publish_mode: "post" });
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
