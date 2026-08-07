import { Suspense } from "react";
import { FeedRoot } from "@/components/feed/FeedRoot";

// FeedRoot renders its own profile avatar now — inline next to the FRAMES
// logo on the shelf view, ProfileFloat (fixed) once a video's selected —
// rather than one fixed button here that has to fit both.
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <FeedRoot />
    </Suspense>
  );
}
