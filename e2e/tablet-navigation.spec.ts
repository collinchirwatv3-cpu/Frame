import { test, expect } from "@playwright/test";
import { bypassOnboardingGate } from "./test-utils";

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
]) {
  test(`feed navigation remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("https://*.supabase.co/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await bypassOnboardingGate(page);
    await page.goto("/discover");
    const primary = page.locator('nav[aria-label="Primary"]:visible');
    await expect(primary).toHaveCount(1);
    await primary.getByRole("link", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await page.getByRole("link", { name: "Discover", exact: true }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await primary.getByRole("link", { name: "Frames", exact: true }).click();
    await expect(page).toHaveURL(/\/shorts$/);
    await expect(primary).toHaveCount(1);
  });
}
