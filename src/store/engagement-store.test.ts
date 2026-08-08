import { beforeEach, describe, expect, it, vi } from "vitest";

// setUser's hydration reads still go straight through the Supabase client
// (unchanged) — only the toggle writes moved to /api/engagement/[kind] (see
// engagement-store.ts's own comment on why: server-side rate limiting
// needed a route to attach to). Two separate mocks accordingly.
let mockResponses: Record<string, { data?: unknown; error?: unknown }> = {};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const response = mockResponses[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
  }),
}));

const fetchMock = vi.fn();

const { useEngagementStore } = await import("./engagement-store");

beforeEach(() => {
  mockResponses = {};
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: vi.fn() },
    writable: true,
    configurable: true,
  });
  useEngagementStore.setState({
    userId: "u1",
    hydrated: true,
    likedVideos: {},
    savedVideos: {},
    followedCreators: {},
    savedCollections: {},
  });
});

describe("engagement store", () => {
  it("toggles a video like on and off", async () => {
    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBe(true);

    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBe(false);
  });

  it("tracks likes independently per video", async () => {
    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v2).toBeFalsy();
  });

  it("toggles follow state per creator", async () => {
    await useEngagementStore.getState().toggleFollow("c1");
    expect(useEngagementStore.getState().followedCreators.c1).toBe(true);
  });

  it("toggles save state per video", async () => {
    await useEngagementStore.getState().toggleSave("v1");
    expect(useEngagementStore.getState().savedVideos.v1).toBe(true);
  });

  it("toggles saved-collection state independently of video saves", async () => {
    await useEngagementStore.getState().toggleSavedCollection("col-drone-masters");
    expect(useEngagementStore.getState().savedCollections["col-drone-masters"]).toBe(true);
    expect(useEngagementStore.getState().savedVideos["col-drone-masters"]).toBeFalsy();

    await useEngagementStore.getState().toggleSavedCollection("col-drone-masters");
    expect(useEngagementStore.getState().savedCollections["col-drone-masters"]).toBe(false);
  });

  it("posts to the right /api/engagement/[kind] route with targetId and the new active state", async () => {
    await useEngagementStore.getState().toggleLike("v1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/engagement/like",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetId: "v1", active: true }),
      })
    );

    await useEngagementStore.getState().toggleFollow("c1");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/engagement/follow",
      expect.objectContaining({ body: JSON.stringify({ targetId: "c1", active: true }) })
    );
  });

  it("rolls back the optimistic update if the request fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBeFalsy();
  });

  it("redirects to /login instead of writing when logged out", async () => {
    useEngagementStore.setState({ userId: null });
    await useEngagementStore.getState().toggleLike("v1");
    expect(window.location.assign).toHaveBeenCalledWith("/login");
    expect(useEngagementStore.getState().likedVideos.v1).toBeFalsy();
  });

  it("hydrates liked/saved/followed/saved-collection state on setUser", async () => {
    mockResponses.likes = { data: [{ video_id: "v1" }], error: null };
    mockResponses.saves = { data: [{ video_id: "v2" }], error: null };
    mockResponses.follows = { data: [{ followee_id: "c1" }], error: null };
    mockResponses.saved_collections = { data: [{ collection_id: "col-1" }], error: null };

    await useEngagementStore.getState().setUser("u1");
    const state = useEngagementStore.getState();
    expect(state.likedVideos.v1).toBe(true);
    expect(state.savedVideos.v2).toBe(true);
    expect(state.followedCreators.c1).toBe(true);
    expect(state.savedCollections["col-1"]).toBe(true);
  });

  it("clears state on sign-out", async () => {
    useEngagementStore.setState({ likedVideos: { v1: true } });
    await useEngagementStore.getState().setUser(null);
    const state = useEngagementStore.getState();
    expect(state.userId).toBeNull();
    expect(state.likedVideos).toEqual({});
  });
});
