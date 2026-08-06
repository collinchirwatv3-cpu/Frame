/** Shared motion vocabulary — every animation in FRAMES should reach for these
 * instead of inventing new durations/curves inline, so the app moves like one
 * considered thing rather than a pile of ad hoc springs. */

export const DURATION = {
  /** Micro feedback — icon taps, small state flips */
  fast: 0.15,
  /** Default UI motion — sheets, fades, most transitions */
  base: 0.35,
  /** Cinematic beats — feed focus-pull, Director Mode chrome fade */
  slow: 0.5,
} as const;

/** A gentle "settle" curve — decelerates smoothly, never bounces or snaps.
 * Cubic-bezier equivalent of a soft ease-out, tuned to feel unhurried. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Reusable spring for sheets/drawers — calm, no overshoot wobble. */
export const SHEET_SPRING = { type: "spring", stiffness: 320, damping: 34 } as const;

/** The focus-pull used when a feed video becomes the active one. */
export const FOCUS_PULL_TRANSITION = { duration: DURATION.slow, ease: EASE_OUT } as const;

/** Chrome fade for Director Mode and similar full-UI show/hide moments. */
export const CHROME_FADE_TRANSITION = { duration: DURATION.base, ease: EASE_OUT } as const;
