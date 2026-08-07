import { Suspense } from "react";
import { FeedRoot } from "@/components/feed/FeedRoot";
import { ProfileFloat } from "@/components/nav/ProfileFloat";

export default function HomePage() {
  return (
    <>
      <Suspense fallback={null}>
        <FeedRoot />
      </Suspense>
      <ProfileFloat />
    </>
  );
}
