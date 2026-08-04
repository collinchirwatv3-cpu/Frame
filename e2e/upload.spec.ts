import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./test-utils";

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
