"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useEngagementStore } from "@/store/engagement-store";

export function SaveCollectionButton({ collectionId }: { collectionId: string }) {
  const saved = useEngagementStore((s) => !!s.savedCollections[collectionId]);
  const toggle = useEngagementStore((s) => s.toggleSavedCollection);

  return (
    <button
      onClick={() => toggle(collectionId)}
      className="flex items-center gap-2 px-4 py-2 rounded-full border border-border text-sm font-medium hover:bg-card transition-colors"
    >
      {saved ? (
        <BookmarkCheck size={15} className="text-primary" />
      ) : (
        <Bookmark size={15} />
      )}
      {saved ? "Saved" : "Save collection"}
    </button>
  );
}
