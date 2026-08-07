"use client";

import { useEffect, useState } from "react";

// Width can't tell a rotated phone apart from a desktop/tablet window once
// you're in landscape — a phone's WIDTH becomes its longer dimension, and
// plenty of phones exceed the md breakpoint that way (iPhone 14 landscape
// is ~844px wide, well past 768). Height doesn't have that problem: even
// the biggest phones stay short in landscape (~350-430px), while real
// desktop/tablet windows — including iPad in landscape at ~744px tall —
// stay well above this threshold regardless of how narrow someone resizes
// them. That's the actual signal SideRail/LandscapeSideRail need: not
// "is the viewport landscape-shaped," but "is this a handheld device
// that's been rotated."
const LANDSCAPE_QUERY = "(orientation: landscape)";
const SHORT_QUERY = "(max-height: 500px)";

/** Used by SideRail (to duck out of the way) and LandscapeSideRail (to take
 * over) so a rotated phone always gets the compact rail regardless of how
 * wide that particular phone happens to be in landscape. */
export function useIsLandscapeMobile(): boolean {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const landscape = window.matchMedia(LANDSCAPE_QUERY);
    const short = window.matchMedia(SHORT_QUERY);
    const update = () => setValue(landscape.matches && short.matches);

    update();
    landscape.addEventListener("change", update);
    short.addEventListener("change", update);
    return () => {
      landscape.removeEventListener("change", update);
      short.removeEventListener("change", update);
    };
  }, []);

  return value;
}
