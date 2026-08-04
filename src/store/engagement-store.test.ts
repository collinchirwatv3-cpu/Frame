import { beforeEach, describe, expect, it, vi } from "vitest";

let mockResponses: Record<string, { data?: unknown; error?: unknown }> = {};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const response = mockResponses[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.match = chain;
      builder.insert = chain;
      builder.delete = chain;
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
  }),
}));

const { useEngagementStore } = await import("./engagement-store");

beforeEach(() => {
  mockResponses = {};
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
    mockResponses.likes = { error: null };
    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBe(true);

    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v1).toBe(false);
  });

  it("tracks likes independently per video", async () => {
    mockResponses.likes = { error: null };
    await useEngagementStore.getState().toggleLike("v1");
    expect(useEngagementStore.getState().likedVideos.v2).toBeFalsy();
  });

  it("toggles follow state per creator", async () => {
    mockResponses.follows = { error: null };
    await useEngagementStore.getState().toggleFollow("c1");
    expect(useEngagementStore.getState().followedCreators.c1).toBe(true);
  });

  it("toggles save state per video", async () => {
    mockResponses.saves = { error: null };
    await useEngagementStore.getState().toggleSave("v1");
    expect(useEngagementStore.getState().savedVideos.v1).toBe(true);
  });

  it("toggles saved-collection state independently of video saves", async () => {
    mockResponses.saved_collections = { error: null };
    await useEngagementStore.getState().toggleSavedCollection("col-drone-masters");
    expect(useEngagementStore.getState().savedCollections["col-drone-masters"]).toBe(true);
    expect(useEngagementStore.getState().savedVideos["col-drone-masters"]).toBeFalsy();

    await useEngagementStore.getState().toggleSavedCollection("col-drone-masters");
    expect(useEngagementStore.getState().savedCollections["col-drone-masters"]).toBe(false);
  });

  it("rolls back the optimistic update if the write fails", async () => {
    mockResponses.likes = { error: { message: "boom" } };
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
