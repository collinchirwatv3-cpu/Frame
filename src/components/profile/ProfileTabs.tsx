"use client";

import { useState } from "react";
import { Bookmark, LayoutGrid, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudioVideoGrid } from "./StudioVideoGrid";
import { PrivateVideoList } from "./PrivateVideoList";
import { SavedCollections } from "./SavedCollections";
import type { OwnVideo } from "@/lib/profile-videos";
import type { Video } from "@/lib/types";

export function ProfileTabs({
  videos,
  privateVideos,
  creator,
}: {
  videos: OwnVideo[];
  privateVideos: Video[];
  creator: Video["creator"];
}) {
  const [tab, setTab] = useState<"videos" | "collections" | "private">("videos");

  const tabs = [
    { id: "videos" as const, label: "Videos", icon: LayoutGrid },
    { id: "collections" as const, label: "Collections", icon: Bookmark },
    { id: "private" as const, label: "Private", icon: Lock },
  ];

  return (
    <div className="mt-8">
      <div className="flex items-center justify-center gap-10 border-b border-border">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id ? "border-accent text-accent" : "border-transparent text-text-secondary"
            )}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {tab === "videos" && <StudioVideoGrid videos={videos} creator={creator} />}
        {tab === "collections" && <SavedCollections />}
        {tab === "private" && <PrivateVideoList videos={privateVideos} />}
      </div>
    </div>
  );
}
