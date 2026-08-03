import { describe, expect, it } from "vitest";
import { formatCount } from "./utils";

describe("formatCount", () => {
  it("returns raw numbers under 1000", () => {
    expect(formatCount(842)).toBe("842");
  });

  it("formats thousands with a K suffix", () => {
    expect(formatCount(2_300)).toBe("2.3K");
  });

  it("drops trailing .0", () => {
    expect(formatCount(5_000)).toBe("5K");
  });

  it("formats millions with an M suffix", () => {
    expect(formatCount(1_200_000)).toBe("1.2M");
  });
});
