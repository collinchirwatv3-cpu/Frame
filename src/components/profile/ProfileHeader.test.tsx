import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ProfileHeader } from "./ProfileHeader";
import { useCurrentUserStore } from "@/store/current-user-store";
import type { Creator } from "@/lib/types";

let unreadCount = 0;
vi.mock("@/lib/use-unread-notification-count", () => ({
  useUnreadNotificationCount: () => unreadCount,
}));

let unreadDMCount = 0;
vi.mock("@/lib/use-unread-dm-count", () => ({
  useUnreadDMCount: () => unreadDMCount,
}));

const pushSpy = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushSpy, replace: vi.fn() }) }));

let getOrCreateThreadResult: string | null = "t1";
const getOrCreateThreadSpy = vi.fn();
vi.mock("@/lib/dm", () => ({
  getOrCreateThread: async (otherUserId: string) => {
    getOrCreateThreadSpy(otherUserId);
    return getOrCreateThreadResult;
  },
}));

const creator: Creator = {
  id: "c1",
  username: "milo_aerial",
  displayName: "Milo",
  avatarUrl: "",
  bannerUrl: "",
  bio: "",
  followers: 0,
  following: 0,
  totalViews: 0,
};

beforeEach(() => {
  pushSpy.mockClear();
  getOrCreateThreadSpy.mockClear();
  getOrCreateThreadResult = "t1";
  unreadCount = 0;
  unreadDMCount = 0;
  useCurrentUserStore.setState({ profile: null });
});

describe("ProfileHeader — Message button", () => {
  it("navigates to the thread once one is found or created", async () => {
    render(<ProfileHeader creator={creator} isCreator={false} videoCount={0} own={false} />);
    fireEvent.click(screen.getByLabelText(`Message @${creator.username}`));
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith("/inbox/messages/t1"));
    expect(getOrCreateThreadSpy).toHaveBeenCalledWith(creator.id);
  });

  it("shows an error and does not navigate when the thread can't be created (e.g. a blocked pair)", async () => {
    getOrCreateThreadResult = null;
    render(<ProfileHeader creator={creator} isCreator={false} videoCount={0} own={false} />);
    fireEvent.click(screen.getByLabelText(`Message @${creator.username}`));
    await waitFor(() => expect(screen.getByText("Couldn't update that — try again")).toBeInTheDocument());
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("has no Message button on your own profile", () => {
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.queryByLabelText(`Message @${creator.username}`)).not.toBeInTheDocument();
  });
});

describe("ProfileHeader — Messages/Notifications unread badges", () => {
  // Split into two icons (each linking to /inbox, which shows both lists
  // together) rather than one combined count, so which kind of unread
  // activity you have is visible before you tap in.
  it("shows no dot on either icon when there's no unread activity at all", () => {
    unreadCount = 0;
    unreadDMCount = 0;
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Messages")).toBeInTheDocument();
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it("labels the notifications icon with its own count, independent of messages", () => {
    unreadCount = 4;
    unreadDMCount = 0;
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Notifications, 4 unread")).toBeInTheDocument();
    expect(screen.getByLabelText("Messages")).toBeInTheDocument();
  });

  it("labels the messages icon with its own count, independent of notifications", () => {
    unreadCount = 0;
    unreadDMCount = 2;
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Messages, 2 unread")).toBeInTheDocument();
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("shows both badges at once when both have unread activity", () => {
    unreadCount = 3;
    unreadDMCount = 2;
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Notifications, 3 unread")).toBeInTheDocument();
    expect(screen.getByLabelText("Messages, 2 unread")).toBeInTheDocument();
  });

  it("never shows either icon on someone else's profile (own=false)", () => {
    unreadCount = 4;
    unreadDMCount = 2;
    render(<ProfileHeader creator={creator} isCreator={false} videoCount={0} own={false} />);
    expect(screen.queryByLabelText(/Messages/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notifications/)).not.toBeInTheDocument();
  });
});

describe("ProfileHeader — own-profile action row", () => {
  it("shows an Upload link and a separate Edit Profile control, not a single combined button", () => {
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByRole("link", { name: /Upload/ })).toHaveAttribute("href", "/upload");
    expect(screen.getByRole("button", { name: "Edit Profile" })).toBeInTheDocument();
  });

  it("opens the edit modal from the Edit Profile control", () => {
    useCurrentUserStore.setState({ profile: creator }); // EditProfileModal renders nothing without a profile
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Profile" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a Share profile icon in the banner instead of a Share pill", () => {
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Share profile")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });
});
