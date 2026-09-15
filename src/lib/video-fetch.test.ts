import { beforeEach, describe, expect, it, vi } from "vitest";

// Scoped to the two new functions this session added (fetchTopCreators,
// fetchFeaturedCollections) — this file has no other test coverage today,
// and testing every existing fetch* function isn't this change's job.
type Call = { table: string; method: string; args: unknown[] };

let calls: Call[] = [];
let mockResponses: Record<string, { data?: unknown; error?: unknown }> = {};

let rpcResponses: Record<string, { data?: unknown; error?: unknown }> = {};
let rpcCalls: { fn: string; args: unknown }[] = [];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const response = mockResponses[table] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      const record =
        (method: string) =>
        (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      builder.select = record("select");
      builder.eq = record("eq");
      builder.order = record("order");
      builder.limit = record("limit");
      builder.in = record("in");
      builder.maybeSingle = record("maybeSingle");
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResponses[fn] ?? { data: [], error: null });
    },
  }),
}));

const {
  fetchTopCreators,
  fetchFeaturedCollections,
  fetchCollections,
  fetchCollectionDetail,
  fetchPublicVideos,
} = await import("./video-fetch");

beforeEach(() => {
  calls = [];
  mockResponses = {};
  rpcCalls = [];
  rpcResponses = {};
});

describe("fetchTopCreators", () => {
  it("orders profiles by total_views descending", async () => {
    mockResponses.profiles = {
      data: [
        {
          id: "p1",
          username: "reddrift",
          display_name: "Red Drift",
          avatar_url: null,
          banner_url: null,
          bio: "",
          website: null,
          instagram_handle: null,
          verified: false,
          premium_status: null,
          statement: null,
          equipment: null,
          available_for_hire: false,
          followers_count: 0,
          following_count: 0,
          total_views: 500,
        },
      ],
      error: null,
    };

    const result = await fetchTopCreators(5);

    expect(calls).toContainEqual({
      table: "profiles",
      method: "order",
      args: ["total_views", { ascending: false }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].totalViews).toBe(500);
    expect(result[0].username).toBe("reddrift");
  });

  it("returns [] on error rather than throwing", async () => {
    mockResponses.profiles = { data: null, error: { message: "boom" } };
    const result = await fetchTopCreators();
    expect(result).toEqual([]);
  });
});

describe("fetchFeaturedCollections", () => {
  it("filters to is_featured collections and maps curator/video ids", async () => {
    mockResponses.collections = {
      data: [
        {
          id: "c1",
          title: "Cinematic Travels",
          description: "",
          cover_url: "https://example.com/cover.jpg",
          is_featured: true,
          curator: { id: "u1", display_name: "The Wandering Lens" },
          collection_videos: [{ video_id: "v1" }, { video_id: "v2" }],
        },
      ],
      error: null,
    };

    const result = await fetchFeaturedCollections();

    expect(calls).toContainEqual({ table: "collections", method: "eq", args: ["is_featured", true] });
    expect(result).toEqual([
      {
        id: "c1",
        title: "Cinematic Travels",
        description: "",
        coverUrl: "https://example.com/cover.jpg",
        videoIds: ["v1", "v2"],
        isFeatured: true,
        curatorId: "u1",
        curatorName: "The Wandering Lens",
      },
    ]);
  });

  it("returns [] on error rather than throwing", async () => {
    mockResponses.collections = { data: null, error: { message: "boom" } };
    const result = await fetchFeaturedCollections();
    expect(result).toEqual([]);
  });
});


describe("live collections", () => {
  it("returns an empty catalogue without bundled demo fallbacks", async () => {
    expect(await fetchCollections()).toEqual([]);
    expect(calls.some((call) => call.method === "eq")).toBe(false);
  });

  it("surfaces collection list errors for the Discover retry state", async () => {
    mockResponses.collections = { data: null, error: new Error("offline") };
    await expect(fetchCollections()).rejects.toThrow("offline");
  });

  it("returns null for a deleted collection without requesting its videos", async () => {
    mockResponses.collections = { data: null, error: null };
    const { createClient } = await import("./supabase/client");
    expect(await fetchCollectionDetail("deleted", createClient())).toBeNull();
    expect(calls.every((call) => call.table === "collections")).toBe(true);
  });

  it("orders live videos by collection position and explicitly excludes private/unready videos", async () => {
    mockResponses.collections = { data: { id: "c1", title: "Real collection", description: "", cover_url: "", collection_videos: [], curator: null } };
    mockResponses.collection_videos = { data: [{ video_id: "v2" }, { video_id: "v1" }] };
    mockResponses.videos = { data: ["v1", "v2"].map((id) => ({ id, playback_url: "/video", poster_url: "/poster", profiles: { id: "creator" } })) };
    const { createClient } = await import("./supabase/client");
    const result = await fetchCollectionDetail("c1", createClient());
    expect(result?.videos.map((v) => v.id)).toEqual(["v2", "v1"]);
    expect(calls).toContainEqual({ table: "videos", method: "eq", args: ["visibility", "public"] });
    expect(calls).toContainEqual({ table: "videos", method: "eq", args: ["processing_status", "ready"] });
  });
});

// Regression coverage for the resolveTagFilterIds pagination bug: the old
// match_all_tags-then-order-client-side approach could silently truncate
// to an arbitrary, non-recency-ordered subset before the real order/limit
// ever ran. search_videos_by_tags now does intersection + ordering +
// pagination in one RPC call — these tests cover the JS-side wiring around
// it (real ordering/RLS/pagination behavior is covered separately by live
// Postgres tests against the local Supabase instance, not mockable here).
describe("fetchPublicVideos tag filtering", () => {
  it("routes through search_videos_by_tags when tagIds is provided, not the plain query", async () => {
    rpcResponses.search_videos_by_tags = { data: [{ id: "v1", created_at: "2026-01-02" }], error: null };
    mockResponses.videos = {
      data: [{ id: "v1", playback_url: "/v", poster_url: "/p", profiles: { id: "c1" } }],
      error: null,
    };

    await fetchPublicVideos(30, ["tag-a", "tag-b"]);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("search_videos_by_tags");
    expect(rpcCalls[0].args).toMatchObject({
      p_tag_ids: ["tag-a", "tag-b"],
      p_content_types: ["film", "longform"],
      p_limit: 30,
    });
    // The plain (untagged) query path must not also run.
    expect(calls.some((c) => c.method === "order")).toBe(false);
  });

  it("re-sorts fetched rows back into the RPC's ordered id sequence, not .in()'s arbitrary order", async () => {
    rpcResponses.search_videos_by_tags = {
      data: [
        { id: "v2", created_at: "2026-01-02" },
        { id: "v1", created_at: "2026-01-01" },
      ],
      error: null,
    };
    // Deliberately returned in the opposite order from the RPC's id list —
    // PostgREST's .in() genuinely doesn't guarantee input order, so this
    // is the realistic case the reorder step exists to handle.
    mockResponses.videos = {
      data: [
        { id: "v1", playback_url: "/v1", poster_url: "/p1", profiles: { id: "c1" } },
        { id: "v2", playback_url: "/v2", poster_url: "/p2", profiles: { id: "c1" } },
      ],
      error: null,
    };

    const result = await fetchPublicVideos(30, ["tag-a"]);
    expect(result.map((v) => v.id)).toEqual(["v2", "v1"]);
  });

  it("throws (doesn't silently return []) on a genuine RPC failure, so 'no matches' stays distinguishable from a request failure", async () => {
    rpcResponses.search_videos_by_tags = { data: null, error: new Error("connection reset") };
    await expect(fetchPublicVideos(30, ["tag-a"])).rejects.toThrow("connection reset");
  });

  it("returns [] for a legitimate empty match, without treating it as an error", async () => {
    rpcResponses.search_videos_by_tags = { data: [], error: null };
    const result = await fetchPublicVideos(30, ["tag-a"]);
    expect(result).toEqual([]);
  });

  it("falls back to the plain unfiltered query when tagIds is empty or omitted", async () => {
    mockResponses.videos = { data: [], error: null };
    await fetchPublicVideos(30, []);
    await fetchPublicVideos(30);
    expect(rpcCalls).toHaveLength(0);
  });
});
