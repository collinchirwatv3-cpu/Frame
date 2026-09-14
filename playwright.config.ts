import { defineConfig, devices } from "@playwright/test";

// Next's dev server (the webServer below) loads .env.local on its own, but
// the Playwright TEST RUNNER process is a separate process that doesn't —
// e2e/dm-authenticated.spec.ts needs NEXT_PUBLIC_SUPABASE_URL/ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY in its OWN process to make real admin API calls
// setting up test users. No-ops (rather than throwing) when the file
// doesn't exist, which is always the case in CI.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Not present — fine locally without one, and expected in CI.
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Production build correctness is already covered by the separate
  // lint-typecheck-test CI job — this suite only needs the app running,
  // so `next dev` keeps E2E runs fast both locally and in CI.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
