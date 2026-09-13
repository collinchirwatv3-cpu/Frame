import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
// Same "import jest-dom directly, no shared setupFiles entry" approach as
// CommentDrawer.test.tsx — the first component test in this repo to need it.
import "@testing-library/jest-dom/vitest";
import LoginPage from "./page";

// Regression coverage for the Safari OAuth-redirect fix: Google/Apple sign-in
// used to call signInWithOAuth (which internally does an async PKCE step,
// then window.location.assign) directly from an onClick handler — Safari can
// silently drop that assign() once it runs after any async gap. The fix
// pre-computes each provider's URL on mount (skipBrowserRedirect: true, so
// nothing navigates yet) and renders a real <a href>, so a click is always a
// native, unambiguous browser navigation with no async gap left to cross.
let signInWithOAuthResult: (provider: string) => { data: { url: string | null }; error: { message: string } | null } =
  (provider) => ({ data: { url: `https://accounts.example/${provider}` }, error: null });
const signInWithOAuthSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: async (args: { provider: string }) => {
        signInWithOAuthSpy(args);
        return signInWithOAuthResult(args.provider);
      },
      signInWithOtp: async () => ({ error: null }),
    },
  }),
}));

beforeEach(() => {
  signInWithOAuthSpy.mockClear();
  signInWithOAuthResult = (provider) => ({ data: { url: `https://accounts.example/${provider}` }, error: null });
});

describe("LoginPage OAuth links", () => {
  it("pre-computes Google's URL on mount with skipBrowserRedirect, not a live navigation", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(signInWithOAuthSpy).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google", options: expect.objectContaining({ skipBrowserRedirect: true }) })
      );
    });
  });

  it("renders the Google button as a real link once its URL resolves", async () => {
    render(<LoginPage />);
    const link = await screen.findByRole("link", { name: /continue with google/i });
    await waitFor(() => expect(link).toHaveAttribute("href", "https://accounts.example/google"));
    expect(link).not.toHaveAttribute("aria-disabled", "true");
  });

  it("disables the Google link (no href, aria-disabled) before the URL resolves", () => {
    // signInWithOAuth is async (a real network-free await inside useEffect,
    // per the fix's own reasoning) — immediately after render, before that
    // microtask flushes, the link must not yet be a live href. Queried by
    // text + closest <a> rather than role="link": an anchor with no href is
    // correctly absent from the accessibility tree's link role until it has
    // one, which is itself part of what this fix gets right.
    render(<LoginPage />);
    const link = screen.getByText(/continue with google/i).closest("a");
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("aria-disabled", "true");
  });

  it("shows an error message if Google's URL fails to resolve, instead of leaving a silently-broken link", async () => {
    signInWithOAuthResult = () => ({ data: { url: null }, error: { message: "provider unavailable" } });
    render(<LoginPage />);
    await screen.findByText(/sign-in isn't available right now/i);
  });
});

// Apple OAuth isn't enabled in Supabase yet (OAUTH_PROVIDERS_ENABLED.apple
// is false) — clicking the old "Continue with Apple" button returned a
// real 400 "provider is not enabled". This must render as a state that
// cannot initiate OAuth at all, not just a styled-differently button.
describe("LoginPage Apple unavailable state", () => {
  it("never calls signInWithOAuth for apple", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(signInWithOAuthSpy).toHaveBeenCalledWith(expect.objectContaining({ provider: "google" }));
    });
    expect(signInWithOAuthSpy).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "apple" }));
  });

  it("renders Apple as a non-interactive, clearly-unavailable control — no link, no href, no button role that could be activated", () => {
    render(<LoginPage />);
    // Not a link at all (an <a> with no href isn't one), and not a real
    // <button> either — role="button" here is on a plain <div> with
    // aria-disabled, which no keyboard/pointer interaction can activate.
    expect(screen.queryByRole("link", { name: /apple/i })).not.toBeInTheDocument();
    const appleControl = screen.getByText(/apple/i).closest('[role="button"]');
    expect(appleControl).toHaveAttribute("aria-disabled", "true");
    expect(appleControl?.tagName).toBe("DIV");
    expect(appleControl).not.toHaveAttribute("href");
  });

  it("labels the Apple state as unavailable rather than looking like a normal working button", () => {
    render(<LoginPage />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
