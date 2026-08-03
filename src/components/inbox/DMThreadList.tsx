import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { DMThread } from "@/lib/mock-data";

export function DMThreadList({ threads }: { threads: DMThread[] }) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 text-center py-16 px-6">
        <span className="w-12 h-12 rounded-full bg-card border border-border flex items-center justify-center">
          <MessageCircle size={20} className="text-text-secondary" />
        </span>
        <p className="text-sm font-medium">No messages yet</p>
        <p className="text-xs text-text-secondary max-w-[220px]">
          When a creator or a follower sends you a message, it&apos;ll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {threads.map((t) => (
        <button
          key={t.id}
          className="flex items-center gap-3 px-6 py-3 hover:bg-card/60 transition-colors text-left"
        >
          <Avatar src={t.creator.avatarUrl} alt={t.creator.displayName} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm truncate">{t.creator.displayName}</span>
              <span className="text-xs text-text-secondary shrink-0">{t.timestamp}</span>
            </div>
            <p
              className={cn(
                "text-sm truncate mt-0.5",
                t.unread ? "text-accent font-medium" : "text-text-secondary"
              )}
            >
              {t.lastMessage}
            </p>
          </div>
          {t.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
        </button>
      ))}
    </div>
  );
}
