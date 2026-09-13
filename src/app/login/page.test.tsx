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
  it("pre-computes both providers' URLs on mount with skipBrowserRedirect, not a live navigation", async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(signInWithOAuthSpy).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "google", options: expect.objectContaining({ skipBrowserRedirect: true }) })
      );
      expect(signInWithOAuthSpy).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "apple", options: expect.objectContaining({ skipBrowserRedirect: true }) })
      );
    });
  });

  it("renders the Google button as a real link once its URL resolves", async () => {
    render(<LoginPage />);
    const link = await screen.findByRole("link", { name: /continue with google/i });
    await waitFor(() => expect(link).toHaveAttribute("href", "https://accounts.example/google"));
    expect(link).not.toHaveAttribute("aria-disabled", "true");
  });

  it("renders the Apple button as a real link once its URL resolves", async () => {
    render(<LoginPage />);
    const link = await screen.findByRole("link", { name: /continue with apple/i });
    await waitFor(() => expect(link).toHaveAttribute("href", "https://accounts.example/apple"));
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

  it("shows an error message if the provider URL fails to resolve, instead of leaving a silently-broken link", async () => {
    signInWithOAuthResult = () => ({ data: { url: null }, error: { message: "provider unavailable" } });
    render(<LoginPage />);
    await screen.findByText(/sign-in isn't available right now/i);
  });
});
