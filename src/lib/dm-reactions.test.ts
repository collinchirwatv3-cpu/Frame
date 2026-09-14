import { describe, expect, it, vi, beforeEach } from "vitest";

let inResponses: { data?: unknown; error?: unknown }[] = [];
const inSpy = vi.fn();
const rpcSpy = vi.fn();
let rpcResponse: { error: unknown } = { error: null };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          in: (...args: unknown[]) => {
            inSpy(table, ...args);
            return Promise.resolve(inResponses.shift() ?? { data: [], error: null });
          },
        }),
      }),
    }),
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      return Promise.resolve(rpcResponse);
    },
  }),
}));

const { fetchReactions, setReaction, DM_REACTIONS, isValidReactionEmoji } = await import("./dm-reactions");

beforeEach(() => {
  inResponses = [];
  inSpy.mockClear();
  rpcSpy.mockClear();
  rpcResponse = { error: null };
});

describe("fetchReactions", () => {
  it("returns an empty list without querying when there are no message ids", async () => {
    const result = await fetchReactions("t1", []);
    expect(result).toEqual([]);
    expect(inSpy).not.toHaveBeenCalled();
  });

  it("maps rows to DMReaction, scoped to the given thread", async () => {
    inResponses = [{ data: [{ message_id: "m1", user_id: "u1", emoji: "❤️" }], error: null }];
    const result = await fetchReactions("t1", ["m1"]);
    expect(result).toEqual([{ messageId: "m1", userId: "u1", emoji: "❤️" }]);
    expect(inSpy).toHaveBeenCalledWith("dm_reactions", "message_id", ["m1"]);
  });

  it("excludes a row whose emoji is null — a removed reaction, not a real one", async () => {
    inResponses = [
      {
        data: [
          { message_id: "m1", user_id: "u1", emoji: null },
          { message_id: "m1", user_id: "u2", emoji: "👍" },
        ],
        error: null,
      },
    ];
    const result = await fetchReactions("t1", ["m1"]);
    expect(result).toEqual([{ messageId: "m1", userId: "u2", emoji: "👍" }]);
  });

  it("includes a row whose emoji is outside the fixed 6 quick reactions — the full picker allows others, and the server already validated it", async () => {
    inResponses = [{ data: [{ message_id: "m1", user_id: "u1", emoji: "🍕" }], error: null }];
    const result = await fetchReactions("t1", ["m1"]);
    expect(result).toEqual([{ messageId: "m1", userId: "u1", emoji: "🍕" }]);
  });

  it("chunks requests past 100 message ids into separate queries, not one oversized IN clause", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `m${i}`);
    inResponses = [
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ];
    await fetchReactions("t1", ids);
    expect(inSpy).toHaveBeenCalledTimes(3);
    expect(inSpy.mock.calls[0][2]).toHaveLength(100);
    expect(inSpy.mock.calls[1][2]).toHaveLength(100);
    expect(inSpy.mock.calls[2][2]).toHaveLength(50);
  });

  it("throws on a genuine query error rather than returning a silently-empty list", async () => {
    inResponses = [{ data: null, error: { message: "network down" } }];
    await expect(fetchReactions("t1", ["m1"])).rejects.toThrow("network down");
  });

  it("every emoji in the fixed set is a real, distinct value (sanity check the constant the RPC/UI both trust)", () => {
    const emojis = DM_REACTIONS.map((r) => r.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
    expect(emojis.length).toBeGreaterThan(0);
  });
});

describe("setReaction", () => {
  it("calls set_dm_reaction with the message id and emoji", async () => {
    await setReaction("m1", "❤️");
    expect(rpcSpy).toHaveBeenCalledWith("set_dm_reaction", { p_message_id: "m1", p_emoji: "❤️" });
  });

  it("passes null to remove a reaction, not a delete call", async () => {
    await setReaction("m1", null);
    expect(rpcSpy).toHaveBeenCalledWith("set_dm_reaction", { p_message_id: "m1", p_emoji: null });
  });

  it("throws on a genuine RPC error (e.g. rate-limited or blocked) rather than swallowing it", async () => {
    rpcResponse = { error: { message: "Too many reactions. Please slow down." } };
    await expect(setReaction("m1", "❤️")).rejects.toThrow("Too many reactions");
  });
});

describe("isValidReactionEmoji", () => {
  it("accepts each of the 6 quick reactions", () => {
    for (const { emoji } of DM_REACTIONS) expect(isValidReactionEmoji(emoji)).toBe(true);
  });

  it("accepts a complex ZWJ sequence (family emoji) as one grapheme cluster", () => {
    expect(isValidReactionEmoji("👨‍👩‍👧‍👦")).toBe(true);
  });

  it("accepts a skin-tone-modified emoji", () => {
    expect(isValidReactionEmoji("🤝🏽")).toBe(true);
  });

  it("accepts a flag (two regional indicators)", () => {
    expect(isValidReactionEmoji("🇺🇸")).toBe(true);
  });

  it("rejects a plain ASCII letter or digit", () => {
    expect(isValidReactionEmoji("a")).toBe(false);
    expect(isValidReactionEmoji("5")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidReactionEmoji("")).toBe(false);
  });

  it("rejects real text, even short text", () => {
    expect(isValidReactionEmoji("hi")).toBe(false);
  });

  it("rejects two emoji concatenated — not a single grapheme cluster", () => {
    expect(isValidReactionEmoji("😀😀")).toBe(false);
  });

  it("rejects an oversized payload", () => {
    expect(isValidReactionEmoji("🇺🇸".repeat(20))).toBe(false);
  });
});
