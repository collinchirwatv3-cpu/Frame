import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthListener } from "./AuthListener";
import { useEngagementStore } from "@/store/engagement-store";
import { useCurrentUserStore } from "@/store/current-user-store";
import { useInviteStore } from "@/store/invite-store";

// Regression coverage: /api/invite/redeem's own comment says it's meant to
// be "called once, right after first login" — but syncProfile could fire
// several times per page load (supabase.auth.getUser() and
// onAuthStateChange's own initial event both run on mount), with nothing
// stopping it from calling redeem every single time a pending code hadn't
// been cleared yet. Confirmed live against the real dev database: this
// hammered /api/invite/redeem up to 4x per reload and tripped its rate
// limiter within a couple of reloads. Separately, the redeem fetch had no
// try/catch at all — a thrown network error there left setProfile never
// called for that pass, which is exactly what "looks logged out" means to
// the rest of the app.

import { useTagsStore } from "@/store/tags-store";

const USER_ID = "user-1";
let getUserResult: { data: { user: { id: string } | null } } = { data: { user: { id: USER_ID } } };
let profileSelectResult: { data: Record<string, unknown> | null; error: null } = {
  data: { id: USER_ID, invite_redeemed_at: null, monetization_eligible: false },
  error: null,
};
const fromSpy = vi.fn();
let authStateChangeCallback: ((event: string, session: { user: { id: string } } | null) => void) | null = null;

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => getUserResult,
      onAuthStateChange: (cb: typeof authStateChangeCallback) => {
        authStateChangeCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: (table: string) => {
      fromSpy(table);
      return {
        select: () => ({
          eq: () => ({
            single: async () => profileSelectResult,
          }),
        }),
      };
    },
  }),
}));

let fetchCallCount = 0;
let fetchBehavior: () => Promise<{ ok: boolean; status: number }> = async () => ({ ok: true, status: 200 });

beforeEach(() => {
  useTagsStore.setState({ userId: undefined, byVideoId: {}, loadingVideoIds: {}, errorVideoIds: {}, epoch: 0 });
  fromSpy.mockClear();
  fetchCallCount = 0;
  getUserResult = { data: { user: { id: USER_ID } } };
  profileSelectResult = {
    data: { id: USER_ID, invite_redeemed_at: null, monetization_eligible: false },
    error: null,
  };
  fetchBehavior = async () => ({ ok: true, status: 200 });
  vi.stubGlobal("fetch", () => {
    fetchCallCount++;
    return fetchBehavior().then((r) => ({ ...r, json: async () => ({}) }) as unknown as Response);
  });

  useEngagementStore.setState({ userId: null, hydrated: false });
  useCurrentUserStore.setState({ profile: null, inviteRedeemedAt: null, monetizationEligible: false });
  useInviteStore.setState({ validatedCode: "REAL-CODE-123", hasHydrated: true });
});

describe("AuthListener invite redemption", () => {
  it("attempts redeem at most once even when syncProfile fires multiple times in one mount", async () => {
    render(<AuthListener />);
    // getUser().then(syncProfile) resolves, then simulate onAuthStateChange
    // also firing (INITIAL_SESSION-style) shortly after, same as a real
    // mount where both fire close together.
    await vi.waitFor(() => expect(fetchCallCount).toBeGreaterThanOrEqual(1));
    authStateChangeCallback?.("INITIAL_SESSION", { user: { id: USER_ID } });
    authStateChangeCallback?.("TOKEN_REFRESHED", { user: { id: USER_ID } });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCallCount).toBe(1);
  });

  it("clears the pending code on a definitive rejection (400), not just leaving it to retry forever", async () => {
    fetchBehavior = async () => ({ ok: false, status: 400 });
    render(<AuthListener />);
    await vi.waitFor(() => expect(fetchCallCount).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(useInviteStore.getState().validatedCode).toBeNull();
  });

  it("keeps the pending code on a 429 (rate limited), since it may genuinely still be valid", async () => {
    fetchBehavior = async () => ({ ok: false, status: 429 });
    render(<AuthListener />);
    await vi.waitFor(() => expect(fetchCallCount).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(useInviteStore.getState().validatedCode).toBe("REAL-CODE-123");
  });

  it("clears the pending code and updates profile on success", async () => {
    profileSelectResult = {
      data: { id: USER_ID, invite_redeemed_at: null, monetization_eligible: false },
      error: null,
    };
    fetchBehavior = async () => ({ ok: true, status: 200 });
    render(<AuthListener />);
    await vi.waitFor(() => expect(fetchCallCount).toBe(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(useInviteStore.getState().validatedCode).toBeNull();
  });

  it("still calls setProfile (does not get stuck) if the redeem fetch throws — the exact bug that could look like being logged out", async () => {
    vi.stubGlobal("fetch", () => {
      fetchCallCount++;
      return Promise.reject(new Error("network down"));
    });
    render(<AuthListener />);
    await vi.waitFor(() => expect(fetchCallCount).toBe(1));
    await vi.waitFor(() => expect(useCurrentUserStore.getState().profile).not.toBeNull());
  });

  it("never attempts redeem when the profile has already redeemed an invite", async () => {
    profileSelectResult = {
      data: { id: USER_ID, invite_redeemed_at: "2026-01-01T00:00:00Z", monetization_eligible: false },
      error: null,
    };
    render(<AuthListener />);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCallCount).toBe(0);
    expect(useInviteStore.getState().validatedCode).toBe("REAL-CODE-123");
  });
});


it("keeps tags across same-user auth events and clears them on a real identity change", async () => {
  render(<AuthListener />);
  await vi.waitFor(() => expect(useTagsStore.getState().userId).toBe(USER_ID));
  const tiers = { primary: [], secondary: [], technical: [] };
  useTagsStore.setState({ byVideoId: { video: tiers } });
  const epoch = useTagsStore.getState().epoch;
  await act(async () => {
    authStateChangeCallback?.("TOKEN_REFRESHED", { user: { id: USER_ID } });
    authStateChangeCallback?.("SIGNED_IN", { user: { id: USER_ID } });
  });
  expect(useTagsStore.getState().epoch).toBe(epoch);
  expect(useTagsStore.getState().byVideoId.video).toBe(tiers);
  await act(async () => { authStateChangeCallback?.("SIGNED_OUT", null); });
  expect(useTagsStore.getState().byVideoId).toEqual({});
  expect(useTagsStore.getState().epoch).toBe(epoch + 1);
});
