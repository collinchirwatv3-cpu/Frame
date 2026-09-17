import { describe, expect, it } from "vitest";
import { getTrimBounds } from "./video-trim";

describe("getTrimBounds", () => {
  it("is untrimmed when neither bound is set", () => {
    const bounds = getTrimBounds({ durationSeconds: 60 });
    expect(bounds).toEqual({ start: 0, end: 60, isTrimmed: false });
  });

  it("is untrimmed when trimStartSeconds is 0 and trimEndSeconds matches the full duration", () => {
    const bounds = getTrimBounds({ durationSeconds: 60, trimStartSeconds: 0, trimEndSeconds: 60 });
    expect(bounds.isTrimmed).toBe(false);
  });

  it("is trimmed when the start is past 0", () => {
    const bounds = getTrimBounds({ durationSeconds: 60, trimStartSeconds: 5, trimEndSeconds: 60 });
    expect(bounds).toEqual({ start: 5, end: 60, isTrimmed: true });
  });

  it("is trimmed when the end is before the full duration", () => {
    const bounds = getTrimBounds({ durationSeconds: 60, trimStartSeconds: 0, trimEndSeconds: 40 });
    expect(bounds).toEqual({ start: 0, end: 40, isTrimmed: true });
  });

  it("falls back to the full duration when trimEndSeconds is absent", () => {
    const bounds = getTrimBounds({ durationSeconds: 60, trimStartSeconds: 10 });
    expect(bounds.end).toBe(60);
  });

  it("ignores a malformed trimEndSeconds that doesn't come after start", () => {
    const bounds = getTrimBounds({ durationSeconds: 60, trimStartSeconds: 30, trimEndSeconds: 10 });
    expect(bounds.end).toBe(60);
  });

  it("a fraction-of-a-second gap under the full duration doesn't count as trimmed", () => {
    // Real-world float drift between the client-probed duration and the
    // authoritative one from Cloudflare — not a meaningful creator trim.
    const bounds = getTrimBounds({ durationSeconds: 60, trimStartSeconds: 0, trimEndSeconds: 59.98 });
    expect(bounds.isTrimmed).toBe(false);
  });
});
