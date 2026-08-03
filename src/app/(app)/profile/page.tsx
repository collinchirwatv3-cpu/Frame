import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { FeaturedWork } from "@/components/profile/FeaturedWork";
import { currentUser, videos, privateVideos, collections } from "@/lib/mock-data";

export default function ProfilePage() {
  const ownVideos = videos.filter((v) => v.creator.id === currentUser.id);
  const featuredVideo = [...ownVideos].sort((a, b) => b.likes - a.likes)[0];
  const featuredCollection = collections.find((c) =>
    c.videoIds.some((id) => ownVideos.some((v) => v.id === id))
  );

  return (
    <div className="pb-24 md:pb-8">
      <ProfileHeader creator={currentUser} />
      <FeaturedWork featuredVideo={featuredVideo} featuredCollection={featuredCollection} />
      <ProfileTabs videos={ownVideos} privateVideos={privateVideos} />
    </div>
  );
}
