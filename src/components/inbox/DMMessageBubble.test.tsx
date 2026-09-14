import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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

// jsdom has no matchMedia — this codebase's own convention (see
// ConversationNavigation.test.tsx mocking use-landscape-mobile) is to mock
// the hook directly rather than polyfill the browser API globally. Most
// tests here don't care about reduced motion at all; the ones that do set
// this per-test.
let reducedMotion = false;
vi.mock("@/lib/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => reducedMotion,
}));

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
  reducedMotion = false;
  setReactionSpy.mockClear();
});

describe("DMMessageBubble", () => {
  it("renders the message text and its timestamp", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.getByText("hello there")).toBeInTheDocument();
  });

  it("shows a reply preview quoting the real parent message", () => {
    const reply: DMMessage = { ...MESSAGE, id: "m2", replyToId: "m1", replyTo: { id: "m1", senderId: "them", text: "original text" } };
    render(<DMMessageBubble message={reply} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.getByText("original text")).toBeInTheDocument();
    expect(screen.getByText("Them")).toBeInTheDocument();
  });

  it("labels a reply to your own message as 'You', not the other participant's name", () => {
    const reply: DMMessage = { ...MESSAGE, id: "m2", senderId: "me", replyToId: "m0", replyTo: { id: "m0", senderId: "me", text: "my earlier message" } };
    render(<DMMessageBubble message={reply} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("falls back to 'Message unavailable' when a reply's parent couldn't be fetched", () => {
    const reply: DMMessage = { ...MESSAGE, id: "m2", replyToId: "m1", replyTo: null };
    render(<DMMessageBubble message={reply} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.getByText("Message unavailable")).toBeInTheDocument();
    expect(screen.getByText("Original message")).toBeInTheDocument();
  });

  it("shows no reply preview at all for a message that isn't a reply", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.queryByText("Message unavailable")).not.toBeInTheDocument();
  });

  it("opens the actions menu via the message-actions button and calls onReply", () => {
    const onReply = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByText("Reply"));
    expect(onReply).toHaveBeenCalledWith(MESSAGE);
  });

  it("Escape closes the actions menu and returns focus to the actions button", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const menuButton = screen.getByLabelText("Message actions");
    fireEvent.click(menuButton);
    expect(screen.getByRole("group", { name: "Message actions" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("group", { name: "Message actions" }), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Message actions" })).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();
  });

  it("a swipe-right gesture (not a long press) triggers reply directly, without opening the menu", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(80, 2)] });
    expect(onReply).toHaveBeenCalledWith(MESSAGE);
    expect(screen.queryByRole("group", { name: "Message actions" })).not.toBeInTheDocument();
  });

  it("a mostly-vertical drag does not trigger reply", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(80, 40)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("a short swipe (under the reply threshold) does not trigger reply", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(20, 0)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("exactly at the reply threshold triggers reply; one pixel short does not", () => {
    const onReplyAt = vi.fn();
    const { container: atContainer } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReplyAt} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const atBubble = atContainer.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(atBubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(atBubble, { changedTouches: [touch(60, 0)] });
    expect(onReplyAt).toHaveBeenCalledWith(MESSAGE);

    const onReplyShort = vi.fn();
    const { container: shortContainer } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReplyShort} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const shortBubble = shortContainer.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(shortBubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(shortBubble, { changedTouches: [touch(59, 0)] });
    expect(onReplyShort).not.toHaveBeenCalled();
  });

  it("a long press that fires the actions menu suppresses a subsequent swipe-reply on release (long-press/swipe arbitration)", () => {
    vi.useFakeTimers();
    try {
      const onReply = vi.fn();
      const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
      const bubble = container.querySelector(".touch-pan-y")!;
      fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
      act(() => {
        vi.advanceTimersByTime(500); // the hold timer fires — actions menu opens
      });
      expect(screen.getByRole("group", { name: "Message actions" })).toBeInTheDocument();
      // Finger drifts rightward past the reply threshold before lifting —
      // this must NOT also trigger reply once a long press already won.
      fireEvent.touchEnd(bubble, { changedTouches: [touch(80, 0)] });
      expect(onReply).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a genuine swipe cancels the pending long-press timer (swipe/long-press arbitration, the other direction)", () => {
    vi.useFakeTimers();
    try {
      const onReply = vi.fn();
      const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
      const bubble = container.querySelector(".touch-pan-y")!;
      fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
      fireEvent.touchMove(bubble, { touches: [touch(70, 0)] }); // clear rightward movement before the hold delay
      vi.advanceTimersByTime(500); // the hold timer must NOT fire now — it was cancelled
      expect(screen.queryByRole("group", { name: "Message actions" })).not.toBeInTheDocument();
      fireEvent.touchEnd(bubble, { changedTouches: [touch(70, 0)] });
      expect(onReply).toHaveBeenCalledWith(MESSAGE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a second touch point landing mid-swipe cancels the gesture without triggering reply", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchMove(bubble, { touches: [touch(40, 0)] });
    fireEvent.touchMove(bubble, { touches: [touch(50, 0), touch(200, 200)] }); // a second finger lands
    fireEvent.touchEnd(bubble, { changedTouches: [touch(90, 0)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("touchcancel (e.g. the OS taking over the gesture) resets without triggering reply", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchMove(bubble, { touches: [touch(70, 0)] });
    fireEvent.touchCancel(bubble);
    fireEvent.touchEnd(bubble, { changedTouches: [touch(90, 0)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("touching the message-actions button does not start the swipe gesture underneath it", () => {
    const onReply = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const menuButton = screen.getByLabelText("Message actions");
    fireEvent.touchStart(menuButton, { touches: [touch(300, 20)] });
    fireEvent.touchEnd(menuButton, { changedTouches: [touch(380, 20)] }); // would clear the threshold if the gesture had started
    expect(onReply).not.toHaveBeenCalled();
  });

  it("a disabled (blocked/unavailable) conversation never starts the swipe gesture", () => {
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchEnd(bubble, { changedTouches: [touch(90, 0)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("reduced motion: the reply-ready indicator toggles via a discrete class once the threshold is crossed, and the gesture still functions", () => {
    reducedMotion = true;
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    const arrow = container.querySelector('[aria-hidden] svg')!;
    expect(arrow).toHaveClass("opacity-0");

    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchMove(bubble, { touches: [touch(30, 0)] }); // under threshold
    expect(arrow).toHaveClass("opacity-0");

    fireEvent.touchMove(bubble, { touches: [touch(65, 0)] }); // past threshold
    expect(arrow).toHaveClass("opacity-100");

    fireEvent.touchEnd(bubble, { changedTouches: [touch(65, 0)] });
    expect(onReply).toHaveBeenCalledWith(MESSAGE);
    expect(arrow).toHaveClass("opacity-0"); // resets after release
  });

  it("reduced motion: moving back under the threshold before release un-commits the indicator", () => {
    reducedMotion = true;
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    const arrow = container.querySelector('[aria-hidden] svg')!;

    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchMove(bubble, { touches: [touch(65, 0)] }); // past threshold
    expect(arrow).toHaveClass("opacity-100");
    fireEvent.touchMove(bubble, { touches: [touch(30, 0)] }); // drifts back under it
    expect(arrow).toHaveClass("opacity-0");
    fireEvent.touchEnd(bubble, { changedTouches: [touch(30, 0)] });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("reduced motion: touchend coordinates differing from the last touchmove still resolve correctly (fast release)", () => {
    reducedMotion = true;
    const onReply = vi.fn();
    const { container } = render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={onReply} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    const bubble = container.querySelector(".touch-pan-y")!;
    const arrow = container.querySelector('[aria-hidden] svg')!;

    fireEvent.touchStart(bubble, { touches: [touch(0, 0)] });
    fireEvent.touchMove(bubble, { touches: [touch(65, 0)] }); // past threshold
    fireEvent.touchEnd(bubble, { changedTouches: [touch(30, 0)] }); // the release itself lands short
    expect(onReply).not.toHaveBeenCalled();
    expect(arrow).toHaveClass("opacity-0");
  });

  it("setting a reaction from the actions menu calls setReaction and onReactionChange", async () => {
    const onReactionChange = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={onReactionChange} onOpenPicker={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByLabelText("Love"));
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", "❤️"));
    await waitFor(() => expect(onReactionChange).toHaveBeenCalled());
  });

  it("clicking your own already-selected reaction again removes it (toggles to null)", async () => {
    const reactions: DMReaction[] = [{ messageId: "m1", userId: "me", emoji: "❤️" }];
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByLabelText("Love"));
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", null));
  });

  it("shows an error message when setReaction fails, and does not call onReactionChange", async () => {
    setReactionResult = "throw";
    const onReactionChange = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={onReactionChange} onOpenPicker={vi.fn()} />);
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
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.getByLabelText("Like, 2, including you")).toBeInTheDocument();
    expect(screen.getByLabelText("Laugh, 1")).toBeInTheDocument();
  });

  it("when disabled, hides the actions menu entirely but still shows existing reactions read-only", () => {
    const reactions: DMReaction[] = [{ messageId: "m1", userId: "them", emoji: "👍" }];
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.queryByLabelText("Message actions")).not.toBeInTheDocument();
    const chip = screen.getByLabelText("Like, 1");
    expect(chip).toBeInTheDocument();
    expect(chip).toBeDisabled();
  });

  it("the reactions summary also shows a reaction outside the fixed 6 quick reactions (picked via the full picker)", () => {
    const reactions: DMReaction[] = [{ messageId: "m1", userId: "them", emoji: "🍕" }];
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={reactions} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.getByLabelText("🍕, 1")).toBeInTheDocument();
  });

  it("'More emojis' in the actions menu closes the menu and calls onOpenPicker with this message", () => {
    const onOpenPicker = vi.fn();
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled={false} reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={onOpenPicker} />);
    fireEvent.click(screen.getByLabelText("Message actions"));
    fireEvent.click(screen.getByLabelText("More emojis"));
    expect(onOpenPicker).toHaveBeenCalledWith(MESSAGE);
    expect(screen.queryByRole("group", { name: "Message actions" })).not.toBeInTheDocument();
  });

  it("hides 'More emojis' along with the rest of the actions menu when disabled", () => {
    render(<DMMessageBubble message={MESSAGE} userId="me" otherName="Them" disabled reactions={[]} onReply={vi.fn()} onReactionChange={vi.fn()} onOpenPicker={vi.fn()} />);
    expect(screen.queryByLabelText("More emojis")).not.toBeInTheDocument();
  });
});
