import { test, expect } from "@playwright/test";

test("first-time visitor completes onboarding and lands on the feed", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);

  await expect(page.getByText("The cinematic social network")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("What do you love watching?")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Like" }).first()).toBeVisible();

  // Onboarding is a one-time gate — reloading must not bounce back to it.
  await page.reload();
  await expect(page).toHaveURL("/");
});
