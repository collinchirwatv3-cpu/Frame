import { beforeEach, describe, expect, it, vi } from "vitest";

let mockResponses: Record<string, { data?: unknown; error?: unknown }> = {};
const fromSpy = vi.fn();
const insertSpy = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      fromSpy(table);
      const response = mockResponses[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.order = chain;
      builder.insert = (payload: unknown) => {
        insertSpy(payload);
        return builder;
      };
      builder.single = chain;
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
  }),
}));

const { useClipsStore } = await import("./clips-store");
const { useEngagementStore } = await import("./engagement-store");

beforeEach(() => {
  mockResponses = {};
  fromSpy.mockClear();
  insertSpy.mockClear();
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: vi.fn() },
    writable: true,
    configurable: true,
  });
  useClipsStore.setState({ byVideoId: {}, loadingVideoId: null });
  useEngagementStore.setState({ userId: "u1" });
});

describe("clips store", () => {
  it("fetches and maps clips joined to their creator's display name", async () => {
    mockResponses.clips = {
      data: [
        {
          id: "clip-1",
          video_id: "v1",
          user_id: "u2",
          start_seconds: 10,
          end_seconds: 20,
          title: null,
          created_at: new Date().toISOString(),
          creator: { display_name: "Sean de Beer" },
        },
      ],
      error: null,
    };

    await useClipsStore.getState().fetchClips("v1");
    const clips = useClipsStore.getState().byVideoId.v1;
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      id: "clip-1",
      creatorDisplayName: "Sean de Beer",
      startSeconds: 10,
      endSeconds: 20,
    });
  });

  it("does not refetch a video whose clips are already loaded", async () => {
    mockResponses.clips = { data: [], error: null };
    await useClipsStore.getState().fetchClips("v1");
    await useClipsStore.getState().fetchClips("v1");
    expect(fromSpy).toHaveBeenCalledTimes(1);
  });

  it("prepends a newly created clip and sends the right payload", async () => {
    mockResponses.clips = {
      data: {
        id: "clip-2",
        video_id: "v1",
        user_id: "u1",
        start_seconds: 5,
        end_seconds: 15,
        title: "Great moment",
        created_at: new Date().toISOString(),
        creator: { display_name: "Aurora Lane" },
      },
      error: null,
    };

    const ok = await useClipsStore
      .getState()
      .createClip({ videoId: "v1", startSeconds: 5, endSeconds: 15, title: "Great moment" });

    expect(ok).toBe(true);
    const clips = useClipsStore.getState().byVideoId.v1;
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({ startSeconds: 5, endSeconds: 15, title: "Great moment" });
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ video_id: "v1", user_id: "u1", start_seconds: 5, end_seconds: 15 })
    );
  });

  it("redirects to /login instead of creating a clip when logged out", async () => {
    useEngagementStore.setState({ userId: null });
    const ok = await useClipsStore.getState().createClip({ videoId: "v1", startSeconds: 0, endSeconds: 10 });
    expect(ok).toBe(false);
    expect(window.location.assign).toHaveBeenCalledWith("/login");
    expect(useClipsStore.getState().byVideoId.v1).toBeUndefined();
  });

  it("returns false and does not append when the insert fails", async () => {
    mockResponses.clips = { data: null, error: { message: "constraint violation" } };
    const ok = await useClipsStore.getState().createClip({ videoId: "v1", startSeconds: 0, endSeconds: 10 });
    expect(ok).toBe(false);
    expect(useClipsStore.getState().byVideoId.v1).toBeUndefined();
  });
});
