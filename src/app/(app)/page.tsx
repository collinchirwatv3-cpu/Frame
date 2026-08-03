import { Suspense } from "react";
import { SwipeFeed } from "@/components/feed/SwipeFeed";
import { videos } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <SwipeFeed videos={videos} />
    </Suspense>
  );
}
