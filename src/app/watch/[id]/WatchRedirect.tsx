"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function WatchRedirect({ videoId }: { videoId: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/?v=${videoId}`);
  }, [router, videoId]);

  return (
    <div className="min-h-dvh flex items-center justify-center text-sm text-text-secondary">
      Opening in FRAME…
    </div>
  );
}
