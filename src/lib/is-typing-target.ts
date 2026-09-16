/** True when `el` is something that consumes keystrokes as text — an
 * input, a textarea, or a contenteditable region. Used to guard `window`-
 * level keyboard-shortcut listeners (feed scroll/play-pause on
 * space/j/k/arrow keys) so they don't fire while the same keystroke is
 * meant to type a character into a modal's text field stacked on top of
 * the feed (e.g. Edit Frame's description, a comment composer). */
export function isTypingTarget(el: Element | null): boolean {
  return !!(
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable ||
      // jsdom doesn't compute isContentEditable from the contentEditable
      // attribute (a real browser does) — checked directly too so this
      // works the same in tests as in an actual browser.
      el.contentEditable === "true")
  );
}
