"use client";

import { useEffect, useState } from "react";

export type VisualViewportBounds = {
  /** How tall the sheet itself should be — `heightFraction` of whatever is
   * actually visible right now (shrinks as the keyboard opens, grows back
   * as it closes), not a static fraction of the full layout viewport. */
  height: number;
  /** Distance from the LAYOUT viewport's bottom edge to the VISUAL
   * viewport's bottom edge — 0 with no keyboard, growing to roughly the
   * keyboard's own height once one is open. A `position: fixed; bottom: 0`
   * element is anchored to the layout viewport's edge, which on-screen
   * keyboards typically leave untouched while only shrinking the visual
   * one — this is what pulls the element back up out from under the
   * keyboard instead of leaving it rendered behind/under it. */
  bottomInset: number;
};

/** Tracks `window.visualViewport` (keyboard open/close/pan) for an overlay
 * that lives OUTSIDE the normal scrolling document flow — the same
 * underlying signal ConversationViewport already uses for the main
 * conversation column, exposed here as bounds for a `position: fixed`
 * sheet instead. Returns `null` before mount and on browsers without
 * `visualViewport` (falls back to the caller's own static default). */
export function useVisualViewportBounds(heightFraction: number): VisualViewportBounds | null {
  const [bounds, setBounds] = useState<VisualViewportBounds | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (viewport.scale !== 1) return;
      setBounds({
        height: viewport.height * heightFraction,
        bottomInset: Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [heightFraction]);

  return bounds;
}
