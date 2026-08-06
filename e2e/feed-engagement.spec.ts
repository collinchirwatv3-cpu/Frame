import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./test-utils";

// Real engagement (liking, following) now writes to Supabase via RLS-scoped
// queries — CI intentionally runs against a placeholder Supabase URL (see
// ci.yml), and no seeded video/creator content exists in this environment
// (mock data was deliberately removed — see MIGRATION_PLAN.md), so there is
// nothing on screen to like or follow here. What's real and reachable
// without either of those is the empty state Home's composed feed
// (lib/home-feed.ts: For You + Saved + History) falls back to when nothing
// comes back from any of those three, which is exactly what this test
// covers instead. The old "For You"/"Following" tabs this used to also
// cover were retired from Home along with that composition — SwipeFeed's
// `tabs` prop still exists for any future caller that wants them, Home just
// doesn't pass it anymore.

test("Home shows the honest empty state with an upload CTA", async ({ page }) => {
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
