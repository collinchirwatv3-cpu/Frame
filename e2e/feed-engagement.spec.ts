import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./test-utils";

// Real engagement (liking, following) now writes to Supabase via RLS-scoped
// queries — CI intentionally runs against a placeholder Supabase URL (see
// ci.yml), and no seeded video/creator content exists in this environment
// (mock data was deliberately removed — see MIGRATION_PLAN.md), so there is
// nothing on screen to like or follow here. What's real and reachable
// without either of those is the tab-aware empty state itself, which is
// exactly what these tests cover instead.

test("the For You tab shows the honest empty state with an upload CTA", async ({ page }) => {
  await skipOnboarding(page);

  await expect(page.getByText("No videos yet")).toBeVisible();
  await expect(
    page.getByText("FRAME is just getting started", { exact: false })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload a video" })).toHaveAttribute(
    "href",
    "/upload"
  );
});

test("the Following tab shows a distinct empty state from For You", async ({ page }) => {
  await skipOnboarding(page);

  await page.getByRole("button", { name: "Following" }).click();

  await expect(page.getByText("Follow creators to see them here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Find creators to follow" })).toHaveAttribute(
    "href",
    "/discover"
  );

  // Distinct copy from For You — a real test that the tab actually switched
  // state rather than reusing the same empty state for both.
  await expect(page.getByText("No videos yet")).toBeHidden();
});
