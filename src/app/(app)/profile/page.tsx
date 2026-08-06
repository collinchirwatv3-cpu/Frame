"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { FeaturedWork } from "@/components/profile/FeaturedWork";
import { collections } from "@/lib/mock-data";
import { fetchOwnVideos, toDisplayVideo, type OwnVideo } from "@/lib/profile-videos";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useEngagementStore } from "@/store/engagement-store";

export default function ProfilePage() {
  const profile = useCurrentUserStore((s) => s.profile);
  const userId = useEngagementStore((s) => s.userId);
  const hydrated = useEngagementStore((s) => s.hydrated);
  const router = useRouter();
  const [ownVideos, setOwnVideos] = useState<OwnVideo[]>([]);

  // userId resolves (to a value or null) before profile does — hydrated is
  // the reliable "auth check has finished" signal, matching the pattern
  // OnboardingGate uses for its own hasHydrated check.
  useEffect(() => {
    if (hydrated && !userId) {
      router.replace("/login");
    }
  }, [hydrated, userId, router]);

  useEffect(() => {
    if (!userId) return;
    fetchOwnVideos(userId).then(setOwnVideos);
  }, [userId]);

  if (!hydrated || !userId || !profile) return null;

  // Soft creator/general-user distinction — no stored flag, just "have they
  // ever actually published something." Gates the extra portfolio fields in
  // EditProfileModal; everything else already renders those fields
  // conditionally, so nothing else needs this check.
  const isCreator = ownVideos.some((v) => v.status === "ready");

  const publicVideos = ownVideos.filter((v) => v.visibility === "public");
  const privateVideos = ownVideos
    .filter((v) => v.visibility === "private")
    .map((v) => toDisplayVideo(v, profile))
    .filter((v) => v !== null);

  const featuredVideo = [...publicVideos]
    .sort((a, b) => b.likes - a.likes)
    .map((v) => toDisplayVideo(v, profile))
    .find((v) => v !== null);
  const featuredCollection = collections.find((c) =>
    c.videoIds.some((id) => publicVideos.some((v) => v.id === id))
  );

  return (
    <div className="pb-24 md:pb-8">
      <ProfileHeader creator={profile} isCreator={isCreator} />
      <FeaturedWork featuredVideo={featuredVideo} featuredCollection={featuredCollection} />
      <ProfileTabs videos={publicVideos} privateVideos={privateVideos} creator={profile} />
    </div>
  );
}
