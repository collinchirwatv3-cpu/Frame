import { renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let onChangeCapture: (() => void) | null = null;
vi.mock("@/lib/use-dm-realtime", () => ({
  useDMRealtime: (userId: string | null, onChange: () => void) => {
    onChangeCapture = onChange;
    useEffect(() => {
      if (userId) onChange();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);
  },
}));

let unreadThreadCount = 0;
const fetchUnreadThreadCountSpy = vi.fn();
vi.mock("@/lib/dm", () => ({
  fetchUnreadThreadCount: async (userId: string) => {
    fetchUnreadThreadCountSpy(userId);
    return unreadThreadCount;
  },
}));

const { useUnreadDMCount } = await import("./use-unread-dm-count");

beforeEach(() => {
  unreadThreadCount = 0;
  onChangeCapture = null;
  fetchUnreadThreadCountSpy.mockClear();
});

describe("useUnreadDMCount", () => {
  it("is 0 when signed out, and never queries", () => {
    const { result } = renderHook(() => useUnreadDMCount(null));
    expect(result.current).toBe(0);
    expect(fetchUnreadThreadCountSpy).not.toHaveBeenCalled();
  });

  it("reflects the real unread thread count once loaded", async () => {
    unreadThreadCount = 3;
    const { result } = renderHook(() => useUnreadDMCount("u1"));
    await waitFor(() => expect(result.current).toBe(3));
    expect(fetchUnreadThreadCountSpy).toHaveBeenCalledWith("u1");
  });

  it("updates when the realtime subscription reports a change", async () => {
    unreadThreadCount = 1;
    const { result } = renderHook(() => useUnreadDMCount("u1"));
    await waitFor(() => expect(result.current).toBe(1));

    unreadThreadCount = 5;
    await waitFor(() => {
      onChangeCapture?.();
    });
    await waitFor(() => expect(result.current).toBe(5));
  });

  it("resets to 0 when the user signs out", async () => {
    unreadThreadCount = 2;
    const { result, rerender } = renderHook(({ id }) => useUnreadDMCount(id), {
      initialProps: { id: "u1" as string | null },
    });
    await waitFor(() => expect(result.current).toBe(2));

    rerender({ id: null });
    await waitFor(() => expect(result.current).toBe(0));
  });
});
