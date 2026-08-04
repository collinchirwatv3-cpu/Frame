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
  const emptyStateHeading = page.getByText("No videos yet");
  await continueButton.or(emptyStateHeading).waitFor();

  if (await continueButton.isVisible()) {
    await continueButton.click();
    await page.getByRole("button", { name: "Skip for now" }).click();
  }
}
