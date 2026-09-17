import { describe, expect, it } from "vitest";
import { pickTicks } from "./time-ruler";

describe("pickTicks", () => {
  it("returns just 0 for a non-positive or non-finite duration", () => {
    expect(pickTicks(0)).toEqual([0]);
    expect(pickTicks(-5)).toEqual([0]);
    expect(pickTicks(Infinity)).toEqual([0]);
  });

  it("always starts at 0", () => {
    expect(pickTicks(1200)[0]).toBe(0);
  });

  it("picks a 5-minute interval for a roughly 20-minute video", () => {
    expect(pickTicks(1200)).toEqual([0, 300, 600, 900]);
  });

  it("picks a coarser interval for a short (under a minute) video", () => {
    const ticks = pickTicks(47);
    expect(ticks).toEqual([0, 10, 20, 30, 40]);
  });

  it("never produces more than a handful of ticks for a very long video", () => {
    const ticks = pickTicks(7200);
    expect(ticks.length).toBeLessThanOrEqual(6);
  });
});
