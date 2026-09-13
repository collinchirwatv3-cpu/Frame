import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { FollowButton } from "./FollowButton";
import { useEngagementStore } from "@/store/engagement-store";

beforeEach(() => {
  useEngagementStore.setState({
    userId: "me",
    followedCreators: {},
    toggleFollow: vi.fn(),
  });
});

describe("FollowButton", () => {
  it("shows Follow when not following, and calls toggleFollow with the target id", () => {
    const toggleFollow = vi.fn();
    useEngagementStore.setState({ toggleFollow });
    render(<FollowButton userId="creator-1" />);
    const button = screen.getByText("Follow");
    fireEvent.click(button);
    expect(toggleFollow).toHaveBeenCalledWith("creator-1");
  });

  it("shows Following when already following", () => {
    useEngagementStore.setState({ followedCreators: { "creator-1": true } });
    render(<FollowButton userId="creator-1" />);
    expect(screen.getByText("Following")).toBeInTheDocument();
  });

  it("renders nothing for the viewer's own row", () => {
    useEngagementStore.setState({ userId: "creator-1" });
    const { container } = render(<FollowButton userId="creator-1" />);
    expect(container).toBeEmptyDOMElement();
  });
});
