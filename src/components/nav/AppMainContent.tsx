"use client";

import { usePathname } from "next/navigation";
import { useIsLandscapeMobile } from "@/lib/use-landscape-mobile";
import { hidesFloatingNav } from "@/lib/nav-routes";

/** Wraps every (app)-shell page's content so it reserves real space for
 * LandscapeSideRail — that rail is a `fixed left-4` overlay (so it can float
 * above scrolling content the same way BottomNav floats over the bottom),
 * which meant page content had no left padding accounting for it at all: on
 * a rotated phone, the rail's icons sat directly on top of page headings and
 * the first column of every grid. BottomNav's own equivalent bottom overlap
 * is already handled per-page (pb-24 etc.) since it's the much more common
 * case; this fixes the landscape-only counterpart in one shared place
 * instead of retrofitting every page. Matches the rail's own left-4 inset +
 * icon width + safe-area inset, plus a little breathing room.
 *
 * On routes where the rail itself hides (hidesFloatingNav — currently an
 * open DM conversation), this reservation must hide right along with it,
 * or the page is left with a phantom left gutter where a rail that isn't
 * actually there used to float. */
export function AppMainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandscapeMobile = useIsLandscapeMobile();
  const reserveRailSpace = isLandscapeMobile && !hidesFloatingNav(pathname);

  return (
    <main
      className="flex-1 min-w-0"
      style={reserveRailSpace ? { paddingLeft: "calc(4rem + env(safe-area-inset-left))" } : undefined}
    >
      {children}
    </main>
  );
}
