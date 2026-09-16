import { test, expect } from "@playwright/test";
import { bypassOnboardingGate } from "./test-utils";

// Deterministic media state for layout/interaction tests, not codec or device verification.
for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }, { width: 844, height: 390 }]) {
  test(`player controls and paused mark at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await bypassOnboardingGate(page);
    await page.addInitScript(() => {
      Object.defineProperty(HTMLMediaElement.prototype, "duration", { get: () => 120 });
      Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get: () => 4 });
      HTMLMediaElement.prototype.play = function () {
        Object.defineProperty(this, "paused", { configurable: true, value: false });
        this.dispatchEvent(new Event("play"));
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {
        Object.defineProperty(this, "paused", { configurable: true, value: true });
        this.dispatchEvent(new Event("pause"));
      };
    });
    await page.route("https://*.supabase.co/rest/v1/**", (route) => {
      const videos = new URL(route.request().url()).pathname.endsWith("/videos");
      return route.fulfill({ json: videos ? [{
        id: "player-fixture", title: "Cinematic player", description: "", category: "Travel", content_type: "short",
        playback_url: "/test-video.mp4", poster_url: "/icons/icon-512.png", width: 1920, height: 1080,
        duration_seconds: 120, likes_count: 0, comments_count: 0, shares_count: 0, saves_count: 0, view_count: 0,
        profiles: { id: "creator", username: "filmmaker", display_name: "Filmmaker", followers_count: 0, following_count: 0, total_views: 0 },
      }] : [] });
    });
    await page.goto("/shorts");
    const video = page.locator("video").first();
    await expect(page.getByRole("button", { name: "Pause video" })).toBeVisible();
    await video.click({ position: { x: viewport.width / 2, y: viewport.height / 2 } });
    const mark = page.locator('[data-paused-watermark="true"]');
    await expect(mark).toHaveCSS("opacity", "0.15");
    const box = await mark.boundingBox();
    const videoBox = await video.boundingBox();
    expect(Math.abs(box!.x + box!.width / 2 - (videoBox!.x + videoBox!.width / 2))).toBeLessThan(2);
    expect(Math.abs(box!.y + box!.height / 2 - (videoBox!.y + videoBox!.height / 2))).toBeLessThan(2);
    const slider = page.getByRole("slider");
    await slider.focus();
    await slider.press("ArrowRight");
    await expect(slider).toHaveValue("0.1");
    const transport = await page.getByRole("group", { name: "Video playback" }).boundingBox();
    const nav = await page.locator('nav[aria-label="Primary"]:visible').boundingBox();
    expect(transport).toBeTruthy();
    expect(nav).toBeTruthy();
    const overlap = transport!.x < nav!.x + nav!.width && transport!.x + transport!.width > nav!.x && transport!.y < nav!.y + nav!.height && transport!.y + transport!.height > nav!.y;
    expect(overlap).toBe(false);
    await page.screenshot({ path: `/tmp/frame-player-${viewport.width}.png` });
  });
}
