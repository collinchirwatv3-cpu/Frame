import { cookies } from "next/headers";
import crypto from "node:crypto";

const ANON_ID_COOKIE = "frame_anon_id";

/**
 * A random per-browser id for signed-out viewers — correlates an ad
 * impression with the watch session it led to, and keeps repeat visits
 * from each minting a fresh "unique viewer" for the Shorts pool's
 * scoring (Milestone 4). The identifier is signed because httpOnly only
 * prevents browser JavaScript from reading a cookie; it does not stop a
 * caller from sending an arbitrary Cookie header.
 */
export async function getOrCreateAnonId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANON_ID_COOKIE)?.value;
  const verified = existing ? verify(existing) : null;
  if (verified) return verified;

  const fresh = crypto.randomUUID();
  cookieStore.set(ANON_ID_COOKIE, `${fresh}.${sign(fresh)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return fresh;
}

function secret(): string {
  const value = process.env.ANON_ID_SIGNING_SECRET;
  if (!value || value.length < 32) {
    throw new Error("ANON_ID_SIGNING_SECRET must be set to a 32+ character secret");
  }
  return value;
}

function sign(id: string): string {
  return crypto.createHmac("sha256", secret()).update(id).digest("base64url");
}

function verify(value: string): string | null {
  const [id, signature, ...extra] = value.split(".");
  if (!id || !signature || extra.length > 0) return null;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null;
  const expected = sign(id);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) return null;
  return id;
}
