import { Suspense } from "react";
import { FeedRoot } from "@/components/feed/FeedRoot";
import { videos } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <FeedRoot videos={videos} />
    </Suspense>
  );
}
