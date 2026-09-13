import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ProfileHeader } from "./ProfileHeader";
import type { Creator } from "@/lib/types";

let unreadCount = 0;
vi.mock("@/lib/use-unread-notification-count", () => ({
  useUnreadNotificationCount: () => unreadCount,
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
