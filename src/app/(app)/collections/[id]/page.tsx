import Image from "next/image";
import { notFound } from "next/navigation";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { SaveCollectionButton } from "@/components/collections/SaveCollectionButton";
import { SearchButton } from "@/components/ui/SearchButton";
import { collections, videos } from "@/lib/mock-data";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collection = collections.find((c) => c.id === id);
  if (!collection) notFound();

  const collectionVideos = videos.filter((v) => collection.videoIds.includes(v.id));

  return (
    <div className="pb-24 md:pb-8">
      <div className="relative h-48 md:h-64 w-full">
        <Image src={collection.coverUrl} alt="" fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-bg/10" />
        <SearchButton className="absolute top-4 right-4 md:top-6 md:right-6" />
      </div>

      <div className="px-6 -mt-12 relative">
        <h1 className="text-2xl font-bold">{collection.title}</h1>
        <p className="text-sm text-text-secondary mt-1 max-w-lg">{collection.description}</p>
        <div className="mt-4">
          <SaveCollectionButton collectionId={collection.id} />
        </div>
      </div>

      <div className="mt-8">
        <TrendingGrid videos={collectionVideos} />
      </div>
    </div>
  );
}
