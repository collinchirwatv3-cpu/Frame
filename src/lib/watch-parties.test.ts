import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; method: string; args: unknown[] };

let calls: Call[] = [];
let mockResponses: Record<string, { data?: unknown; error?: unknown }> = {};

const VALID_PARTY_ROW = {
  id: "party-1",
  title: "Movie night",
  created_at: "2026-01-01T00:00:00Z",
  visibility: "public",
  scheduled_at: null,
  repeat_rule: "none",
  last_notified_at: null,
  profiles: { id: "host-1", username: "host", display_name: "Host", avatar_url: null },
  videos: { id: "v1", title: "A Film", poster_url: null },
};

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
      builder.in = record("in");
      builder.order = record("order");
      builder.limit = record("limit");
      builder.delete = record("delete");
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
  }),
}));

const { fetchParties, fetchMyParties, fetchFollowedParties, deleteParty } = await import("./watch-parties");

beforeEach(() => {
  calls = [];
  mockResponses = {};
});

function callsFor(table: string, method: string) {
  return calls.filter((c) => c.table === table && c.method === method);
}

describe("fetchParties", () => {
  it("filters to public parties only", async () => {
    mockResponses.watch_parties = { data: [VALID_PARTY_ROW], error: null };

    const result = await fetchParties();

    expect(callsFor("watch_parties", "eq")).toContainEqual({
      table: "watch_parties",
      method: "eq",
      args: ["visibility", "public"],
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("party-1");
  });
});

describe("fetchMyParties", () => {
  it("filters by host_id, not by visibility — the host sees their own parties of any visibility", async () => {
    mockResponses.watch_parties = { data: [VALID_PARTY_ROW], error: null };

    await fetchMyParties("host-1");

    expect(callsFor("watch_parties", "eq")).toContainEqual({
      table: "watch_parties",
      method: "eq",
      args: ["host_id", "host-1"],
    });
    expect(callsFor("watch_parties", "eq").some((c) => c.args[0] === "visibility")).toBe(false);
  });
});

describe("fetchFollowedParties", () => {
  it("short-circuits to [] without ever querying watch_parties when the caller follows no one", async () => {
    mockResponses.follows = { data: [], error: null };

    const result = await fetchFollowedParties("viewer-1");

    expect(result).toEqual([]);
    expect(callsFor("watch_parties", "select")).toHaveLength(0);
  });

  it("queries watch_parties for followed hosts' PUBLIC parties only, two-step", async () => {
    mockResponses.follows = { data: [{ followee_id: "host-1" }, { followee_id: "host-2" }], error: null };
    mockResponses.watch_parties = { data: [VALID_PARTY_ROW], error: null };

    const result = await fetchFollowedParties("viewer-1");

    expect(callsFor("follows", "eq")).toContainEqual({
      table: "follows",
      method: "eq",
      args: ["follower_id", "viewer-1"],
    });
    expect(callsFor("watch_parties", "in")).toContainEqual({
      table: "watch_parties",
      method: "in",
      args: ["host_id", ["host-1", "host-2"]],
    });
    expect(callsFor("watch_parties", "eq")).toContainEqual({
      table: "watch_parties",
      method: "eq",
      args: ["visibility", "public"],
    });
    expect(result).toHaveLength(1);
  });
});

// Regression coverage: watch_parties_delete_own's RLS silently matches zero
// rows for a non-host caller rather than erroring — a bare `!error` check
// can't tell "actually deleted" apart from "matched nothing," which
// previously let deleteParty report success (and the caller navigate away)
// even when nothing was actually deleted.
describe("deleteParty", () => {
  it("reports success only when a row was actually deleted", async () => {
    mockResponses.watch_parties = { data: [{ id: "party-1" }], error: null };
    const result = await deleteParty("party-1");
    expect(result).toBe(true);
  });

  it("reports failure when RLS silently matches zero rows (caller isn't really the host)", async () => {
    mockResponses.watch_parties = { data: [], error: null };
    const result = await deleteParty("party-1");
    expect(result).toBe(false);
  });

  it("reports failure on a real error", async () => {
    mockResponses.watch_parties = { data: null, error: { message: "network error" } };
    const result = await deleteParty("party-1");
    expect(result).toBe(false);
  });
});
