import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ProfileHeader } from "./ProfileHeader";
import type { Creator } from "@/lib/types";

let unreadCount = 0;
vi.mock("@/lib/use-unread-notification-count", () => ({
  useUnreadNotificationCount: () => unreadCount,
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

describe("ProfileHeader — Inbox unread badge", () => {
  it("shows no dot when there are no unread notifications", () => {
    unreadCount = 0;
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Inbox")).toBeInTheDocument();
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it("shows a restrained dot and an updated accessible label when there's unread activity", () => {
    unreadCount = 4;
    render(<ProfileHeader creator={creator} isCreator videoCount={0} own />);
    expect(screen.getByLabelText("Inbox, 4 unread")).toBeInTheDocument();
  });

  it("never shows the badge on someone else's profile (own=false), which has no Inbox icon at all", () => {
    unreadCount = 4;
    render(<ProfileHeader creator={creator} isCreator={false} videoCount={0} own={false} />);
    expect(screen.queryByLabelText(/Inbox/)).not.toBeInTheDocument();
  });
});
