"use client";

import { Cast, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS } from "@/lib/chrome";
import { usePlayerStore } from "@/store/player-store";

/** Top-left playback cluster, shared by VideoCard and ShortsFeed — mute
 * moved here out of ActionRail's right-side rail to match the reference
 * layout. Cast is a visual placeholder only: FRAME has no Chromecast/AirPlay
 * integration (the Remote Playback API / Cast SDK is real work, not a
 * layout change), so it's disabled and just reserves its spot for when
 * that's actually built — don't mistake its presence here for working
 * casting. */
export function PlaybackControls({ compact }: { compact?: boolean }) {
  const muted = usePlayerStore((s) => s.muted);
  const toggleMuted = usePlayerStore((s) => s.toggleMuted);
  const size = compact ? "w-9 h-9" : "w-10 h-10";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMuted}
        aria-pressed={muted}
        aria-label={muted ? "Unmute" : "Mute"}
        className={cn(
          CHROME_GLASS_CLASS,
          CHROME_TAP_SCALE_CLASS,
          size,
          "flex items-center justify-center shrink-0"
        )}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>
      <button
        disabled
        aria-label="Cast — not available yet"
        className={cn(CHROME_GLASS_CLASS, size, "flex items-center justify-center shrink-0 opacity-50")}
      >
        <Cast size={18} />
      </button>
    </div>
  );
}
