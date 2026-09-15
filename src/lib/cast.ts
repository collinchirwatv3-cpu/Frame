"use client";

import { useCallback } from "react";

/** webkitShowPlaybackTargetPicker (AirPlay) is real and shipped, just never
 * standardized — not in lib.dom.d.ts, unlike the standard Remote Playback
 * API's `.remote` below. */
type AirPlayCapableVideo = HTMLVideoElement & {
  webkitShowPlaybackTargetPicker?: () => void;
};

/** Real AirPlay (Safari/WebKit's webkitShowPlaybackTargetPicker) and
 * Chromecast/DIAL (the standard Remote Playback API, `video.remote`)
 * casting — feature-detected per browser, not a placeholder.
 *
 * This only detects API *support*, not live "is a device actually nearby"
 * — Remote Playback's own watchAvailability() can reject with
 * NotSupportedError on browsers where prompt() still works fine, so
 * there's no reliable cross-browser availability signal worth trusting.
 * Same approach the native `<video controls>` cast button takes: show
 * whenever the API exists, let the OS-native picker itself say "no
 * devices found" if that's actually the case.
 *
 * `getVideo` is a function, not a stable ref — ShortsFeed's active
 * <video> element's identity changes as activeIndex changes, so it needs
 * to re-resolve on every call rather than close over one fixed element the
 * way VideoCard's stable ref could.
 *
 * `available` is computed directly during render, not via a
 * state+effect pair — it's a synchronous, side-effect-free DOM feature
 * check, nothing to synchronize with an external system. Ref attachment
 * means it reads as unavailable on a component's very first render (before
 * the ref has committed); the frequent re-renders every caller already has
 * (VideoCard's onTimeUpdate, ShortsFeed's own state) settle it to the real
 * value within one tick, same practical result without the extra
 * indirection. */
export function useCastControl(getVideo: () => HTMLVideoElement | null) {
  const el = getVideo() as AirPlayCapableVideo | null;
  const available = !!el && (typeof el.webkitShowPlaybackTargetPicker === "function" || "remote" in el);

  const triggerCast = useCallback(() => {
    const el = getVideo() as AirPlayCapableVideo | null;
    if (!el) return;
    if (typeof el.webkitShowPlaybackTargetPicker === "function") {
      el.webkitShowPlaybackTargetPicker();
    } else if (el.remote) {
      el.remote.prompt().catch(() => {});
    }
  }, [getVideo]);

  return { available, triggerCast };
}
