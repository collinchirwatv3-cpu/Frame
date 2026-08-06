"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { AlertCircle } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

/**
 * Was entirely missing — any uncaught render error anywhere in the app
 * showed Next.js's bare default error screen with zero FRAMES branding and
 * (with no error.tsx to route through) no guaranteed report to Sentry
 * either. Scoped to everything under the root layout; app/global-error.tsx
 * is the separate, rarer fallback for errors in the root layout itself.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-dvh text-center px-6">
      <Logo size={40} />
      <AlertCircle size={32} className="text-primary" />
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-text-secondary max-w-sm">
        This wasn&apos;t supposed to happen — the error&apos;s been reported. Try again, or come
        back in a bit.
      </p>
      <button
        onClick={() => unstable_retry()}
        className="mt-2 px-5 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  );
}
