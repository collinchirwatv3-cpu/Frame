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
