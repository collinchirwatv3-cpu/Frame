"use client";

import { useParams } from "next/navigation";
import { FollowList } from "@/components/social/FollowList";
import { fetchFollowers } from "@/lib/social";

export default function FollowersPage() {
  const { username } = useParams<{ username: string }>();
  return (
    <FollowList
      username={username}
      title="Followers"
      emptyHeading="No followers yet"
      emptySubtext={`When people follow @${username}, they'll show up here.`}
      fetcher={fetchFollowers}
    />
  );
}
