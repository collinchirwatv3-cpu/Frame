import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Lock, Users, X } from "lucide-react";
import { formatRelativeTime, cn } from "@/lib/utils";
import { deleteParty, type WatchParty } from "@/lib/watch-parties";
import { useCurrentUserStore } from "@/store/current-user-store";
import { CHROME_GLASS_CLASS, CHROME_TAP_SCALE_CLASS } from "@/lib/chrome";
import { useInView } from "@/lib/use-in-view";
import { usePartyPresenceCount } from "@/lib/use-party-presence-count";

// "Repeats weekly" alone doesn't need the exact date; a one-off schedule
// does. Deliberately no year — these are always near-future.
function formatSchedule(party: WatchParty): string | null {
  if (party.repeatRule !== "none") {
    return `Repeats ${party.repeatRule}`;
  }
  if (!party.scheduledAt) return null;
  const formatted = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(party.scheduledAt));
  return `Starts ${formatted}`;
}

export function PartyCard({ party, onDeleted }: { party: WatchParty; onDeleted?: () => void }) {
  const ownProfile = useCurrentUserStore((s) => s.profile);
  const isHost = ownProfile?.id === party.host.id;
  const [deleting, setDeleting] = useState(false);
  const schedule = formatSchedule(party);
  const { ref, inView } = useInView<HTMLAnchorElement>();
  const watching = usePartyPresenceCount(party.id, inView);

  async function handleEnd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting || !window.confirm("End this Frame Party? It'll be removed from the list.")) return;
    setDeleting(true);
    const ok = await deleteParty(party.id);
    if (ok) onDeleted?.();
    else setDeleting(false);
  }

  return (
    <Link
      ref={ref}
      href={`/watch-together/${party.id}${party.video ? `?v=${party.video.id}` : ""}`}
      className="group relative block h-44 rounded-2xl overflow-hidden bg-card"
    >
      {party.video?.posterUrl && (
        <Image
          src={party.video.posterUrl}
          alt=""
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/25 to-transparent" />
      {party.visibility === "private" && (
        <span
          className={cn(
            CHROME_GLASS_CLASS,
            "absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium"
          )}
        >
          <Lock size={10} />
          Private
        </span>
      )}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        {watching > 0 && (
          <span
            className={cn(CHROME_GLASS_CLASS, "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium")}
            aria-label={`${watching} watching`}
          >
            <Users size={10} />
            {watching}
          </span>
        )}
        {isHost && (
          <button
            type="button"
            onClick={handleEnd}
            disabled={deleting}
            aria-label="End party"
            className={cn(
              CHROME_GLASS_CLASS,
              CHROME_TAP_SCALE_CLASS,
              "w-8 h-8 flex items-center justify-center disabled:opacity-50"
            )}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-semibold truncate">{party.title}</p>
        <p className="text-sm text-text-secondary truncate">
          Host: {party.host.displayName} · {formatRelativeTime(party.createdAt)}
        </p>
        {schedule && <p className="text-xs text-primary font-medium truncate mt-0.5">{schedule}</p>}
      </div>
    </Link>
  );
}
