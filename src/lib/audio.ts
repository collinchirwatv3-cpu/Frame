/** Ramps an HTMLMediaElement's volume instead of snapping it — video should
 * never begin or end abruptly. Cancels cleanly if called again mid-fade
 * (e.g. rapid mute toggling) since each call owns its own rAF loop keyed to
 * the element via a WeakMap guard. */
const activeFades = new WeakMap<HTMLMediaElement, number>();

/** HTMLMediaElement.volume throws (IndexSizeError) for anything outside
 * [0, 1] rather than clamping itself — a fade landing on 1.0000000001 or
 * -0.0000000001, which floating-point interpolation does often enough in
 * practice, crashes instead of just... being 1 or 0. */
function clampVolume(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function fadeVolume(el: HTMLMediaElement, from: number, to: number, ms: number) {
  const existing = activeFades.get(el);
  if (existing) cancelAnimationFrame(existing);

  const start = performance.now();
  el.volume = clampVolume(from);

  function step(now: number) {
    const t = Math.min(1, (now - start) / ms);
    el.volume = clampVolume(from + (to - from) * t);
    if (t < 1) {
      activeFades.set(el, requestAnimationFrame(step));
    } else {
      activeFades.delete(el);
    }
  }

  activeFades.set(el, requestAnimationFrame(step));
}
