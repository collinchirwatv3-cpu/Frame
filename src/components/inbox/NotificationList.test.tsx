import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { NotificationList } from "./NotificationList";
import type { NotificationRow } from "@/lib/use-notifications";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const TODAY = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago, same day
const EARLIER_THIS_WEEK = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3d ago
const LONG_AGO = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30d ago

const ACTOR = { username: "milo_aerial", display_name: "Milo", avatar_url: null };

const LIKE: NotificationRow = {
  id: "n-like",
  type: "like",
  read: false,
  created_at: TODAY,
  video_id: "v1",
  actor: ACTOR,
  party: null,
};
const COMMENT: NotificationRow = { ...LIKE, id: "n-comment", type: "comment", created_at: EARLIER_THIS_WEEK };
const FOLLOW: NotificationRow = { ...LIKE, id: "n-follow", type: "follow", video_id: null, created_at: LONG_AGO };
const PARTY: NotificationRow = {
  ...LIKE,
  id: "n-party",
  type: "party_starting",
  video_id: null,
  party: { id: "party-1", video_id: "v9" },
};

vi.useFakeTimers();
vi.setSystemTime(NOW);

describe("NotificationList", () => {
  it("shows a loading skeleton, not the empty state, while loading", () => {
    render(
      <NotificationList
        rows={[]}
        status="loading"
        hasUnread={false}
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  });

  it("shows a retry action on error", () => {
    const onRetry = vi.fn();
    render(
      <NotificationList
        rows={[]}
        status="error"
        hasUnread={false}
        onRetry={onRetry}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the empty state when there are no notifications", () => {
    render(
      <NotificationList
        rows={[]}
        status="ready"
        hasUnread={false}
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("shows a filter-aware empty state when a category filter has no matches", () => {
    render(
      <NotificationList
        rows={[]}
        status="ready"
        hasUnread={false}
        filterLabel="Likes"
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.getByText("No Likes notifications yet")).toBeInTheDocument();
  });

  it("uses Frames vocabulary for each notification type's copy", () => {
    render(
      <NotificationList
        rows={[LIKE, COMMENT, FOLLOW, PARTY]}
        status="ready"
        hasUnread
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.getByText("Milo liked your Frame")).toBeInTheDocument();
    expect(screen.getByText("Milo commented on your Frame")).toBeInTheDocument();
    expect(screen.getByText("Milo followed you")).toBeInTheDocument();
    expect(screen.getByText("Milo's Frame Party is starting")).toBeInTheDocument();
  });

  it("links each notification type to the right destination", () => {
    render(
      <NotificationList
        rows={[LIKE, COMMENT, FOLLOW, PARTY]}
        status="ready"
        hasUnread
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.getByText("Milo liked your Frame").closest("a")).toHaveAttribute("href", "/watch/v1");
    expect(screen.getByText("Milo commented on your Frame").closest("a")).toHaveAttribute("href", "/watch/v1");
    expect(screen.getByText("Milo followed you").closest("a")).toHaveAttribute("href", "/profile/milo_aerial");
    expect(screen.getByText("Milo's Frame Party is starting").closest("a")).toHaveAttribute(
      "href",
      "/watch-together/party-1?v=v9"
    );
  });

  it("groups notifications into Today / Earlier this week / Earlier", () => {
    render(
      <NotificationList
        rows={[LIKE, COMMENT, FOLLOW]}
        status="ready"
        hasUnread
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Earlier this week")).toBeInTheDocument();
    expect(screen.getByText("Earlier")).toBeInTheDocument();
  });

  it("calls onMarkRead only for an unread notification, not an already-read one", () => {
    const onMarkRead = vi.fn();
    const read = { ...LIKE, read: true };
    render(
      <NotificationList
        rows={[LIKE, read]}
        status="ready"
        hasUnread
        onRetry={vi.fn()}
        onMarkRead={onMarkRead}
        onMarkAllRead={vi.fn()}
      />
    );
    fireEvent.click(screen.getAllByText("Milo liked your Frame")[0]);
    expect(onMarkRead).toHaveBeenCalledWith("n-like");
  });

  it("shows Mark all as read only when there's at least one unread notification", () => {
    const { rerender } = render(
      <NotificationList
        rows={[{ ...LIKE, read: true }]}
        status="ready"
        hasUnread={false}
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
      />
    );
    expect(screen.queryByText("Mark all as read")).not.toBeInTheDocument();

    const onMarkAllRead = vi.fn();
    rerender(
      <NotificationList
        rows={[LIKE]}
        status="ready"
        hasUnread
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={onMarkAllRead}
      />
    );
    fireEvent.click(screen.getByText("Mark all as read"));
    expect(onMarkAllRead).toHaveBeenCalled();
  });
});
