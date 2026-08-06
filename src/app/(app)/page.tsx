import { Suspense } from "react";
import { FeedRoot } from "@/components/feed/FeedRoot";

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <FeedRoot />
    </Suspense>
  );
}
