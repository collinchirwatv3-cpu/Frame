import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchWatchPreview } from "./data";
import { WatchRedirect } from "./WatchRedirect";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await fetchWatchPreview(id);
  if (!video) return { title: "FRAMES" };

  const title = `${video.title} — FRAMES`;
  const description = `${video.description} · @${video.creatorUsername} on FRAMES`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "video.other",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await fetchWatchPreview(id);
  if (!video) notFound();

  return <WatchRedirect videoId={id} />;
}
