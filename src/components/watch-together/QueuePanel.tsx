"use client";

import Image from "next/image";
import { ChevronDown, ChevronUp, ListMusic, Plus, X } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import type { QueueItem } from "@/lib/use-watch-room";
import type { Video } from "@/lib/types";

/** Always-visible "Up next" section on the in-party page — replaces the old
 * horizontally-scrolling queue pills overlaid on the video. The add/browse
 * picker (AddToQueueSheet) is unchanged; this only owns the always-visible
 * list of what's already queued, plus the trigger to open that sheet. No
 * drag-and-drop here — a deliberate simplification versus the Base44
 * reference's drag handles; reorder is up/down buttons, same as before.
 *
 * Reorder/remove stay open to every participant, not just the host — the
 * queue is deliberately collaborative (see use-watch-room.ts's own doc
 * comment: making this host-only was explicitly tried and rejected once
 * already). Nothing here re-adds a host gate. */
export function QueuePanel({
  nowPlaying,
  queue,
  onMove,
  onRemove,
  onAdd,
}: {
  nowPlaying: Video;
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
        <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-card shrink-0 ring-1 ring-primary/40">
          <Image src={nowPlaying.posterUrl} alt="" fill className="object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{nowPlaying.title}</p>
          <p className="text-xs text-primary font-medium">Now playing</p>
        </div>
        {nowPlaying.durationSeconds > 0 && (
          <span className="text-xs text-text-secondary tabular-nums shrink-0">
            {formatTimestamp(nowPlaying.durationSeconds)}
          </span>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <span className="w-11 h-11 rounded-full bg-card flex items-center justify-center">
            <ListMusic size={18} className="text-text-secondary" />
          </span>
          <div>
            <p className="text-sm font-medium">Your queue is empty</p>
            <p className="text-xs text-text-secondary mt-0.5">Add Frames to keep the party going.</p>
          </div>
          <button
            onClick={onAdd}
            className="px-4 py-2 rounded-full bg-primary text-bg text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus size={13} />
            Add Frames
          </button>
        </div>
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
            {!!item.durationSeconds && (
              <span className="text-xs text-text-secondary tabular-nums shrink-0">
                {formatTimestamp(item.durationSeconds)}
              </span>
            )}
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
