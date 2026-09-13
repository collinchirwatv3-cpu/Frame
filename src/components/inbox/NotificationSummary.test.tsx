import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { NotificationSummary } from "./NotificationSummary";
import type { NotificationRow } from "@/lib/use-notifications";

const ACTOR = { username: "milo", display_name: "Milo", avatar_url: null };
function row(type: NotificationRow["type"], read: boolean, id: string): NotificationRow {
  return { id, type, read, created_at: "2026-09-01T00:00:00.000Z", video_id: null, actor: ACTOR, party: null };
}

describe("NotificationSummary", () => {
  it("only shows chips for categories with a real producer — no Mentions or System", () => {
    render(<NotificationSummary rows={[]} activeFilter={null} onSelectFilter={vi.fn()} />);
    expect(screen.getByText("Likes")).toBeInTheDocument();
    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText("Followers")).toBeInTheDocument();
    expect(screen.getByText("Frame Parties")).toBeInTheDocument();
    expect(screen.queryByText("Mentions")).not.toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("counts only unread notifications of each type", () => {
    const rows = [row("like", false, "1"), row("like", false, "2"), row("like", true, "3")];
    render(<NotificationSummary rows={rows} activeFilter={null} onSelectFilter={vi.fn()} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows no count badge for a type with zero unread", () => {
    render(<NotificationSummary rows={[row("like", true, "1")]} activeFilter={null} onSelectFilter={vi.fn()} />);
    const likeChip = screen.getByText("Likes").closest("button")!;
    expect(likeChip.textContent).toBe("Likes");
  });

  it("selects a filter on tap, and reports it as pressed", () => {
    const onSelectFilter = vi.fn();
    render(<NotificationSummary rows={[]} activeFilter={null} onSelectFilter={onSelectFilter} />);
    fireEvent.click(screen.getByText("Comments"));
    expect(onSelectFilter).toHaveBeenCalledWith("comment");
  });

  it("clears the filter when tapping the already-active chip again", () => {
    const onSelectFilter = vi.fn();
    render(<NotificationSummary rows={[]} activeFilter="comment" onSelectFilter={onSelectFilter} />);
    const commentChip = screen.getByText("Comments").closest("button")!;
    expect(commentChip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(commentChip);
    expect(onSelectFilter).toHaveBeenCalledWith(null);
  });
});
