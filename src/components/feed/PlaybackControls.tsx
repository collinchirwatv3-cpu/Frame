"use client";

import { Cast, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS } from "@/lib/chrome";
import { usePlayerStore } from "@/store/player-store";

/** Top-left playback cluster, shared by VideoCard and ShortsFeed — mute
 * moved here out of ActionRail's right-side rail to match the reference
 * layout. Cast triggers real AirPlay/Remote Playback (lib/cast.ts's
 * useCastControl) — callers own resolving their own <video> element and
 * pass the result down, since ShortsFeed's active element changes
 * identity with activeIndex while VideoCard's stays stable. Disabled
 * (not hidden) when neither API exists on this browser, same as the
 * native <video controls> cast button's own behavior. */
export function PlaybackControls({
  compact,
  castAvailable,
  onCast,
}: {
  compact?: boolean;
  castAvailable: boolean;
  onCast: () => void;
}) {
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
        onClick={onCast}
        disabled={!castAvailable}
        aria-label={castAvailable ? "Cast to a device" : "Casting isn't supported on this browser"}
        className={cn(
          CHROME_GLASS_CLASS,
          castAvailable && CHROME_TAP_SCALE_CLASS,
          size,
          "flex items-center justify-center shrink-0",
          !castAvailable && "opacity-50"
        )}
      >
        <Cast size={18} />
      </button>
    </div>
  );
}
