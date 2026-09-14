import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { DMEmojiPickerSheet } from "./DMEmojiPickerSheet";

// frimousse's own correctness (search, categories, skin tones, data
// fetching) is the library's responsibility, not this file's — this mock
// exposes just enough of its API surface (onEmojiSelect, the sub-component
// shapes) to test OUR wiring around it: selection/toggle logic, pending
// state, error/retry display, and close/focus/Escape behavior.
let capturedOnSelect: ((e: { emoji: string; label: string }) => void) | undefined;
vi.mock("frimousse", () => {
  const Root = ({ children, onEmojiSelect }: { children: React.ReactNode; onEmojiSelect?: (e: { emoji: string; label: string }) => void }) => {
    capturedOnSelect = onEmojiSelect;
    return <div>{children}</div>;
  };
  const Search = (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />;
  const Viewport = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const List = () => null;
  const Loading = () => null;
  const Empty = () => null;
  const SkinToneSelector = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>✋</button>;
  return { EmojiPicker: { Root, Search, Viewport, List, Loading, Empty, SkinToneSelector } };
});

let reduced = false;
vi.mock("@/lib/use-prefers-reduced-motion", () => ({ usePrefersReducedMotion: () => reduced }));

let setReactionResult: "resolve" | "throw" | "hang" = "resolve";
let pendingResolve: (() => void) | undefined;
const setReactionSpy = vi.fn();
vi.mock("@/lib/dm-reactions", () => ({
  setReaction: async (messageId: string, emoji: string | null) => {
    setReactionSpy(messageId, emoji);
    if (setReactionResult === "throw") throw new Error("network down");
    if (setReactionResult === "hang") {
      await new Promise<void>((resolve) => {
        pendingResolve = resolve;
      });
    }
  },
}));

function selectEmoji(emoji: string, label = emoji) {
  capturedOnSelect?.({ emoji, label });
}

beforeEach(() => {
  capturedOnSelect = undefined;
  reduced = false;
  setReactionResult = "resolve";
  setReactionSpy.mockClear();
});

describe("DMEmojiPickerSheet", () => {
  it("selecting a new emoji sets the reaction and reports success", async () => {
    const onReacted = vi.fn();
    const onClose = vi.fn();
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={onReacted} onClose={onClose} />);
    selectEmoji("🍕", "pizza");
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", "🍕"));
    await waitFor(() => expect(onReacted).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("selecting the caller's current emoji again removes it (passes null)", async () => {
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji="🍕" onReacted={vi.fn()} onClose={vi.fn()} />);
    selectEmoji("🍕", "pizza");
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", null));
  });

  it("selecting a different emoji than the current one replaces it", async () => {
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji="🍕" onReacted={vi.fn()} onClose={vi.fn()} />);
    selectEmoji("🎉", "party popper");
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledWith("m1", "🎉"));
  });

  it("a failed mutation shows a retryable error and does not close or report success", async () => {
    setReactionResult = "throw";
    const onReacted = vi.fn();
    const onClose = vi.fn();
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={onReacted} onClose={onClose} />);
    selectEmoji("🍕");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save that reaction"));
    expect(onReacted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a retry after a failure can still succeed", async () => {
    setReactionResult = "throw";
    const onReacted = vi.fn();
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={onReacted} onClose={vi.fn()} />);
    selectEmoji("🍕");
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    setReactionResult = "resolve";
    selectEmoji("🍕");
    await waitFor(() => expect(onReacted).toHaveBeenCalled());
  });

  it("prevents a second submission while one is already pending", async () => {
    setReactionResult = "hang";
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
    selectEmoji("🍕");
    await waitFor(() => expect(setReactionSpy).toHaveBeenCalledTimes(1));
    selectEmoji("🎉"); // fired while the first is still in flight — must be ignored
    expect(setReactionSpy).toHaveBeenCalledTimes(1);
    pendingResolve?.();
  });

  it("pressing Escape closes the picker", () => {
    const onClose = vi.fn();
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("the close button closes the picker", () => {
    const onClose = vi.fn();
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close emoji picker"));
    expect(onClose).toHaveBeenCalled();
  });

  it("tapping the backdrop closes the picker", () => {
    const onClose = vi.fn();
    const { container } = render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={onClose} />);
    fireEvent.click(container.querySelector('[aria-hidden="true"]')!);
    expect(onClose).toHaveBeenCalled();
  });

  it("focuses the close button on mount, for keyboard users", () => {
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText("Close emoji picker")).toHaveFocus();
  });

  it("has an accessible dialog role and name", () => {
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Choose an emoji" })).toBeInTheDocument();
  });

  it("shows no error state before any selection is made", () => {
    render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
