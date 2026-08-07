import Image from "next/image";
import Link from "next/link";
import type { Collection } from "@/lib/types";

/**
 * Collections, styled to match Shelf.tsx exactly (same heading size, same
 * fixed card height) rather than reusing CollectionsRail's own look
 * (bigger heading, wider fixed-width cards with a separate text block below
 * the image instead of overlaid on it) — that component stays as-is for
 * where it already lives (Profile's Saved Collections); this is a
 * Home-specific sibling so fixing Home's consistency doesn't change how
 * Collections looks anywhere else.
 */
export function CollectionsShelf({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) return null;

  return (
    <section className="py-3">
      <h2 className="px-6 text-sm font-semibold mb-2.5">Collections</h2>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1">
        {collections.map((c) => (
          <Link
            key={c.id}
            href={`/collections/${c.id}`}
            aria-label={`View the ${c.title} collection`}
            className="group relative flex-shrink-0 h-28 md:h-32 aspect-video rounded-xl overflow-hidden bg-card border border-border"
          >
            <Image
              src={c.coverUrl}
              alt={c.title}
              fill
              sizes="(max-width: 768px) 45vw, 320px"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg/85 via-transparent to-transparent" />
            <div className="absolute bottom-0 inset-x-0 p-2">
              <p className="text-[11px] font-semibold truncate">{c.title}</p>
              <p className="text-[10px] text-text-secondary truncate">{c.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
