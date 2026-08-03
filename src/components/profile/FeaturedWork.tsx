import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import type { Collection, Video } from "@/lib/types";

function FeaturedCard({
  label,
  href,
  coverUrl,
  title,
  subtitle,
}: {
  label: string;
  href: string;
  coverUrl: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="group relative flex-1 rounded-2xl overflow-hidden aspect-video bg-card border border-border">
      <Image
        src={coverUrl}
        alt={title}
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/20 to-transparent" />
      <Play
        size={26}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent opacity-0 group-hover:opacity-100 transition-opacity"
        fill="currentColor"
      />
      <div className="absolute top-3 left-3 text-[10px] font-semibold uppercase tracking-wide text-primary bg-bg/70 backdrop-blur-md rounded-full px-2.5 py-1">
        {label}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3">
        <p className="text-sm font-semibold truncate">{title}</p>
        <p className="text-xs text-text-secondary truncate">{subtitle}</p>
      </div>
    </Link>
  );
}

export function FeaturedWork({
  featuredVideo,
  featuredCollection,
}: {
  featuredVideo?: Video;
  featuredCollection?: Collection;
}) {
  if (!featuredVideo && !featuredCollection) return null;

  return (
    <div className="px-6 mt-6 flex flex-col md:flex-row gap-3">
      {featuredVideo && (
        <FeaturedCard
          label="Featured film"
          href={`/?v=${featuredVideo.id}`}
          coverUrl={featuredVideo.posterUrl}
          title={featuredVideo.title}
          subtitle={featuredVideo.description}
        />
      )}
      {featuredCollection && (
        <FeaturedCard
          label="Featured collection"
          href={`/collections/${featuredCollection.id}`}
          coverUrl={featuredCollection.coverUrl}
          title={featuredCollection.title}
          subtitle={featuredCollection.description}
        />
      )}
    </div>
  );
}
