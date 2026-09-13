import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { UserListRow } from "./UserListRow";
import type { FollowProfile } from "@/lib/social";

const USER: FollowProfile = {
  id: "p1",
  username: "nightpulse",
  displayName: "Night Pulse",
  avatarUrl: "",
  verified: false,
};

describe("UserListRow", () => {
  it("shows the display name, username, and an action slot", () => {
    render(<UserListRow user={USER} action={<button>Unblock</button>} />);
    expect(screen.getByText("Night Pulse")).toBeInTheDocument();
    expect(screen.getByText("@nightpulse")).toBeInTheDocument();
    expect(screen.getByText("Unblock")).toBeInTheDocument();
  });

  it("links to the profile by default", () => {
    render(<UserListRow user={USER} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/profile/nightpulse");
  });

  it("skips the profile link when linkToProfile is false (a blocked, now-unreachable profile)", () => {
    render(<UserListRow user={USER} linkToProfile={false} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
