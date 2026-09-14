import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { DMMessageBubble } from "./DMMessageBubble";
import type { DMMessage } from "@/lib/dm";
import type { DMReaction } from "@/lib/dm-reactions";

let setReactionResult: "resolve" | "throw" = "resolve";
const setReactionSpy = vi.fn();
vi.mock("@/lib/dm-reactions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dm-reactions")>("@/lib/dm-reactions");
  return {
    ...actual,
    setReaction: async (messageId: string, emoji: string | null) => {
      setReactionSpy(messageId, emoji);
      if (setReactionResult === "throw") throw new Error("network down");
    },
  };
});

const MESSAGE: DMMessage = {
  id: "m1",
  threadId: "t1",
  senderId: "them",
  text: "hello there",
  createdAt: "2026-09-01T00:00:00.000Z",
};

function touch(x: number, y: number) {
  return { clientX: x, clientY: y };
}

beforeEach(() => {
  setReactionResult = "resolve";
  setReactionSpy.mockClear();
});

describe("DMMessageBubble", () => {
  it("renders the message text and its timestamp", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("shows a reply preview quoting the real parent message", () => {
    const reply: DMMessage = { ...MESSAGE, id: "m2", replyToId: "m1", replyTo: { id: "m1", senderId: "them", text: "original text" } };
    render(<DMMessageBubble message={reply} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.getByText("original text")).toBeInTheDocument();
    expect(screen.getByText("Them")).toBeInTheDocument();
  });

  it("labels a reply to your own message as 'You', not the other participant's name", () => {
    const reply: DMMessage = { ...MESSAGE, id: "m2", senderId: "me", replyToId: "m0", replyTo: { id: "m0", senderId: "me", text: "my earlier message" } };
    render(<DMMessageBubble message={reply} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("falls back to 'Message unavailable' when a reply's parent couldn't be fetched", () => {
    const reply: DMMessage = { ...MESSAGE, id: "m2", replyToId: "m1", replyTo: null };
    render(<DMMessageBubble message={reply} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.getByText("Message unavailable")).toBeInTheDocument();
    expect(screen.getByText("Original message")).toBeInTheDocument();
  });

  it("shows no reply preview at all for a message that isn't a reply", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.queryByText("Message unavailable")).not.toBeInTheDocument();
  });

  it("opens the actions menu via the message-actions button and calls onReply", () => {
    const onReply = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByText("Reply"));
    expect(onReply).toHaveBeenCalledWith(MESSAGE);
  });

  it("Escape closes the actions menu and returns focus to the actions button", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    const menuButton = screen.getByLabelText("Message actions");
    fireEvent.click(menuButton);
    expect(screen.getByRole("group", { name: "Message actions" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("group", { name: "Message actions" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Message actions" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it("a swipe-right gesture (not a long press) triggers reply directly, without opening the menu", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(80, 2)] });
    expect(onReply).toHaveBeenCalledWith(MESSAGE);
    expect(screen.queryByRole("group", { name: "Message actions" })).not.toBeInTheDocument();
  });

  it("a mostly-vertical drag does not trigger reply", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(80, 40)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("a short swipe (under the reply threshold) does not trigger reply", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(20, 0)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("setting a reaction from the actions menu calls setReaction and onReactionChange", async () => {
    const onReactionChange = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={onReactionChange} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByLabelText("Love"));
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", "❤️"));
    await waitFor(() => expect(onReactionChange).toHaveBeenCalled());
  });

  it("clicking your own already-selected reaction again removes it (toggles to null)", async () => {
    const reactions: DMReaction[] = [{ messageId: "m1", userId: "me", emoji: "❤️" }];
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByLabelText("Love"));
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", null));
  });

  it("shows an error message when setReaction fails, and does not call onReactionChange", async () => {
    setReactionResult = "throw";
    const onReactionChange = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={onReactionChange} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByLabelText("Love"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't update reaction"));
    expect(onReactionChange).not.toHaveBeenCalled();
  });

  it("renders an existing reactions summary with counts, marking your own", () => {
    const reactions: DMReaction[] = [
      { messageId: "m1", userId: "them", emoji: "👍" },
      { messageId: "m1", userId: "me", emoji: "👍" },
      { messageId: "m1", userId: "them", emoji: "😂" },
    ];
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.getByLabelText("Like, 2, including you")).toBeInTheDocument();
    expect(screen.getByLabelText("Laugh, 1")).toBeInTheDocument();
  });

  it("when disabled, hides the actions menu entirely but still shows existing reactions read-only", () => {
    const reactions: DMReaction[] = [{ messageId: "m1", userId: "them", emoji: "👍" }];
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} />);
    expect(screen.queryByLabelText("Message actions")).not.toBeInTheDocument();
    const chip = screen.getByLabelText("Like, 1");
    expect(chip).toBeInTheDocument();
    expect(chip).toBeDisabled();
  });
});
