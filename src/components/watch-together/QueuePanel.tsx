"use client";

import Image from "next/image";
import { ChevronDown, ChevronUp, Play, Plus, X } from "lucide-react";
import type { QueueItem } from "@/lib/use-watch-room";

/** Always-visible "Up next" section on the in-party page — replaces the old
 * horizontally-scrolling queue pills overlaid on the video. The add/browse
 * picker (AddToQueueSheet) is unchanged; this only owns the always-visible
 * list of what's already queued, plus the trigger to open that sheet. No
 * drag-and-drop here — a deliberate simplification versus the Base44
 * reference's drag handles; reorder is up/down buttons, same as before. */
export function QueuePanel({
  nowPlayingTitle,
  queue,
  onMove,
  onRemove,
  onAdd,
}: {
  nowPlayingTitle: string;
  queue: QueueItem[];
  onMove: (id: string, direction: "up" | "down") => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Up next</h2>
        <button onClick={onAdd} className="text-xs font-medium text-primary flex items-center gap-1">
          <Plus size={12} />
          Add Frames
        </button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <span className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Play size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{nowPlayingTitle}</p>
          <p className="text-xs text-primary">Now playing</p>
        </div>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-text-secondary text-center py-4">
          Your queue is empty. Add Frames to keep the party going.
        </p>
      ) : (
        queue.map((item, index) => (
          <div key={item.id} className="flex items-center gap-3 py-2">
            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-card shrink-0">
              <Image src={item.posterUrl} alt="" fill className="object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs text-text-secondary truncate">@{item.creatorUsername}</p>
            </div>
            <button
              onClick={() => onMove(item.id, "up")}
              disabled={index === 0}
              aria-label={`Move ${item.title} up`}
              className="p-1 rounded-full hover:bg-card transition-colors disabled:opacity-30 shrink-0"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => onMove(item.id, "down")}
              disabled={index === queue.length - 1}
              aria-label={`Move ${item.title} down`}
              className="p-1 rounded-full hover:bg-card transition-colors disabled:opacity-30 shrink-0"
            >
              <ChevronDown size={14} />
            </button>
            <button
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.title} from queue`}
              className="p-1 rounded-full hover:bg-card transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
