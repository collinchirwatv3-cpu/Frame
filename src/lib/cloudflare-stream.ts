import crypto from "node:crypto";

/**
 * Server-only Cloudflare Stream client. Every function here needs
 * CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_API_TOKEN — never imported from
 * client code, never exposes the token past this module.
 *
 * Exact API shapes (TUS creation headers, webhook signature format) are
 * verified against Cloudflare's current docs as of this file's authorship,
 * not from memory — but none of it has been exercised against a real
 * Stream account yet (CLOUDFLARE_STREAM_API_TOKEN is unset as of writing).
 * `createTusUploadSession` self-verifies the UID it parses out of the
 * Location header with a follow-up GET specifically because that URL shape
 * isn't documented with a concrete example — treat this file as "correct by
 * careful reading," not "tested," until it's run once for real.
 */

function baseUrl() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;
}

function authToken() {
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_STREAM_API_TOKEN is not set");
  return token;
}

function buildUploadMetadata(maxDurationSeconds: number): string {
  const value = Buffer.from(String(Math.ceil(maxDurationSeconds))).toString("base64");
  return `maxDurationSeconds ${value}`;
}

export type StreamVideoDetails = {
  uid: string;
  readyToStream: boolean;
  state: string;
  errorReasonText?: string;
  playbackHlsUrl: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

function parseVideoDetails(result: Record<string, unknown>): StreamVideoDetails {
  const status = (result.status ?? {}) as Record<string, unknown>;
  const playback = (result.playback ?? {}) as Record<string, unknown>;
  const input = (result.input ?? {}) as Record<string, unknown>;
  const duration = typeof result.duration === "number" ? result.duration : null;

  return {
    uid: String(result.uid),
    readyToStream: result.readyToStream === true,
    state: typeof status.state === "string" ? status.state : "unknown",
    errorReasonText: typeof status.errorReasonText === "string" ? status.errorReasonText : undefined,
    playbackHlsUrl: typeof playback.hls === "string" ? playback.hls : null,
    thumbnailUrl: typeof result.thumbnail === "string" ? result.thumbnail : null,
    // -1 is Stream's "not yet known" sentinel while a video is still processing.
    durationSeconds: duration !== null && duration >= 0 ? duration : null,
    width: typeof input.width === "number" && input.width > 0 ? input.width : null,
    height: typeof input.height === "number" && input.height > 0 ? input.height : null,
  };
}

/** Creates a one-time, resumable (TUS) upload session and hands back a URL
 * the client can upload directly to — our API token never reaches the
 * browser. `maxDurationSeconds` is the client-probed real duration of the
 * file being uploaded, not a hint; Stream rejects encodes that exceed it. */
export async function createTusUploadSession(
  maxDurationSeconds: number,
  fileSizeBytes: number
): Promise<{ uploadUrl: string; uid: string }> {
  const res = await fetch(`${baseUrl()}?direct_user=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken()}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(fileSizeBytes),
      "Upload-Metadata": buildUploadMetadata(maxDurationSeconds),
    },
  });

  if (!res.ok) {
    throw new Error(`Cloudflare Stream rejected the upload session (${res.status})`);
  }

  const location = res.headers.get("Location");
  if (!location) {
    throw new Error("Cloudflare Stream did not return an upload URL");
  }

  const uid = new URL(location).pathname.split("/").filter(Boolean).pop();
  if (!uid) {
    throw new Error(`Could not parse a video UID out of the upload URL: ${location}`);
  }

  // Self-verify — the UID was parsed from an undocumented URL shape, so
  // confirm it actually resolves to a real Stream video before trusting it
  // enough to write into our own database.
  await getStreamVideoDetails(uid);

  return { uploadUrl: location, uid };
}

export async function getStreamVideoDetails(uid: string): Promise<StreamVideoDetails> {
  const res = await fetch(`${baseUrl()}/${uid}`, {
    headers: { Authorization: `Bearer ${authToken()}` },
  });

  if (!res.ok) {
    throw new Error(`Cloudflare Stream video lookup failed for ${uid} (${res.status})`);
  }

  const body = (await res.json()) as { result: Record<string, unknown> };
  return parseVideoDetails(body.result);
}

/** Deletes a video and its copies from Stream — called on account deletion
 * so a removed creator's storage doesn't keep silently costing money.
 * Best-effort by design at the call site: one video's Stream cleanup
 * failing should never block deleting the account itself. */
export async function deleteStreamVideo(uid: string): Promise<void> {
  const res = await fetch(`${baseUrl()}/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken()}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Cloudflare Stream refused to delete ${uid} (${res.status})`);
  }
}

/** Registers (or re-registers — only one subscription is allowed per
 * account) the account-wide webhook endpoint. One-time setup, run via
 * scripts/register-stream-webhook.mjs, not called from application code. */
export async function registerStreamWebhook(notificationUrl: string): Promise<{ secret: string }> {
  const res = await fetch(`${baseUrl()}/webhook`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${authToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ notificationUrl }),
  });

  if (!res.ok) {
    throw new Error(`Failed to register Stream webhook (${res.status})`);
  }

  const body = (await res.json()) as { result: { secret: string } };
  return { secret: body.result.secret };
}

/** Verifies the `Webhook-Signature` header Cloudflare Stream sends on every
 * webhook POST: `time=<unix>,sig1=<hex hmac-sha256>` over `${time}.${rawBody}`.
 * Must run against the raw request body — never a re-serialized JSON.parse
 * round-trip, which can shift whitespace/key order and invalidate the sig. */
export function verifyStreamWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((pair) => {
      const [key, value] = pair.split("=");
      return [key, value];
    })
  );
  const { time, sig1 } = parts;
  if (!time || !sig1) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${time}.${rawBody}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(sig1, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export { parseVideoDetails };
