"use client";

import { useEffect, useState } from "react";
import { ShortsFeed } from "@/components/shorts/ShortsFeed";
import { fetchShorts } from "@/lib/video-fetch";
import type { Video } from "@/lib/types";

export default function ShortsPage() {
  const [shorts, setShorts] = useState<Video[]>([]);

  useEffect(() => {
    fetchShorts().then(setShorts);
  }, []);

  return (
    <div className="relative h-dvh w-full">
      <ShortsFeed shorts={shorts} />
    </div>
  );
}
