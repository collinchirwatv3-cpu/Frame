import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; method: string; args: unknown[] };

let calls: Call[] = [];
let mockResponses: Record<string, { data?: unknown; error?: unknown }> = {};

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
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
  }),
}));

const { fetchFollowers, fetchFollowing, fetchBlockedUsers } = await import("./social");

const PROFILE_ROW = {
  id: "p1",
  username: "nightpulse",
  display_name: "Night Pulse",
  avatar_url: null,
  verified: true,
};

beforeEach(() => {
  calls = [];
  mockResponses = {};
});

describe("fetchFollowers", () => {
  it("queries follows by followee_id and maps the embedded profile", async () => {
    mockResponses.follows = { data: [{ created_at: "2026-01-01", profiles: PROFILE_ROW }], error: null };

    const result = await fetchFollowers("target-id");

    expect(calls).toContainEqual({ table: "follows", method: "eq", args: ["followee_id", "target-id"] });
    expect(result).toEqual([
      { id: "p1", username: "nightpulse", displayName: "Night Pulse", avatarUrl: "", verified: true },
    ]);
  });

  it("drops rows whose profile embed is null (a blocked pair, or an RLS-filtered row)", async () => {
    mockResponses.follows = { data: [{ created_at: "2026-01-01", profiles: null }], error: null };
    const result = await fetchFollowers("target-id");
    expect(result).toEqual([]);
  });

  it("returns an empty list on a query error rather than throwing", async () => {
    mockResponses.follows = { data: null, error: { message: "boom" } };
    const result = await fetchFollowers("target-id");
    expect(result).toEqual([]);
  });
});

describe("fetchFollowing", () => {
  it("queries follows by follower_id", async () => {
    mockResponses.follows = { data: [{ created_at: "2026-01-01", profiles: PROFILE_ROW }], error: null };
    const result = await fetchFollowing("target-id");
    expect(calls).toContainEqual({ table: "follows", method: "eq", args: ["follower_id", "target-id"] });
    expect(result[0].username).toBe("nightpulse");
  });
});

describe("fetchBlockedUsers", () => {
  it("queries blocks by blocker_id", async () => {
    mockResponses.blocks = { data: [{ created_at: "2026-01-01", profiles: PROFILE_ROW }], error: null };
    const result = await fetchBlockedUsers("u1");
    expect(calls).toContainEqual({ table: "blocks", method: "eq", args: ["blocker_id", "u1"] });
    expect(result[0].id).toBe("p1");
  });
});
