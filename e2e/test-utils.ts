import type { Page } from "@playwright/test";

/**
 * The invite gate (InviteGate.tsx) blocks every route behind a validated
 * code, checked via a network call to Supabase — which CI intentionally
 * runs against a placeholder URL (see ci.yml), so that call always fails.
 * Seeding the same localStorage key InviteGate itself writes on a real
 * validated code lets tests reach the app without a real Supabase project,
 * exactly like OnboardingGate's own persisted-store gate below it.
 */
export async function bypassInviteGate(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "frame-invite",
      JSON.stringify({ state: { validatedCode: "E2E0TEST", hasHydrated: true }, version: 0 })
    );
  });
}

/** Completes the (also localStorage-persisted) first-run onboarding gate,
 * landing on the feed. Shared across specs that don't care about onboarding
 * itself, just need past it. */
export async function skipOnboarding(page: Page) {
  await bypassInviteGate(page);
  await page.goto("/");

  // "/" client-redirects to "/onboarding" for first-time visitors, but only
  // after a post-navigation effect runs — race the two possible landing
  // states instead of trusting page.url() immediately after goto().
  const continueButton = page.getByRole("button", { name: "Continue" });
  const emptyStateHeading = page.getByText("No Frames yet");
  await continueButton.or(emptyStateHeading).waitFor();

  if (await continueButton.isVisible()) {
    await continueButton.click();
    await page.getByRole("button", { name: "Skip for now" }).click();
  }
}

/** Same end state as skipOnboarding (past both the invite gate and
 * OnboardingGate), but seeds BOTH localStorage-persisted gates directly via
 * addInitScript instead of clicking through the UI — for specs that
 * navigate straight to a deep route (like a specific DM thread) rather
 * than starting from "/", where skipOnboarding's own navigation and
 * click-through would be redundant work on every new browser context. */
export async function bypassOnboardingGate(page: Page) {
  await bypassInviteGate(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "frame-onboarding",
      JSON.stringify({ state: { completed: true, interests: [], hasHydrated: true }, version: 0 })
    );
  });
}
