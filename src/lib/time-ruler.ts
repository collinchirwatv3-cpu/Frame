/** Picks readable, evenly-spaced tick positions (in seconds) along a
 * timeline of the given total duration — the same "nice round numbers"
 * ruler (0:00, 5:00, 10:00, ...) the upload flow's Trim/Cover frame
 * tracks use, scaled to whatever duration is actually being scrubbed
 * rather than a fixed 5-minute step. Always includes 0. */
const NICE_INTERVALS_SECONDS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export function pickTicks(durationSeconds: number, targetCount = 5): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [0];
  const rawInterval = durationSeconds / targetCount;
  const interval =
    NICE_INTERVALS_SECONDS.find((n) => n >= rawInterval) ?? NICE_INTERVALS_SECONDS[NICE_INTERVALS_SECONDS.length - 1];
  const ticks: number[] = [];
  for (let t = 0; t < durationSeconds; t += interval) ticks.push(t);
  return ticks;
}

/** Purely decorative minor tick marks drawn along the track itself
 * (dense, unlabeled) — a fixed count regardless of duration, unlike the
 * labeled major ticks above. */
export const MINOR_TICK_FRACTIONS = Array.from({ length: 21 }, (_, i) => i / 20);
