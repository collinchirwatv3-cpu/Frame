"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { SharedVideoPlayer } from "@/components/share/SharedVideoPlayer";
import { ExpiredLinkNotice } from "@/components/share/ExpiredLinkNotice";
import { useShareLinksStore } from "@/store/share-links-store";
import { getShareLinkStatus } from "@/lib/share-links";
import { videos, privateVideos } from "@/lib/mock-data";

const allVideos = [...videos, ...privateVideos];

export default function SharedVideoPage() {
  const params = useParams<{ token: string }>();
  const ready = useShareLinksStore((s) => s.hasHydrated);
  const link = useShareLinksStore((s) => s.links.find((l) => l.token === params.token));
  const recordView = useShareLinksStore((s) => s.recordView);
  const recorded = useRef(false);

  const status = link ? getShareLinkStatus(link) : null;
  const video = link ? allVideos.find((v) => v.id === link.videoId) : undefined;

  useEffect(() => {
    if (status === "active" && link && !recorded.current) {
      recorded.current = true;
      recordView(link.token);
    }
  }, [status, link, recordView]);

  if (!ready) return null;

  if (status === "active" && video) {
    return <SharedVideoPlayer video={video} />;
  }

  if (status === "revoked") {
    return <ExpiredLinkNotice reason="revoked" creator={video?.creator} posterUrl={video?.posterUrl} />;
  }

  if (status === "expired") {
    return <ExpiredLinkNotice reason="expired" creator={video?.creator} posterUrl={video?.posterUrl} />;
  }

  return <ExpiredLinkNotice reason="not-found" />;
}
