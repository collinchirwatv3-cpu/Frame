import { test, expect } from "@playwright/test";
import { skipOnboarding } from "./test-utils";

// DM-specific browser coverage — distinct from the onboarding/feed/upload
// specs, which don't touch this surface at all. Same constraint those
// specs work under applies here: CI runs against a placeholder Supabase
// URL (see ci.yml), so no real session ever resolves and
// useCurrentUserStore's profile stays null — [threadId]/page.tsx's own
// `if (!userId) return;` guard (runRefresh) means it never leaves its
// initial "loading" status in this environment. What a real browser CAN
// verify without a real backend: the route renders through Next's actual
// App Router param handling, the loading skeleton, without throwing —
// exactly the class of failure (a bad import, a hook rule violation, a
// bundling issue) unit/component tests exercise a synthetic React tree for
// but a real page load can catch that they can't.
//
// The interactive send/receive/sync behavior itself (the actual subject of
// this round's fixes) is covered far more thoroughly against a real
// Supabase project by scripts/verify-dm-fixes-3.mjs (server-side
// correctness: grants, triggers, RPCs) and by the extensive mocked-network
// component tests in page.test.tsx (client-side behavior: cursor tracking,
// merge/dedupe, retry, cancellation) — this spec exists to cover what only
// an actual browser page load can, not to duplicate either of those.

test("the DM thread page loads without error and settles into its loading state", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await skipOnboarding(page);
  await page.goto("/inbox/messages/e2e-test-thread-id");

  // The header's back button is present regardless of auth/data state —
  // proof the route itself mounted and rendered, not a blank/crashed page.
  await expect(page.getByLabel("Back")).toBeVisible();

  // No real session ever resolves against the placeholder backend, so the
  // page settles into (and stays in) its loading skeleton rather than
  // reaching "ready" or "error" — asserting that state is stable is what
  // rules out an unguarded null-userId path throwing once a fetch it
  // shouldn't have started resolves. The composer form itself renders
  // unconditionally regardless of status, so the skeleton's pulsing
  // placeholder blocks (not the composer) are what actually distinguish
  // "still loading" from "ready" or "error" here.
  await page.waitForTimeout(500);
  await expect(page.locator(".animate-pulse").first()).toBeVisible();
  await expect(page.getByText("Couldn't load this conversation")).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("the inbox thread list loads without error", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await skipOnboarding(page);
  await page.goto("/inbox");

  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`conversation layout reserves the visible screen at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await skipOnboarding(page);
    await page.goto("/inbox/messages/e2e-test-thread-id");
    await expect(page.getByLabel("Back")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toHaveCount(0);
    await expect(page.locator("main")).toHaveCSS("padding-left", "0px");
    const composer = page.locator("form");
    await expect(composer).toBeVisible();
    const box = await composer.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);

    // Deterministic visualViewport resize/pan simulation; not a real iOS keyboard.
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      Object.defineProperty(vv, "height", { configurable: true, value: 250 });
      Object.defineProperty(vv, "offsetTop", { configurable: true, value: 25 });
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(page.getByTestId("conversation-viewport")).toHaveCSS("height", "250px");
    const reduced = await composer.boundingBox();
    expect(reduced!.y + reduced!.height).toBeLessThanOrEqual(276);
    await page.evaluate(() => {
      const vv = window.visualViewport!;
      delete (vv as unknown as Record<string, unknown>).height;
      delete (vv as unknown as Record<string, unknown>).offsetTop;
      vv.dispatchEvent(new Event("resize"));
    });
    await expect(page.getByTestId("conversation-viewport")).toHaveCSS("height", `${viewport.height}px`);
    await page.getByLabel("Back").click();
    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByRole("navigation", { name: "Primary", exact: true }).first()).toBeVisible();
  });
}
