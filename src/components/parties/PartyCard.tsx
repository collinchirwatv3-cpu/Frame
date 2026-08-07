import Link from "next/link";
import Image from "next/image";
import { formatRelativeTime } from "@/lib/utils";
import type { WatchParty } from "@/lib/watch-parties";

export function PartyCard({ party }: { party: WatchParty }) {
  return (
    <Link
      href={`/watch-together/${party.id}${party.video ? `?v=${party.video.id}` : ""}`}
      className="relative block h-40 rounded-2xl overflow-hidden bg-card"
    >
      {party.video?.posterUrl && (
        <Image src={party.video.posterUrl} alt="" fill className="object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <p className="font-semibold truncate">{party.title}</p>
        <p className="text-sm text-text-secondary truncate">
          Host: {party.host.displayName} · {formatRelativeTime(party.createdAt)}
        </p>
      </div>
    </Link>
  );
}
