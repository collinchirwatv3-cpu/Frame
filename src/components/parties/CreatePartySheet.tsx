"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Search, X } from "lucide-react";
import { fetchPublicVideos } from "@/lib/watch-together";
import { matchesVideoQuery } from "@/lib/search";
import { createParty } from "@/lib/watch-parties";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

// Same shell as AddToQueueSheet.tsx (backdrop + spring slide-up sheet,
// bottom on mobile / centered card on desktop) — title input on top of the
// same search-and-pick video list, single-select instead of multi-add.
export function CreatePartySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<Video[]>([]);
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEscapeToClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    fetchPublicVideos().then((v) => {
      setVideos(v);
      setLoading(false);
    });
  }, [open]);

  // Reset the form fresh on each open — a render-time comparison against
  // the previous `open` value rather than an effect, since setState directly
  // in an effect body (even conditionally) trips this repo's stricter
  // (React Compiler-aligned) lint rule against it. Two setState calls in the
  // same render pass is the React-documented pattern for exactly this shape.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setTitle("");
      setSelectedId(null);
      setQuery("");
    }
  }

  const shown = videos.filter((v) => matchesVideoQuery(v, query));
  const canCreate = title.trim().length > 0 && selectedId !== null && !creating;

  async function handleCreate() {
    if (!canCreate || !selectedId) return;
    setCreating(true);
    const party = await createParty({ title: title.trim(), videoId: selectedId });
    setCreating(false);
    if (!party) return;
    onClose();
    router.push(`/watch-together/${party.id}?v=${selectedId}`);
  }

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
            aria-label="New party"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[71] flex flex-col bg-card border-t border-border rounded-t-2xl max-h-[85vh] md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-base font-semibold">New party</h2>
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
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Party name"
                maxLength={80}
                aria-label="Party name"
                className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2 focus-within:border-primary transition-colors">
                <Search size={14} className="text-text-secondary shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Pick a film to start with"
                  aria-label="Search films to start the party with"
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-3 flex flex-col gap-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={22} className="animate-spin text-text-secondary" />
                </div>
              ) : shown.length === 0 ? (
                <p className="text-center text-text-secondary text-sm py-10">No films found.</p>
              ) : (
                shown.map((video) => {
                  const selected = selectedId === video.id;
                  return (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => setSelectedId(video.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-xl hover:bg-bg transition-colors text-left",
                        selected && "bg-bg"
                      )}
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
                      {selected && <Check size={16} className="text-primary shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-5 pt-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate}
                className="w-full py-2.5 rounded-full bg-primary text-bg text-sm font-semibold disabled:opacity-40 transition-opacity"
              >
                {creating ? "Creating…" : "Create party"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
