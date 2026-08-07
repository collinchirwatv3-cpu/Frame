import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./test-utils";

// Real engagement (liking, following) now writes to Supabase via RLS-scoped
// queries — CI intentionally runs against a placeholder Supabase URL (see
// ci.yml), and no seeded video/creator content exists in this environment
// (mock data was deliberately removed — see MIGRATION_PLAN.md), so there is
// nothing on screen to like or follow here. What's real and reachable
// without either of those is the empty state Discover's composed feed
// (app/(app)/discover/page.tsx: For You + Following + Saved + History +
// Discover) falls back to when For You itself comes back empty, which is
// exactly what this test covers instead. "/" redirects to "/discover" now —
// skipOnboarding's page.goto("/") lands here after following that redirect.

test("Discover shows the honest empty state with an upload CTA", async ({ page }) => {
  await skipOnboarding(page);

  await expect(page.getByText("No videos yet")).toBeVisible();
  await expect(
    page.getByText("FRAMES is just getting started", { exact: false })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload a video" })).toHaveAttribute(
    "href",
    "/upload"
  );
});
