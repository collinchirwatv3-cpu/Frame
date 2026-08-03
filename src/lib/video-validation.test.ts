import { describe, expect, it } from "vitest";
import { checkUpload, isLandscape, qualityLabel } from "./video-validation";

describe("isLandscape", () => {
  it("accepts wider-than-tall dimensions", () => {
    expect(isLandscape(1920, 1080)).toBe(true);
  });

  it("rejects taller-than-wide dimensions", () => {
    expect(isLandscape(1080, 1920)).toBe(false);
  });

  it("rejects square dimensions", () => {
    expect(isLandscape(1000, 1000)).toBe(false);
  });
});

describe("checkUpload", () => {
  it("accepts 16:9", () => {
    const result = checkUpload(1920, 1080);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.aspect.id).toBe("16:9");
  });

  it("accepts 21:9 cinema resolutions", () => {
    const result = checkUpload(3440, 1440);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.aspect.id).toBe("21:9");
  });

  it("accepts 16:10", () => {
    const result = checkUpload(2560, 1600);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.aspect.id).toBe("16:10");
  });

  it("rejects portrait with reason not-landscape", () => {
    const result = checkUpload(1080, 1920);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-landscape");
  });

  it("rejects square with reason not-landscape", () => {
    const result = checkUpload(1080, 1080);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-landscape");
  });

  it("rejects 4:3 (landscape, but not yet enabled) with reason unsupported-ratio", () => {
    const result = checkUpload(1440, 1080);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unsupported-ratio");
    }
  });

  it("rejects an ultra-panoramic ratio and still suggests the nearest enabled band", () => {
    const result = checkUpload(4000, 1000); // 4:1, nowhere near any band
    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === "unsupported-ratio") {
      expect(result.nearest?.id).toBe("21:9");
    }
  });
});

describe("qualityLabel", () => {
  it("labels 4K resolutions", () => {
    expect(qualityLabel(3840, 2160)).toBe("4K");
  });

  it("labels 1080p resolutions", () => {
    expect(qualityLabel(1920, 1080)).toBe("1080p");
  });

  it("labels 720p resolutions", () => {
    expect(qualityLabel(1280, 720)).toBe("720p");
  });

  it("labels anything smaller as SD", () => {
    expect(qualityLabel(854, 480)).toBe("SD");
  });
});
