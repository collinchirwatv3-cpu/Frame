import Image from "next/image";
import Link from "next/link";
import type { Collection } from "@/lib/types";

/** Search's editorial section — the first live consumer of the real
 * collections/collection_videos tables (fetchFeaturedCollections). Larger
 * cards than CollectionsRail's shelf style, with the curator line the
 * reference design calls for; CollectionsRail/CollectionsShelf stay on
 * mock data and untouched by this component. */
export function FeaturedCollections({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary px-6">
        Featured Collections
      </span>
      <div className="flex gap-4 overflow-x-auto px-6 pb-1 no-scrollbar">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.id}`}
            className="shrink-0 w-72 rounded-2xl overflow-hidden bg-card border border-border group"
          >
            <div className="relative aspect-[16/10]">
              <Image
                src={collection.coverUrl}
                alt={collection.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/20 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-4">
                <p className="font-semibold truncate">{collection.title}</p>
                {collection.curatorName && (
                  <p className="text-xs text-text-secondary truncate mt-0.5">{collection.curatorName}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
