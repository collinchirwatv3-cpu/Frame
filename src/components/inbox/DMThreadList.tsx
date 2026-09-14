"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { formatRelativeTime } from "@/lib/utils";
import { fetchThreads, type DMThread } from "@/lib/dm";
import { useDMRealtime } from "@/lib/use-dm-realtime";

function ListSkeleton() {
  return (
    <div className="flex flex-col px-6">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-11 h-11 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Real 1:1 threads now, not a "coming soon" placeholder — a small section
 * inside the Inbox, same as before, with a real destination
 * (/inbox/messages/[threadId]) per row. */
export function DMThreadList({ userId }: { userId: string | null }) {
  const [threads, setThreads] = useState<DMThread[]>([]);
  // Initial value must already account for a null userId — useDMRealtime
  // never calls back for one (it returns before subscribing), so without
  // this, a signed-out render would stay "loading" forever. React's own
  // "adjusting state when a prop changes" pattern covers a LATER sign-out
  // too (same fix already applied in use-notifications.ts).
  const [status, setStatus] = useState<"loading" | "error" | "ready">(userId ? "loading" : "ready");
  const [trackedUserId, setTrackedUserId] = useState(userId);
  if (userId !== trackedUserId) {
    setTrackedUserId(userId);
    setThreads([]);
    setStatus(userId ? "loading" : "ready");
  }

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus("ready");
      return;
    }
    try {
      setThreads(await fetchThreads(userId));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [userId]);

  useDMRealtime(userId, refresh);

  if (status === "loading") return <ListSkeleton />;

  if (status === "error") {
    return (
      <div className="flex items-center justify-center py-8">
        <ErrorState onRetry={refresh} heading="Couldn't load messages" />
      </div>
    );
  }

  if (threads.length === 0) {
    return <p className="text-center text-xs text-text-secondary py-6">No messages yet.</p>;
  }

  return (
    <div className="flex flex-col">
      <h2 className="px-6 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Messages</h2>
      {threads.map((thread) => (
        <Link
          key={thread.id}
          href={`/inbox/messages/${thread.id}`}
          className="flex items-center gap-3 px-6 py-3 hover:bg-card/60 transition-colors"
        >
          <Avatar src={thread.otherUser.avatarUrl} alt={thread.otherUser.displayName} size={44} />
          <div className="flex-1 min-w-0">
            <p className={thread.unread ? "text-sm font-medium truncate" : "text-sm truncate"}>
              {thread.otherUser.displayName}
            </p>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
              <MessageCircle size={11} />
              {thread.lastMessageAt ? formatRelativeTime(thread.lastMessageAt) : "Say hello"}
            </p>
          </div>
          {thread.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
        </Link>
      ))}
    </div>
  );
}
