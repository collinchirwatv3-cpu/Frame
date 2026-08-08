import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { deleteParty, type WatchParty } from "@/lib/watch-parties";
import { useCurrentUserStore } from "@/store/current-user-store";

export function PartyCard({ party, onDeleted }: { party: WatchParty; onDeleted?: () => void }) {
  const ownProfile = useCurrentUserStore((s) => s.profile);
  const isHost = ownProfile?.id === party.host.id;
  const [deleting, setDeleting] = useState(false);

  async function handleEnd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting || !window.confirm("End this watch party? It'll be removed from the list.")) return;
    setDeleting(true);
    const ok = await deleteParty(party.id);
    if (ok) onDeleted?.();
    else setDeleting(false);
  }

  return (
    <Link
      href={`/watch-together/${party.id}${party.video ? `?v=${party.video.id}` : ""}`}
      className="relative block h-40 rounded-2xl overflow-hidden bg-card"
    >
      {party.video?.posterUrl && (
        <Image src={party.video.posterUrl} alt="" fill className="object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/20 to-transparent" />
      {isHost && (
        <button
          type="button"
          onClick={handleEnd}
          disabled={deleting}
          aria-label="End party"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-bg/70 backdrop-blur-md flex items-center justify-center disabled:opacity-50"
        >
          <X size={14} />
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-semibold truncate">{party.title}</p>
        <p className="text-sm text-text-secondary truncate">
          Host: {party.host.displayName} · {formatRelativeTime(party.createdAt)}
        </p>
      </div>
    </Link>
  );
}
