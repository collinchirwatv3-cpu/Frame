import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  // Mirrors the two shapes real frimousse renders that are NOT legitimate
  // tab stops, so the focus trap's exclusion logic is exercised against
  // something closer to its actual output rather than an empty grid:
  // (1) an emoji-grid cell — a real, visible, enabled <button> that
  // frimousse itself always gives `tabIndex={-1}` (arrow keys move a
  // virtual "active" cell, never real DOM focus); and (2) its offscreen
  // row/category-header size probe, rendered inside an `aria-hidden="true"`
  // wrapper regardless of the inner element's own tabIndex — here given
  // tabIndex 0 specifically to prove exclusion comes from the hidden
  // ancestor, not incidentally from also being tabindex-negative.
  const List = ({ components }: { components?: { Emoji?: React.ComponentType<{ emoji: { emoji: string; label: string; isActive: boolean }; tabIndex: number; role: string; "aria-label": string }> } }) => {
    const Emoji = components?.Emoji;
    return (
      <div>
        {Emoji && <Emoji emoji={{ emoji: "🍕", label: "pizza", isActive: false }} tabIndex={-1} role="gridcell" aria-label="pizza" />}
        <div aria-hidden="true" style={{ height: 0, visibility: "hidden" }}>
          <button type="button" tabIndex={0}>
            hidden sizer probe
          </button>
        </div>
      </div>
    );
  };
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

  describe("focus trap", () => {
    function focusables() {
      return [screen.getByLabelText("Close emoji picker"), screen.getByPlaceholderText("Search emoji"), screen.getByLabelText("Skin tone")];
    }

    it("Tab from the last focusable element wraps to the first, staying inside the dialog", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const [close, , skinTone] = focusables();
      skinTone.focus();
      expect(skinTone).toHaveFocus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(close).toHaveFocus();
    });

    it("Shift+Tab from the first focusable element wraps to the last, staying inside the dialog", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const [close, , skinTone] = focusables();
      close.focus();
      expect(close).toHaveFocus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(skinTone).toHaveFocus();
    });

    it("Tab in the middle of the dialog does not touch focus — the browser's own default handling applies", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const [, search] = focusables();
      search.focus();
      const evt = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      const prevented = !document.dispatchEvent(evt);
      expect(prevented).toBe(false); // not intercepted — browser default Tab order takes over
    });

    it("focus landing outside the dialog is pulled back in on the next Tab", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const [close] = focusables();
      document.body.focus(); // simulate focus having escaped the dialog
      fireEvent.keyDown(document, { key: "Tab" });
      expect(close).toHaveFocus();
    });

    it("an emoji-grid cell (Frimousse's own tabIndex={-1}) is never treated as a tab stop", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const pizza = screen.getByRole("gridcell", { name: "pizza" });
      expect(pizza).toHaveAttribute("tabindex", "-1");
      const [close, , skinTone] = focusables();
      // Real DOM order is close, search, skinTone, THEN the emoji cell —
      // so a broken trap that included tabindex-negative buttons would
      // compute the emoji cell (not skinTone) as "last", wrapping Tab
      // from skinTone somewhere other than close.
      skinTone.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(close).toHaveFocus();
      expect(pizza).not.toHaveFocus();
    });

    it("an element inside a hidden ancestor is never treated as a tab stop, even with tabIndex={0}", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const hiddenProbe = screen.getByText("hidden sizer probe");
      expect(hiddenProbe).toHaveAttribute("tabindex", "0");
      const [close, , skinTone] = focusables();
      skinTone.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(close).toHaveFocus();
      expect(hiddenProbe).not.toHaveFocus();
    });

    it("the trap is still correct after searching narrows the grid", () => {
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      fireEvent.change(screen.getByPlaceholderText("Search emoji"), { target: { value: "pizza" } });
      const [close, , skinTone] = focusables();
      skinTone.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(close).toHaveFocus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(skinTone).toHaveFocus();
    });

    it("the trap is still correct while a mutation is pending", async () => {
      setReactionResult = "hang";
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      selectEmoji("🍕");
      await waitFor(() => expect(setReactionSpy).toHaveBeenCalledTimes(1));
      const [close, , skinTone] = focusables();
      skinTone.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(close).toHaveFocus();
      pendingResolve?.();
    });
  });

  describe("closing while a mutation is pending", () => {
    it("does not crash, and the pending request's eventual resolution is silently ignored after unmount", async () => {
      setReactionResult = "hang";
      const onReacted = vi.fn();
      const onClose = vi.fn();
      const { unmount } = render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={onReacted} onClose={onClose} />);
      selectEmoji("🍕");
      await waitFor(() => expect(setReactionSpy).toHaveBeenCalledTimes(1));

      expect(() => unmount()).not.toThrow();
      pendingResolve?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Neither callback fires for a request that settles after the
      // component (and the caller's own state tied to it) is gone.
      expect(onReacted).not.toHaveBeenCalled();
    });
  });

  describe("keyboard-safe sizing (visualViewport)", () => {
    const originalVV = window.visualViewport;
    afterEach(() => {
      Object.defineProperty(window, "visualViewport", { value: originalVV, configurable: true });
    });

    function installVisualViewport(height: number, offsetTop = 0) {
      const listeners = new Set<() => void>();
      const state = { height, offsetTop };
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: {
          get height() {
            return state.height;
          },
          get offsetTop() {
            return state.offsetTop;
          },
          scale: 1,
          addEventListener: (_: string, cb: () => void) => listeners.add(cb),
          removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
        },
      });
      return {
        set(next: { height?: number; offsetTop?: number }) {
          Object.assign(state, next);
          listeners.forEach((cb) => cb());
        },
      };
    }

    it("sizes the dialog from the current visual viewport, not a static value", () => {
      Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
      installVisualViewport(844);
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog.style.height).toBe("675.2px"); // 80% of 844
      expect(dialog.style.bottom).toBe("0px");
    });

    it("shrinks and lifts the dialog when a keyboard reduces the visual viewport", () => {
      Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
      const vv = installVisualViewport(844);
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog");

      act(() => vv.set({ height: 500 }));
      expect(dialog.style.height).toBe("400px"); // 80% of 500
      expect(dialog.style.bottom).toBe("344px"); // 844 - 500
    });

    it("still renders with a bounded height when visualViewport is unavailable", () => {
      Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
      render(<DMEmojiPickerSheet messageId="m1" currentEmoji={null} onReacted={vi.fn()} onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog");
      expect(dialog.style.height).toBe("80dvh");
      expect(dialog.style.bottom).toBe("0px");
    });
  });
});
