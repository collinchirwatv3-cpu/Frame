import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStreamWebhookSignature, parseVideoDetails } from "./cloudflare-stream";

function sign(body: string, secret: string, time: string) {
  return crypto.createHmac("sha256", secret).update(`${time}.${body}`).digest("hex");
}

describe("verifyStreamWebhookSignature", () => {
  const secret = "test-signing-secret";
  const body = JSON.stringify({ uid: "abc123", readyToStream: true });
  const time = "1735689600";

  it("accepts a correctly signed payload", () => {
    const sig = sign(body, secret, time);
    expect(verifyStreamWebhookSignature(body, `time=${time},sig1=${sig}`, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = sign(body, secret, time);
    const tamperedBody = JSON.stringify({ uid: "abc123", readyToStream: false });
    expect(verifyStreamWebhookSignature(tamperedBody, `time=${time},sig1=${sig}`, secret)).toBe(
      false
    );
  });

  it("rejects the wrong secret", () => {
    const sig = sign(body, "a-different-secret", time);
    expect(verifyStreamWebhookSignature(body, `time=${time},sig1=${sig}`, secret)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyStreamWebhookSignature(body, null, secret)).toBe(false);
  });

  it("rejects a malformed header", () => {
    expect(verifyStreamWebhookSignature(body, "not-a-valid-header", secret)).toBe(false);
  });

  it("rejects a signature of the wrong length rather than throwing", () => {
    expect(verifyStreamWebhookSignature(body, `time=${time},sig1=deadbeef`, secret)).toBe(false);
  });
});

describe("parseVideoDetails", () => {
  it("maps a ready video's fields correctly", () => {
    const result = parseVideoDetails({
      uid: "6b9e68b07dfee8cc2d116e4c51d6a957",
      readyToStream: true,
      status: { state: "ready" },
      thumbnail: "https://customer-x.cloudflarestream.com/uid/thumbnails/thumbnail.jpg",
      playback: { hls: "https://customer-x.cloudflarestream.com/uid/manifest/video.m3u8" },
      duration: 34.5,
      input: { width: 1920, height: 1080 },
    });

    expect(result).toMatchObject({
      uid: "6b9e68b07dfee8cc2d116e4c51d6a957",
      readyToStream: true,
      state: "ready",
      playbackHlsUrl: "https://customer-x.cloudflarestream.com/uid/manifest/video.m3u8",
      thumbnailUrl: "https://customer-x.cloudflarestream.com/uid/thumbnails/thumbnail.jpg",
      durationSeconds: 34.5,
      width: 1920,
      height: 1080,
    });
  });

  it("treats Stream's -1 duration sentinel as not-yet-known, not a real value", () => {
    const result = parseVideoDetails({
      uid: "abc",
      readyToStream: false,
      status: { state: "inprogress" },
      duration: -1,
      input: { width: -1, height: -1 },
    });

    expect(result.durationSeconds).toBeNull();
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
  });

  it("surfaces an error reason when Stream reports a failed encode", () => {
    const result = parseVideoDetails({
      uid: "abc",
      readyToStream: false,
      status: { state: "error", errorReasonText: "unsupported codec" },
    });

    expect(result.state).toBe("error");
    expect(result.errorReasonText).toBe("unsupported codec");
  });
});
