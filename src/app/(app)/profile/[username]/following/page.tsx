"use client";

import { useParams } from "next/navigation";
import { FollowList } from "@/components/social/FollowList";
import { fetchFollowing } from "@/lib/social";

export default function FollowingPage() {
  const { username } = useParams<{ username: string }>();
  return (
    <FollowList
      username={username}
      title="Following"
      emptyHeading="Not following anyone yet"
      emptySubtext={`When @${username} follows people, they'll show up here.`}
      fetcher={fetchFollowing}
    />
  );
}
