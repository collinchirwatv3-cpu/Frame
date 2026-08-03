import * as Sentry from "@sentry/nextjs";

/** Server + edge runtime error tracking. With no `SENTRY_DSN` set (local dev,
 * CI, and the current stage of this project), the SDK no-ops entirely rather
 * than throwing — safe to leave wired before a Sentry project exists. Must
 * not stay unset in real production; see MIGRATION_PLAN.md § Observability. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
