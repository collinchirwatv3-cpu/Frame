import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useVisualViewportBounds } from "./use-visual-viewport-bounds";

type Listener = () => void;

function installVisualViewport(initial: { height: number; offsetTop: number; scale?: number }) {
  const listeners = new Map<string, Set<Listener>>();
  const state = { height: initial.height, offsetTop: initial.offsetTop, scale: initial.scale ?? 1 };
  const vv = {
    get height() {
      return state.height;
    },
    get offsetTop() {
      return state.offsetTop;
    },
    get scale() {
      return state.scale;
    },
    addEventListener: (type: string, cb: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener: (type: string, cb: Listener) => {
      listeners.get(type)?.delete(cb);
    },
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  return {
    set(next: Partial<typeof initial>) {
      Object.assign(state, next);
      listeners.get("resize")?.forEach((cb) => cb());
    },
  };
}

const originalVV = window.visualViewport;
const originalInnerHeight = window.innerHeight;

afterEach(() => {
  Object.defineProperty(window, "visualViewport", { value: originalVV, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: originalInnerHeight, configurable: true });
});

describe("useVisualViewportBounds", () => {
  it("returns null when visualViewport is unavailable", () => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));
    expect(result.current).toBeNull();
  });

  it("computes height as the given fraction of the current visual viewport height", () => {
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    installVisualViewport({ height: 844, offsetTop: 0 });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));
    expect(result.current).not.toBeNull();
    expect(result.current!.height).toBeCloseTo(844 * 0.8);
    expect(result.current!.bottomInset).toBe(0);
  });

  it("shrinks height and grows bottomInset when a keyboard reduces the visual viewport", () => {
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    const vv = installVisualViewport({ height: 844, offsetTop: 0 });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));

    act(() => vv.set({ height: 500 })); // a keyboard now covers ~344px
    expect(result.current!.height).toBeCloseTo(500 * 0.8);
    expect(result.current!.bottomInset).toBeCloseTo(344);
  });

  it("accounts for offsetTop (the page having panned) as well as height", () => {
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    const vv = installVisualViewport({ height: 844, offsetTop: 0 });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));

    act(() => vv.set({ height: 500, offsetTop: 50 }));
    // 844 total - 500 visible - 50 already panned off the top = 294 left uncovered at the bottom.
    expect(result.current!.bottomInset).toBeCloseTo(294);
  });

  it("recovers to the full bounds when the keyboard closes again", () => {
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    const vv = installVisualViewport({ height: 844, offsetTop: 0 });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));

    act(() => vv.set({ height: 500 }));
    act(() => vv.set({ height: 844 }));
    expect(result.current!.height).toBeCloseTo(844 * 0.8);
    expect(result.current!.bottomInset).toBe(0);
  });

  it("ignores updates while the page is pinch-zoomed (scale !== 1)", () => {
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    const vv = installVisualViewport({ height: 844, offsetTop: 0 });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));
    const before = result.current;

    act(() => vv.set({ height: 400, scale: 2 }));
    expect(result.current).toEqual(before); // unchanged — a real resize/pan, not a zoom
  });

  it("works in landscape too (a wider, shorter viewport)", () => {
    Object.defineProperty(window, "innerHeight", { value: 390, configurable: true });
    installVisualViewport({ height: 390, offsetTop: 0 });
    const { result } = renderHook(() => useVisualViewportBounds(0.8));
    expect(result.current!.height).toBeCloseTo(390 * 0.8);
  });
});
