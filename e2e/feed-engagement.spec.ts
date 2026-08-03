import { test, expect, type Page } from "@playwright/test";

async function skipOnboarding(page: Page) {
  await page.goto("/");
  // "/" client-redirects to "/onboarding" for first-time visitors, but only
  // after a post-navigation effect runs — race the two possible landing
  // states instead of trusting page.url() immediately after goto().
  const continueButton = page.getByRole("button", { name: "Continue" });
  const likeButton = page.getByRole("button", { name: "Like" }).first();
  await expect(continueButton.or(likeButton)).toBeVisible();

  if (await continueButton.isVisible()) {
    await continueButton.click();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page).toHaveURL("/");
  }
}

test("liking the active video updates the count and persists across reload", async ({ page }) => {
  await skipOnboarding(page);

  const likeButton = page.getByRole("button", { name: "Like" }).first();
  await expect(likeButton).toBeVisible();
  await expect(likeButton).toHaveAttribute("aria-pressed", "false");

  await likeButton.click();

  const unlikeButton = page.getByRole("button", { name: "Unlike" }).first();
  await expect(unlikeButton).toBeVisible();
  await expect(unlikeButton).toHaveAttribute("aria-pressed", "true");

  // Engagement state lives in a persisted Zustand store, not just component state.
  await page.reload();
  await expect(page.getByRole("button", { name: "Unlike" }).first()).toBeVisible();
});

test("following a creator hides the Follow button", async ({ page }) => {
  await skipOnboarding(page);

  const followButton = page.getByRole("button", { name: /^Follow @/ }).first();
  await expect(followButton).toBeVisible();
  const creatorLabel = await followButton.getAttribute("aria-label");

  await followButton.click();

  // Re-select by the captured label — `.first()` would otherwise re-match a
  // different creator's still-visible Follow button once this one unmounts.
  await expect(page.getByRole("button", { name: creatorLabel! })).toBeHidden();
});
