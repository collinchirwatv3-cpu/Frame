import { act, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Fires onChange once when userId first becomes truthy (matching the real
// useNotificationsRealtime's "doubles as the initial fetch trigger, from an
// effect" behavior) — an effect, not a call during render, since calling it
// unconditionally on every render would re-trigger a fetch after every
// state update use-notifications.ts itself makes, racing its own optimistic
// updates. A test can still fire it again via onChangeCapture to simulate a
// later live change.
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

let selectResponse: { data: unknown; error: unknown } = { data: [], error: null };
let rpcError: { message: string } | null = null;
const rpcSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve(selectResponse),
        }),
      }),
    }),
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      return Promise.resolve({ error: rpcError });
    },
  }),
}));

const { useNotifications } = await import("./use-notifications");

const ROW_A = {
  id: "n1",
  type: "like" as const,
  read: false,
  created_at: "2026-09-01T00:00:00.000Z",
  video_id: "v1",
  actor: { username: "milo", display_name: "Milo", avatar_url: null },
  party: null,
};
const ROW_B = { ...ROW_A, id: "n2", type: "follow" as const, read: false };

beforeEach(() => {
  selectResponse = { data: [ROW_A, ROW_B], error: null };
  rpcError = null;
  rpcSpy.mockClear();
  onChangeCapture = null;
});

describe("useNotifications", () => {
  it("fetches and exposes rows once the realtime subscription comes up", async () => {
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows).toHaveLength(2);
  });

  it("goes to ready with an empty list when signed out, without querying", async () => {
    const { result } = renderHook(() => useNotifications(null));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows).toEqual([]);
  });

  it("reports an error status when the fetch fails, instead of a silently-empty list", async () => {
    selectResponse = { data: null, error: { message: "network down" } };
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("re-fetches when the realtime subscription reports a change", async () => {
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    selectResponse = { data: [ROW_A], error: null };
    await act(async () => {
      onChangeCapture?.();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
  });

  it("marks one notification read optimistically, via the narrow RPC", async () => {
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.markRead("n1");
    });
    expect(result.current.rows.find((r) => r.id === "n1")?.read).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("mark_notification_read", { target_id: "n1" });
    // The other row is untouched — this isn't a mark-all.
    expect(result.current.rows.find((r) => r.id === "n2")?.read).toBe(false);
  });

  it("rolls back the optimistic read-state if mark_notification_read fails", async () => {
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rpcError = { message: "denied" };
    await act(async () => {
      await result.current.markRead("n1");
    });
    expect(result.current.rows.find((r) => r.id === "n1")?.read).toBe(false);
  });

  it("marks every notification read via the narrow mark-all RPC", async () => {
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.markAllRead();
    });
    expect(result.current.rows.every((r) => r.read)).toBe(true);
    expect(rpcSpy).toHaveBeenCalledWith("mark_all_notifications_read", undefined);
  });

  it("rolls back mark-all-read if the RPC fails", async () => {
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rpcError = { message: "denied" };
    await act(async () => {
      await result.current.markAllRead();
    });
    expect(result.current.rows.every((r) => !r.read)).toBe(true);
  });
});
