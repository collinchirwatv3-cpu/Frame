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

test("upload page renders the landscape-only dropzone with a click-to-browse affordance", async ({
  page,
}) => {
  await skipOnboarding(page);
  await page.goto("/upload");

  await expect(page.getByRole("heading", { name: "Upload" })).toBeVisible();
  await expect(page.getByText("Landscape only.", { exact: false })).toBeVisible();
  await expect(
    page.getByText("Drag & drop your video, or click to browse")
  ).toBeVisible();

  // The dropzone's click affordance is a real file input, not just decorative copy.
  await expect(page.locator('input[type="file"][accept="video/*"]')).toBeAttached();
});
