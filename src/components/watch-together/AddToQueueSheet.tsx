"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { fetchPublicVideos } from "@/lib/watch-together";
import { matchesVideoQuery } from "@/lib/search";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import type { QueueItem } from "@/lib/use-watch-room";
import type { Video } from "@/lib/types";

export function AddToQueueSheet({
  open,
  onClose,
  onAdd,
  queuedIds,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: QueueItem) => void;
  queuedIds: string[];
}) {
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [query, setQuery] = useState("");
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEscapeToClose(open, onClose);

  useEffect(() => {
    // Loading starts true and only ever flips false once — reopening the
    // sheet refreshes the list quietly in the background rather than
    // flashing the spinner again.
    if (!open) return;
    fetchPublicVideos().then((v) => {
      setVideos(v);
      setLoading(false);
    });
  }, [open]);

  function handleAdd(video: Video) {
    onAdd({
      id: video.id,
      title: video.title,
      posterUrl: video.posterUrl,
      creatorUsername: video.creator.username,
    });
    setJustAdded(video.id);
    window.setTimeout(() => setJustAdded(null), 1200);
  }

  const shown = videos.filter((v) => matchesVideoQuery(v, query));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-bg/70 backdrop-blur-sm z-[70]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Add to queue"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[71] flex flex-col bg-card border-t border-border rounded-t-2xl max-h-[80vh] md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-base font-semibold">Add to queue</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2 focus-within:border-primary transition-colors">
                <Search size={14} className="text-text-secondary shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search videos"
                  aria-label="Search videos to add"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-5 flex flex-col gap-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-text-secondary" />
                </div>
              ) : shown.length === 0 ? (
                <p className="text-center text-text-secondary text-sm py-10">No videos found.</p>
              ) : (
                shown.map((video) => {
                  const queued = queuedIds.includes(video.id) || justAdded === video.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => !queued && handleAdd(video)}
                      disabled={queued}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-bg transition-colors text-left disabled:opacity-60"
                    >
                      <div className="relative w-16 h-10 shrink-0 rounded-lg overflow-hidden bg-bg">
                        <Image src={video.posterUrl} alt="" fill className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{video.title}</p>
                        <p className="text-xs text-text-secondary truncate">
                          @{video.creator.username}
                        </p>
                      </div>
                      {queued ? (
                        <Check size={16} className="text-primary shrink-0" />
                      ) : (
                        <Plus size={16} className="text-text-secondary shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
