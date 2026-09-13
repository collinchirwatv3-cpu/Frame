"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { fetchBlockedUsers, type FollowProfile } from "@/lib/social";
import { UserListRow } from "@/components/social/UserListRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useEngagementStore } from "@/store/engagement-store";

function ListSkeleton() {
  return (
    <div className="flex flex-col px-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="w-11 h-11 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The only place a block can be reversed from — a blocked profile is
 * unreachable via RLS once blocked (see 20260915000000_blocks.sql), so
 * there's no "Unblock" button to find on their own page after leaving it. */
export default function BlockedAccountsPage() {
  const router = useRouter();
  const userId = useEngagementStore((s) => s.userId);
  const toggleBlock = useEngagementStore((s) => s.toggleBlock);

  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [users, setUsers] = useState<FollowProfile[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchBlockedUsers(userId)
      .then((list) => {
        if (!cancelled) {
          setUsers(list);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, retryCount]);

  async function handleUnblock(targetId: string) {
    setUnblockingId(targetId);
    const ok = await toggleBlock(targetId, false);
    if (ok) setUsers((prev) => prev.filter((u) => u.id !== targetId));
    setUnblockingId(null);
  }

  return (
    <div className="pb-24 md:pb-8">
      <div className="flex items-center gap-2 px-6 pt-8 pb-4">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-card transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold">Blocked Accounts</h1>
      </div>

      {status === "loading" ? (
        <ListSkeleton />
      ) : status === "error" ? (
        <div className="flex items-center justify-center pt-12">
          <ErrorState
            onRetry={() => {
              setStatus("loading");
              setRetryCount((n) => n + 1);
            }}
            heading="Couldn't load blocked accounts"
          />
        </div>
      ) : users.length === 0 ? (
        <div className="flex items-center justify-center pt-12">
          <EmptyState
            icon={ShieldOff}
            heading="No blocked accounts"
            subtext="Accounts you block will show up here so you can unblock them anytime."
          />
        </div>
      ) : (
        <div className="flex flex-col">
          {users.map((u) => (
            <UserListRow
              key={u.id}
              user={u}
              linkToProfile={false}
              action={
                <button
                  onClick={() => handleUnblock(u.id)}
                  disabled={unblockingId === u.id}
                  className="px-4 py-1.5 rounded-full border border-border text-xs font-medium shrink-0 hover:bg-card transition-colors disabled:opacity-50"
                >
                  {unblockingId === u.id ? "Unblocking…" : "Unblock"}
                </button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
