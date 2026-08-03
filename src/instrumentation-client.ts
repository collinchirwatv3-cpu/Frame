import * as Sentry from "@sentry/nextjs";

/** Client-side error tracking. Uses NEXT_PUBLIC_SENTRY_DSN (not SENTRY_DSN —
 * this runs in the browser bundle, so it must be the public-prefixed var).
 * Same no-DSN-means-no-op behavior as src/instrumentation.ts. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session Replay defaults to off — enable deliberately once there's a real
  // debugging need for it, not by default (cost + privacy considerations for
  // a platform that plays user-uploaded video).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,
});

// Required by the SDK to instrument client-side route transitions.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
