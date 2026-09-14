import Image from "next/image";
import { notFound } from "next/navigation";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { SaveCollectionButton } from "@/components/collections/SaveCollectionButton";
import { fetchCollectionDetail } from "@/lib/video-fetch";
import { createClient } from "@/lib/supabase/server";

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const result = await fetchCollectionDetail(id, await createClient());
  if (!result) notFound();
  const { collection, videos: collectionVideos } = result;

  return (
    <div className="pb-24 md:pb-8">
      <div className="relative h-48 md:h-64 w-full">
        <Image src={collection.coverUrl} alt="" fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-bg/10" />
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
