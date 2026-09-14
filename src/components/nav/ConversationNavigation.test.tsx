import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { BottomNav } from "./BottomNav";
import { LandscapeSideRail } from "./LandscapeSideRail";
import { AppMainContent } from "./AppMainContent";

let pathname = "/inbox";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/lib/use-landscape-mobile", () => ({ useIsLandscapeMobile: () => true }));

function Shell() {
  return <><BottomNav /><LandscapeSideRail /><AppMainContent>Conversation</AppMainContent></>;
}

describe("conversation navigation", () => {
  it("hides both floating rails and their gutter, then restores them on the inbox", () => {
    pathname = "/inbox/messages/thread-1";
    const { rerender } = render(<Shell />);
    expect(screen.queryAllByRole("navigation")).toHaveLength(0);
    expect(screen.getByRole("main").style.paddingLeft).toBe("");
    pathname = "/inbox";
    rerender(<Shell />);
    expect(screen.getAllByRole("navigation")).toHaveLength(2);
    expect(screen.getByRole("main").style.paddingLeft).not.toBe("");
  });
});
