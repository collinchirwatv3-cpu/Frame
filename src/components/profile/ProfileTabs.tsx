"use client";

import { useEffect, useState } from "react";
import { Bookmark, History as HistoryIcon, LayoutGrid, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { StudioVideoGrid } from "./StudioVideoGrid";
import { ProfileVideoGrid } from "./ProfileVideoGrid";
import { PrivateVideoList } from "./PrivateVideoList";
import { fetchSavedVideos, fetchHistoryVideos } from "@/lib/video-fetch";
import type { OwnVideo } from "@/lib/profile-videos";
import type { Video } from "@/lib/types";

// Saved/History are own-profile only — a privacy boundary, not a Base44
// screenshot detail. This component is only ever rendered on the owner's
// own /profile route (the [username] route keeps its own flat public grid
// with no tabs at all, unchanged by this component's existence). Private
// stays as its own tab alongside the reference design's Channel/Saved/
// History three — dropping real existing functionality (viewing your own
// unlisted uploads) wasn't part of the approved plan, only folding
// Collections away was.
export function ProfileTabs({
  videos,
  privateVideos,
  userId,
  creator,
}: {
  videos: OwnVideo[];
  privateVideos: Video[];
  userId: string;
  creator: Video["creator"];
}) {
  const [tab, setTab] = useState<"channel" | "saved" | "history" | "private">("channel");
  const [saved, setSaved] = useState<Video[]>([]);
  const [history, setHistory] = useState<Video[]>([]);

  // Fetched once per tab the first time it's opened, not on mount — Saved/
  // History are secondary tabs, no need to pay for both queries before the
  // owner ever looks at them.
  useEffect(() => {
    if (tab === "saved" && saved.length === 0) fetchSavedVideos(userId).then(setSaved);
    if (tab === "history" && history.length === 0) fetchHistoryVideos(userId).then(setHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId]);

  const tabs = [
    { id: "channel" as const, label: "Channel", icon: LayoutGrid },
    { id: "saved" as const, label: "Saved", icon: Bookmark },
    { id: "history" as const, label: "History", icon: HistoryIcon },
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
        {tab === "channel" && <StudioVideoGrid videos={videos} creator={creator} />}
        {tab === "saved" && (
          <ProfileVideoGrid
            videos={saved}
            emptyIcon={Bookmark}
            emptyHeading="Nothing saved yet"
            emptySubtext="Frames you save will show up here."
          />
        )}
        {tab === "history" && (
          <ProfileVideoGrid
            videos={history}
            emptyIcon={HistoryIcon}
            emptyHeading="No watch history yet"
            emptySubtext="Frames you watch will show up here."
          />
        )}
        {tab === "private" && <PrivateVideoList videos={privateVideos} />}
      </div>
    </div>
  );
}
