import { renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let onChangeCapture: (() => void) | null = null;
vi.mock("@/lib/use-notifications-realtime", () => ({
  useNotificationsRealtime: (userId: string | null, onChange: () => void) => {
    onChangeCapture = onChange;
    useEffect(() => {
      if (userId) onChange();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);
  },
}));

let unreadCount = 0;
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count: unreadCount }),
      }),
    }),
  }),
}));

const { useUnreadNotificationCount } = await import("./use-unread-notification-count");

beforeEach(() => {
  unreadCount = 0;
  onChangeCapture = null;
});

describe("useUnreadNotificationCount", () => {
  it("is 0 when signed out", async () => {
    const { result } = renderHook(() => useUnreadNotificationCount(null));
    expect(result.current).toBe(0);
  });

  it("reflects the real unread count once loaded", async () => {
    unreadCount = 3;
    const { result } = renderHook(() => useUnreadNotificationCount("u1"));
    await waitFor(() => expect(result.current).toBe(3));
  });

  it("updates when the realtime subscription reports a change", async () => {
    unreadCount = 1;
    const { result } = renderHook(() => useUnreadNotificationCount("u1"));
    await waitFor(() => expect(result.current).toBe(1));

    unreadCount = 5;
    await waitFor(() => {
      onChangeCapture?.();
    });
    await waitFor(() => expect(result.current).toBe(5));
  });

  it("resets to 0 when the user signs out", async () => {
    unreadCount = 2;
    const { result, rerender } = renderHook(({ id }) => useUnreadNotificationCount(id), {
      initialProps: { id: "u1" as string | null },
    });
    await waitFor(() => expect(result.current).toBe(2));

    rerender({ id: null });
    await waitFor(() => expect(result.current).toBe(0));
  });
});
