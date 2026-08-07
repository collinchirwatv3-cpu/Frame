"use client";

import { useEffect, useState } from "react";

// Matches the `md` breakpoint used elsewhere (SideRail, BottomNav) to draw
// the same mobile/desktop line — phones only, tablets and desktops always
// get the cinematic landscape layout regardless of window shape.
const MOBILE_QUERY = "(max-width: 767px)";
const PORTRAIT_QUERY = "(orientation: portrait)";

/** Used by RotateDevicePrompt to nudge rotation once a video is actually
 * selected/playing — landscape is still the cinematic viewing orientation
 * for the immersive player. */
export function useIsPortraitMobile(): boolean {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_QUERY);
    const portrait = window.matchMedia(PORTRAIT_QUERY);
    const update = () => setValue(mobile.matches && portrait.matches);

    update();
    mobile.addEventListener("change", update);
    portrait.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      portrait.removeEventListener("change", update);
    };
  }, []);

  return value;
}
