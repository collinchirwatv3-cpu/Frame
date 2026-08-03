"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, Film, LayoutGrid, Lock, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrendingGrid } from "@/components/explore/TrendingGrid";
import { PrivateVideoList } from "./PrivateVideoList";
import { SavedCollections } from "./SavedCollections";
import type { Video } from "@/lib/types";

export function ProfileTabs({
  videos,
  privateVideos,
}: {
  videos: Video[];
  privateVideos: Video[];
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
        {tab === "videos" && (
          <TrendingGrid
            videos={videos}
            emptyState={
              <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
                <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
                  <Film size={20} className="text-text-secondary" />
                </span>
                <p className="text-sm font-medium">Nothing uploaded yet</p>
                <p className="text-xs text-text-secondary max-w-[220px]">
                  Your public films will show up here once you publish your first one.
                </p>
                <Link
                  href="/upload"
                  className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-bg text-xs font-semibold"
                >
                  <UploadCloud size={13} />
                  Upload a film
                </Link>
              </div>
            }
          />
        )}
        {tab === "collections" && <SavedCollections />}
        {tab === "private" && <PrivateVideoList videos={privateVideos} />}
      </div>
    </div>
  );
}
