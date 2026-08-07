import { test, expect } from "@playwright/test";
import { bypassInviteGate } from "./test-utils";

test("first-time visitor completes onboarding and lands on the feed", async ({ page }) => {
  await bypassInviteGate(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);

  await expect(page.getByText("The cinematic social network")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("What do you love watching?")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  // "/" redirects to "/discover" — the shelf feed moved there as part of the
  // 5-tab nav rebuild (Shorts/Discover/Search/Parties/Profile), no separate
  // Home destination anymore.
  await expect(page).toHaveURL("/discover");
  // No real content exists in this environment (see MIGRATION_PLAN.md — mock
  // data was deliberately removed) — the honest empty state is the real,
  // reachable proof that the feed itself rendered, not a stand-in for content.
  await expect(page.getByText("No videos yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload a video" })).toBeVisible();

  // Onboarding is a one-time gate — reloading must not bounce back to it.
  await page.reload();
  await expect(page).toHaveURL("/discover");
});
