import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Settings has a lot of surface area (interests, playback, moderation,
// sign-out, account deletion) untouched by this brief — scoped to just the
// new Notifications section, so only what that section actually touches
// gets mocked.
vi.mock("@/lib/use-is-moderator", () => ({ useIsModerator: () => "not-moderator" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

let fetchedPrefs = { partyStarting: true, comments: true, follows: true };
let saveResult = true;
const saveSpy = vi.fn();
vi.mock("@/lib/notification-preferences", () => ({
  fetchNotificationPreferences: async () => fetchedPrefs,
  saveNotificationPreferences: async (userId: string, prefs: unknown) => {
    saveSpy(userId, prefs);
    return saveResult;
  },
}));

const { useCurrentUserStore } = await import("@/store/current-user-store");
const { default: SettingsPage } = await import("./page");

beforeEach(() => {
  fetchedPrefs = { partyStarting: true, comments: true, follows: true };
  saveResult = true;
  saveSpy.mockClear();
  useCurrentUserStore.setState({ profile: { id: "u1" } as never });
});

describe("Settings — Notifications preferences", () => {
  it("loads real preferences and reflects them in the switches", async () => {
    fetchedPrefs = { partyStarting: false, comments: true, follows: true };
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByLabelText("Frame Party starts")).toHaveAttribute("aria-checked", "false");
    });
    expect(screen.getByLabelText("Comments on your Frames")).toHaveAttribute("aria-checked", "true");
  });

  it("saves the full preferences object when one switch is flipped", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("New followers")).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(screen.getByLabelText("New followers"));
    expect(screen.getByLabelText("New followers")).toHaveAttribute("aria-checked", "false");
    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith("u1", { partyStarting: true, comments: true, follows: false })
    );
  });

  it("rolls back the switch and shows an error if saving fails", async () => {
    saveResult = false;
    render(<SettingsPage />);
    await waitFor(() => expect(screen.getByLabelText("Comments on your Frames")).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(screen.getByLabelText("Comments on your Frames"));
    await waitFor(() =>
      expect(screen.getByLabelText("Comments on your Frames")).toHaveAttribute("aria-checked", "true")
    );
    expect(screen.getByText("Couldn't save that — try again.")).toBeInTheDocument();
  });
});
