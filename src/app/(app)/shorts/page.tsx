"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ShortsFeed } from "@/components/shorts/ShortsFeed";
import { ShortUploadDropzone } from "@/components/upload/ShortUploadDropzone";
import { fetchShorts } from "@/lib/video-fetch";
import type { Video } from "@/lib/types";

export default function ShortsPage() {
  const [shorts, setShorts] = useState<Video[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    fetchShorts().then(setShorts);
  }, []);

  function handleClose() {
    setUploadOpen(false);
    fetchShorts().then(setShorts);
  }

  return (
    <div className="relative h-dvh w-full">
      <ShortsFeed shorts={shorts} />

      <button
        onClick={() => setUploadOpen(true)}
        aria-label="Post a short"
        className="fixed bottom-24 md:bottom-8 right-6 z-40 w-12 h-12 rounded-full bg-primary text-bg flex items-center justify-center shadow-lg"
      >
        <Plus size={22} />
      </button>

      {uploadOpen && <ShortUploadDropzone onClose={handleClose} />}
    </div>
  );
}
