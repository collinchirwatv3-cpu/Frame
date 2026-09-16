/** Routes where the floating mobile navigation (BottomNav,
 * LandscapeSideRail) must get out of the way entirely, not just leave a
 * little padding around it the way every other page's own `pb-24`
 * convention does. An individual DM conversation's header and composer
 * already claim the full top and bottom edges of the screen — the
 * floating nav has nowhere to sit there without covering the composer
 * (portrait) or landscape's message list.
 *
 * A single shared check, not three separate ad hoc `pathname.startsWith`
 * calls in BottomNav/LandscapeSideRail/AppMainContent — those three have
 * to agree on exactly the same route or a rail can hide while
 * AppMainContent still reserves the space it used to occupy (a phantom
 * gutter), or vice versa.
 *
 * The inbox LIST route (/inbox) deliberately keeps the floating nav —
 * only a specific open conversation (/inbox/messages/[threadId]) hides
 * it, which is why this can't just be `pathname.startsWith("/inbox")`.
 */
export function hidesFloatingNav(pathname: string): boolean {
  return /^\/inbox\/messages\/[^/]+\/?$/.test(pathname);
}

/** Routes where SideRail's real 240px flex column — not the floating rails
 * above — must not render at all, so the video feed can actually reach the
 * screen edge instead of getting squeezed into the remaining width.
 *
 * SideRail already collapses to width 0 under Director Mode, but that's a
 * timed idle-based fade (and on some viewports doesn't engage the way it
 * does on a phone) — good for "hide while I'm not touching anything," not
 * a guarantee for "this route's whole point is a full-bleed video." /shorts
 * (Frames) and /discover are continuous video feeds the same way
 * /watch/[id] is — that route gets full-bleed by living outside the
 * (app) route group entirely; these two can't do that (they still need
 * BottomNav/LandscapeSideRail's floating nav, which /watch/[id] also
 * lacks), so they opt out of just the one flex-space-consuming rail
 * instead. BottomNav stays available at tablet/desktop widths on these routes,
 * since there is no sidebar to provide primary navigation. */
export function hidesSideRail(pathname: string): boolean {
  return /^\/(shorts|discover)(\/|$)/.test(pathname);
}
