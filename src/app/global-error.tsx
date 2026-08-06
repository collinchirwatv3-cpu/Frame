"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * The rarer, more catastrophic sibling of app/error.tsx — only fires if the
 * root layout itself throws while rendering. Was entirely missing before
 * this. Per Next.js's own requirement, this replaces <html>/<body>
 * entirely rather than rendering inside RootLayout, so it can't rely on
 * globals.css having loaded or any app component tree being intact —
 * plain inline styles only, matching the brand tokens by hex value
 * (src/app/globals.css) rather than Tailwind classes.
 */
export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          backgroundColor: "#090909",
          color: "#FFFFFF",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#8E8E93", maxWidth: 360, margin: 0 }}>
          FRAMES hit a problem it couldn&apos;t recover from. The error&apos;s been reported —
          reloading usually fixes it.
        </p>
        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: 8,
            padding: "10px 20px",
            borderRadius: 999,
            border: "none",
            backgroundColor: "#FF5A1F",
            color: "#090909",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
