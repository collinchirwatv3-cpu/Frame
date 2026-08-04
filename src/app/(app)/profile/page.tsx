"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { FeaturedWork } from "@/components/profile/FeaturedWork";
import { videos, privateVideos, collections } from "@/lib/mock-data";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useEngagementStore } from "@/store/engagement-store";

export default function ProfilePage() {
  const profile = useCurrentUserStore((s) => s.profile);
  const userId = useEngagementStore((s) => s.userId);
  const hydrated = useEngagementStore((s) => s.hydrated);
  const router = useRouter();

  // userId resolves (to a value or null) before profile does — hydrated is
  // the reliable "auth check has finished" signal, matching the pattern
  // OnboardingGate uses for its own hasHydrated check.
  useEffect(() => {
    if (hydrated && !userId) {
      router.replace("/login");
    }
  }, [hydrated, userId, router]);

  if (!hydrated || !userId || !profile) return null;

  const ownVideos = videos.filter((v) => v.creator.id === profile.id);
  const featuredVideo = [...ownVideos].sort((a, b) => b.likes - a.likes)[0];
  const featuredCollection = collections.find((c) =>
    c.videoIds.some((id) => ownVideos.some((v) => v.id === id))
  );

  return (
    <div className="pb-24 md:pb-8">
      <ProfileHeader creator={profile} />
      <FeaturedWork featuredVideo={featuredVideo} featuredCollection={featuredCollection} />
      <ProfileTabs videos={ownVideos} privateVideos={privateVideos} />
    </div>
  );
}
