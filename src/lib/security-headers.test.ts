import { afterEach, describe, expect, it, vi } from "vitest";
import { buildContentSecurityPolicy } from "./security-headers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildContentSecurityPolicy", () => {
  it("never allows a local Supabase origin in production, even if NEXT_PUBLIC_SUPABASE_URL points at one", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    const csp = buildContentSecurityPolicy("nonce123");
    expect(csp).not.toContain("127.0.0.1");
  });

  it("allows the local Supabase http and ws origins in dev when NEXT_PUBLIC_SUPABASE_URL points at one", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    const csp = buildContentSecurityPolicy("nonce123");
    expect(csp).toContain("http://127.0.0.1:54321");
    expect(csp).toContain("ws://127.0.0.1:54321");
  });

  it("adds nothing extra in dev when NEXT_PUBLIC_SUPABASE_URL is a real *.supabase.co project", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://realproject.supabase.co");
    const csp = buildContentSecurityPolicy("nonce123");
    expect(csp).not.toContain("127.0.0.1");
    expect(csp).not.toContain("realproject.supabase.co"); // already covered by the https://*.supabase.co wildcard
  });

  it("still produces a valid policy with no NEXT_PUBLIC_SUPABASE_URL set at all", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    expect(() => buildContentSecurityPolicy("nonce123")).not.toThrow();
  });

  it("still produces a valid policy with a malformed NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    expect(() => buildContentSecurityPolicy("nonce123")).not.toThrow();
  });

  it("still includes the wildcard *.supabase.co entries regardless", () => {
    vi.stubEnv("NODE_ENV", "production");
    const csp = buildContentSecurityPolicy("nonce123");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
  });
});
