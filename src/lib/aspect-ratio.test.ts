import { describe, expect, it } from "vitest";
import { classifyAspectRatio, aspectRatioLabel, SUPPORTED_ASPECT_RATIOS } from "./aspect-ratio";

describe("classifyAspectRatio — spec examples", () => {
  it("classifies every 16:9 example", () => {
    for (const [w, h] of [
      [1920, 1080],
      [2560, 1440],
      [3840, 2160],
    ]) {
      expect(classifyAspectRatio(w, h)?.id).toBe("16:9");
    }
  });

  it("classifies every 21:9 example", () => {
    for (const [w, h] of [
      [2560, 1080],
      [3440, 1440],
      [5120, 2160],
    ]) {
      expect(classifyAspectRatio(w, h)?.id).toBe("21:9");
    }
  });

  it("classifies every 16:10 example", () => {
    for (const [w, h] of [
      [1920, 1200],
      [2560, 1600],
    ]) {
      expect(classifyAspectRatio(w, h)?.id).toBe("16:10");
    }
  });

  it("classifies 4:3 and 3:2 even though they're not yet enabled", () => {
    expect(classifyAspectRatio(1440, 1080)?.id).toBe("4:3");
    expect(classifyAspectRatio(3000, 2000)?.id).toBe("3:2");
  });

  it("returns null for portrait", () => {
    expect(classifyAspectRatio(1080, 1920)).toBeNull();
  });

  it("returns null for a ratio in the gap between bands (e.g. 1.85:1 flat cinema)", () => {
    expect(classifyAspectRatio(1998, 1080)).toBeNull();
  });

  it("returns null for square", () => {
    expect(classifyAspectRatio(1080, 1080)).toBeNull();
  });
});

describe("aspectRatioLabel", () => {
  it("labels a classified ratio by name", () => {
    expect(aspectRatioLabel(1920, 1080)).toBe("16:9");
    expect(aspectRatioLabel(3440, 1440)).toBe("21:9 Cinema");
  });

  it("falls back to a computed ratio string when unclassified", () => {
    expect(aspectRatioLabel(1998, 1080)).toBe("1.85:1");
  });
});

describe("SUPPORTED_ASPECT_RATIOS", () => {
  it("only includes Primary Support ratios, not Optional Future Support", () => {
    const ids = SUPPORTED_ASPECT_RATIOS.map((a) => a.id);
    expect(ids).toEqual(["16:10", "16:9", "21:9"]);
  });
});
