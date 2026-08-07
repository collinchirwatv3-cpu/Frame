"use client";

import { useEffect, useState } from "react";

// Matches the `md` breakpoint used elsewhere (SideRail, BottomNav) to draw
// the same mobile/desktop line — phones only, tablets and desktops always
// get the cinematic landscape layout regardless of window shape.
const MOBILE_QUERY = "(max-width: 767px)";
const PORTRAIT_QUERY = "(orientation: portrait)";

/** Used by RotateDevicePrompt to nudge rotation once a video is actually
 * selected/playing — landscape is still the cinematic viewing orientation,
 * this just no longer gates which *layout* Home shows beforehand (see
 * useIsMobile below). */
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

// A plain `(max-width: 767px)` check isn't orientation-independent on its
// own — a same phone that's mobile-width in portrait can exceed 767px of
// *width* once rotated to landscape (e.g. a 393×852 phone becomes
// 852×393), which would wrongly read as "desktop" the moment it's turned
// sideways. Matching on width OR height instead catches the phone by
// whichever axis is currently its short one, in either orientation, while
// still correctly excluding real tablets (a 768×1024 iPad's short axis is
// 768 — just over this same breakpoint in both orientations).
const MOBILE_EITHER_AXIS_QUERY = "(max-width: 767px), (max-height: 767px)";

/** Phone-class device, either orientation — the home feed's tile grid uses
 * this (not useIsPortraitMobile) so it shows regardless of how the phone is
 * held; only tablets/desktop get the immersive swipe feed by default now. */
export function useIsMobile(): boolean {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_EITHER_AXIS_QUERY);
    const update = () => setValue(mobile.matches);

    update();
    mobile.addEventListener("change", update);
    return () => mobile.removeEventListener("change", update);
  }, []);

  return value;
}
