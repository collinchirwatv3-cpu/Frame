import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { videos } from "@/lib/mock-data";
import { WatchRedirect } from "./WatchRedirect";

// Public share previews only — deliberately searches `videos`, never
// `privateVideos`. A private video must never get a crawlable, publicly
// unfurlable URL; that's what the token-gated /s/[token] route is for.
function findVideo(id: string) {
  return videos.find((v) => v.id === id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = findVideo(id);
  if (!video) return { title: "FRAMES" };

  const title = `${video.title} — FRAMES`;
  const description = `${video.description} · @${video.creator.username} on FRAMES`;

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
  if (!findVideo(id)) notFound();

  return <WatchRedirect videoId={id} />;
}
