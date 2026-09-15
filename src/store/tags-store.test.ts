import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the caching bug this store used to have:
// fetchVideoTags collapsed a real fetch error into the same empty-tiers
// shape as a video that genuinely has no tags, and the store cached that
// result permanently (byVideoId[videoId] existing at all blocked any
// retry), used one global loadingVideoId (so a second video's fetch could
// silently stop the first one's in-flight guard from working), and had no
// guard against a stale in-flight response repopulating a cache that was
// cleared in the meantime (e.g. on sign-out/sign-in).
let fetchImpl: (videoId: string) => Promise<import("@/lib/tags-fetch").FetchVideoTagsResult>;
const fetchVideoTagsSpy = vi.fn((videoId: string) => fetchImpl(videoId));

vi.mock("@/lib/tags-fetch", () => ({
  fetchVideoTags: (videoId: string) => fetchVideoTagsSpy(videoId),
}));

const { useTagsStore, selectVideoTagTiers, selectVideoTagsLoading, selectVideoTagsError } = await import(
  "./tags-store"
);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  useTagsStore.setState({ byVideoId: {}, loadingVideoIds: {}, errorVideoIds: {}, epoch: 0 });
  fetchVideoTagsSpy.mockClear();
});

describe("useTagsStore", () => {
  it("failure -> retry -> success: an errored fetch doesn't get cached, and a later call retries and succeeds", async () => {
    fetchImpl = async () => ({ ok: false });
    await useTagsStore.getState().fetchVideoTagTiers("v1");
    expect(selectVideoTagsError("v1")(useTagsStore.getState())).toBe(true);
    expect(selectVideoTagTiers("v1")(useTagsStore.getState())).toEqual({ primary: [], secondary: [], technical: [] });

    const tiers = { primary: [{ id: "t1" }], secondary: [], technical: [] } as never;
    fetchImpl = async () => ({ ok: true, tiers });
    await useTagsStore.getState().fetchVideoTagTiers("v1");

    expect(fetchVideoTagsSpy).toHaveBeenCalledTimes(2); // the retry actually re-fetched, not skipped
    expect(selectVideoTagsError("v1")(useTagsStore.getState())).toBe(false);
    expect(selectVideoTagTiers("v1")(useTagsStore.getState())).toEqual(tiers);
  });

  it("keeps previously loaded tags visible across a failed refresh instead of clearing them", async () => {
    const tiers = { primary: [{ id: "t1" }], secondary: [], technical: [] } as never;
    fetchImpl = async () => ({ ok: true, tiers });
    await useTagsStore.getState().fetchVideoTagTiers("v1");

    // Force a refetch by clearing the cache entry the guard checks, the
    // same way a caller with a "force" affordance would — simulated here
    // via directly flagging an error state, which is exactly what a
    // failed background refresh would leave behind.
    useTagsStore.setState({ errorVideoIds: { v1: true } });
    fetchImpl = async () => ({ ok: false });
    await useTagsStore.getState().fetchVideoTagTiers("v1");

    expect(selectVideoTagTiers("v1")(useTagsStore.getState())).toEqual(tiers); // still there
    expect(selectVideoTagsError("v1")(useTagsStore.getState())).toBe(true);
  });

  it("distinguishes a legitimate empty tag set from an error", async () => {
    fetchImpl = async () => ({ ok: true, tiers: { primary: [], secondary: [], technical: [] } });
    await useTagsStore.getState().fetchVideoTagTiers("v1");
    expect(selectVideoTagsError("v1")(useTagsStore.getState())).toBe(false);
    expect(selectVideoTagTiers("v1")(useTagsStore.getState())).toEqual({ primary: [], secondary: [], technical: [] });
    // A cache hit with no error means no further fetch on a second call.
    await useTagsStore.getState().fetchVideoTagTiers("v1");
    expect(fetchVideoTagsSpy).toHaveBeenCalledTimes(1);
  });

  it("tracks loading per video — a second video's in-flight fetch doesn't clobber the first's", async () => {
    const d1 = deferred<import("@/lib/tags-fetch").FetchVideoTagsResult>();
    const d2 = deferred<import("@/lib/tags-fetch").FetchVideoTagsResult>();
    fetchImpl = (videoId) => (videoId === "v1" ? d1.promise : d2.promise);

    const p1 = useTagsStore.getState().fetchVideoTagTiers("v1");
    const p2 = useTagsStore.getState().fetchVideoTagTiers("v2");

    expect(selectVideoTagsLoading("v1")(useTagsStore.getState())).toBe(true);
    expect(selectVideoTagsLoading("v2")(useTagsStore.getState())).toBe(true);

    d2.resolve({ ok: true, tiers: { primary: [], secondary: [], technical: [] } });
    await p2;
    // v1 must still read as loading — the old global loadingVideoId would
    // have been stomped by v2's fetch starting.
    expect(selectVideoTagsLoading("v1")(useTagsStore.getState())).toBe(true);
    expect(selectVideoTagsLoading("v2")(useTagsStore.getState())).toBe(false);

    d1.resolve({ ok: true, tiers: { primary: [], secondary: [], technical: [] } });
    await p1;
    expect(selectVideoTagsLoading("v1")(useTagsStore.getState())).toBe(false);
  });

  it("a duplicate call for the same video while one is already in flight doesn't trigger a second fetch", async () => {
    const d1 = deferred<import("@/lib/tags-fetch").FetchVideoTagsResult>();
    fetchImpl = () => d1.promise;

    const p1 = useTagsStore.getState().fetchVideoTagTiers("v1");
    const p2 = useTagsStore.getState().fetchVideoTagTiers("v1"); // duplicate, still in flight

    d1.resolve({ ok: true, tiers: { primary: [], secondary: [], technical: [] } });
    await Promise.all([p1, p2]);

    expect(fetchVideoTagsSpy).toHaveBeenCalledTimes(1);
  });

  it("discards a stale response that resolves after the cache was reset (e.g. an auth identity change)", async () => {
    const d1 = deferred<import("@/lib/tags-fetch").FetchVideoTagsResult>();
    fetchImpl = () => d1.promise;

    const p1 = useTagsStore.getState().fetchVideoTagTiers("v1");
    useTagsStore.getState().reset(); // identity changed mid-fetch

    d1.resolve({ ok: true, tiers: { primary: [{ id: "leaked" }], secondary: [], technical: [] } as never });
    await p1;

    // The stale result must not have repopulated the cache post-reset.
    expect(selectVideoTagTiers("v1")(useTagsStore.getState())).toEqual({ primary: [], secondary: [], technical: [] });
    expect(selectVideoTagsLoading("v1")(useTagsStore.getState())).toBe(false);
  });
});
