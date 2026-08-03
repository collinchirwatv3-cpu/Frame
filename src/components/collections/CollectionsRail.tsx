import Image from "next/image";
import Link from "next/link";
import type { Collection } from "@/lib/types";

export function CollectionsRail({
  collections,
  title = "Collections",
}: {
  collections: Collection[];
  title?: string;
}) {
  if (collections.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold px-6">{title}</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
        {collections.map((c) => (
          <Link
            key={c.id}
            href={`/collections/${c.id}`}
            className="shrink-0 w-56 rounded-xl overflow-hidden bg-card border border-border group"
          >
            <div className="relative aspect-video">
              <Image
                src={c.coverUrl}
                alt={c.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent" />
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold">{c.title}</p>
              <p className="text-xs text-text-secondary line-clamp-1 mt-0.5">{c.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
