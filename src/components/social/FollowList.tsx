"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { fetchProfileByUsername } from "@/lib/video-fetch";
import { UserListRow } from "@/components/social/UserListRow";
import { FollowButton } from "@/components/social/FollowButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import type { FollowProfile } from "@/lib/social";

function ListSkeleton() {
  return (
    <div className="flex flex-col px-6">
      {[0, 1, 2, 3, 4].map((i) => (
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

/** Shared body for /profile/[username]/followers and /following — same
 * back-header + loading/error/empty/list shape, the fetcher and copy are
 * the only real difference between the two. */
export function FollowList({
  username,
  title,
  emptyHeading,
  emptySubtext,
  fetcher,
}: {
  username: string;
  title: string;
  emptyHeading: string;
  emptySubtext: string;
  fetcher: (profileId: string) => Promise<FollowProfile[]>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [users, setUsers] = useState<FollowProfile[]>([]);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProfileByUsername(username)
      .then(async (profile) => {
        if (cancelled) return;
        if (!profile) {
          setStatus("error");
          return;
        }
        const list = await fetcher(profile.id);
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
    // fetcher is a stable module-level function reference (fetchFollowers/
    // fetchFollowing) passed in by the page, not re-created per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, retryCount]);

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
        <h1 className="text-lg font-bold">{title}</h1>
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
            heading="Couldn't load this list"
          />
        </div>
      ) : users.length === 0 ? (
        <div className="flex items-center justify-center pt-12">
          <EmptyState icon={Users} heading={emptyHeading} subtext={emptySubtext} />
        </div>
      ) : (
        <div className="flex flex-col">
          {users.map((u) => (
            <UserListRow key={u.id} user={u} action={<FollowButton userId={u.id} />} />
          ))}
        </div>
      )}
    </div>
  );
}
