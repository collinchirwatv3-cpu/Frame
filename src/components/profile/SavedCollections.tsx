"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { CollectionsRail } from "@/components/collections/CollectionsRail";
import { useEngagementStore } from "@/store/engagement-store";
import { collections } from "@/lib/mock-data";

export function SavedCollections() {
  const savedCollections = useEngagementStore((s) => s.savedCollections);
  const saved = collections.filter((c) => savedCollections[c.id]);

  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <Bookmark size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">No collections saved yet</p>
        <p className="text-xs text-text-secondary max-w-[220px]">
          Save a collection from Explore to build your shelf here.
        </p>
        <Link
          href="/explore"
          className="mt-1 px-4 py-2 rounded-full bg-primary text-bg text-xs font-semibold"
        >
          Browse collections
        </Link>
      </div>
    );
  }

  return <CollectionsRail collections={saved} title="" />;
}
