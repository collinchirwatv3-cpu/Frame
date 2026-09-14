import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { table: string; method: string; args: unknown[] };
let calls: Call[] = [];
let mockResponses: Record<string, { data?: unknown; error?: unknown; count?: number }> = {};
let rpcResponses: Record<string, { data?: unknown; error?: unknown }> = {};
const rpcSpy = vi.fn();

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
      builder.or = record("or");
      builder.order = record("order");
      builder.limit = record("limit");
      builder.lt = record("lt");
      builder.gt = record("gt");
      builder.maybeSingle = record("maybeSingle");
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      return Promise.resolve(rpcResponses[name] ?? { data: null, error: null });
    },
  }),
}));

const fetchMock = vi.fn();

const { fetchThreads, fetchThread, getOrCreateThread, markThreadRead, fetchMessages, sendMessage } = await import(
  "./dm"
);

const A_PROFILE = { id: "me", username: "me_user", display_name: "Me", avatar_url: null };
const B_PROFILE = { id: "them", username: "them_user", display_name: "Them", avatar_url: null };

beforeEach(() => {
  calls = [];
  mockResponses = {};
  rpcResponses = {};
  rpcSpy.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

// Composite (created_at, id) throughout — the shape every real dm_threads
// row actually has (last_message_id is always set alongside last_message_at
// by the touch trigger, never independently null).
function threadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    user_a_id: "me",
    user_b_id: "them",
    last_message_at: null,
    last_message_id: null,
    user_a_last_read_at: null,
    user_a_last_read_message_id: null,
    user_b_last_read_at: null,
    user_b_last_read_message_id: null,
    a: A_PROFILE,
    b: B_PROFILE,
    ...overrides,
  };
}

describe("fetchThreads", () => {
  it("resolves the other participant regardless of which side is user_a", async () => {
    mockResponses.dm_threads = {
      data: [
        threadRow({ id: "t1", last_message_at: "2026-09-01T00:00:00.000Z", last_message_id: "m1" }),
        threadRow({
          id: "t2",
          user_a_id: "them",
          user_b_id: "me",
          a: B_PROFILE,
          b: A_PROFILE,
          last_message_at: "2026-09-02T00:00:00.000Z",
          last_message_id: "m2",
        }),
      ],
      error: null,
    };
    const result = await fetchThreads("me");
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.otherUser.id === "them")).toBe(true);
  });

  it("keeps a thread whose other profile is blocked-hidden, instead of dropping it from the list", async () => {
    mockResponses.dm_threads = {
      data: [threadRow({ last_message_at: "2026-09-01T00:00:00.000Z", last_message_id: "m1", b: null })],
      error: null,
    };
    const result = await fetchThreads("me");
    expect(result).toHaveLength(1);
    expect(result[0].otherUserUnavailable).toBe(true);
  });

  it("marks a thread unread when the last message is newer than this viewer's last read", async () => {
    mockResponses.dm_threads = {
      data: [
        threadRow({
          last_message_at: "2026-09-02T00:00:00.000Z",
          last_message_id: "m2",
          user_a_last_read_at: "2026-09-01T00:00:00.000Z",
          user_a_last_read_message_id: "m1",
        }),
      ],
      error: null,
    };
    const [thread] = await fetchThreads("me");
    expect(thread.unread).toBe(true);
  });

  it("marks a thread read when this viewer's last read is at or after the last message", async () => {
    mockResponses.dm_threads = {
      data: [
        threadRow({
          last_message_at: "2026-09-01T00:00:00.000Z",
          last_message_id: "m1",
          user_a_last_read_at: "2026-09-02T00:00:00.000Z",
          user_a_last_read_message_id: "m2",
        }),
      ],
      error: null,
    };
    const [thread] = await fetchThreads("me");
    expect(thread.unread).toBe(false);
  });

  // The exact scenario mark_dm_thread_read's own tie-break exists for:
  // two messages sharing an identical created_at, distinguishable only by
  // id — a bare-timestamp comparison can't tell these apart.
  it("treats a tied timestamp as unread when the read message's id is earlier than the latest message's id", async () => {
    mockResponses.dm_threads = {
      data: [
        threadRow({
          last_message_at: "2026-09-01T00:00:00.000Z",
          last_message_id: "m2",
          user_a_last_read_at: "2026-09-01T00:00:00.000Z",
          user_a_last_read_message_id: "m1",
        }),
      ],
      error: null,
    };
    const [thread] = await fetchThreads("me");
    expect(thread.unread).toBe(true);
  });

  it("treats a tied timestamp as read once the read message's id matches the latest message's id", async () => {
    mockResponses.dm_threads = {
      data: [
        threadRow({
          last_message_at: "2026-09-01T00:00:00.000Z",
          last_message_id: "m2",
          user_a_last_read_at: "2026-09-01T00:00:00.000Z",
          user_a_last_read_message_id: "m2",
        }),
      ],
      error: null,
    };
    const [thread] = await fetchThreads("me");
    expect(thread.unread).toBe(false);
  });

  it("returns an empty list on a query error", async () => {
    mockResponses.dm_threads = { data: null, error: { message: "boom" } };
    expect(await fetchThreads("me")).toEqual([]);
  });
});

describe("fetchThread", () => {
  it("fetches a single thread by id", async () => {
    mockResponses.dm_threads = { data: threadRow(), error: null };
    const thread = await fetchThread("t1", "me");
    expect(thread?.otherUser.username).toBe("them_user");
    expect(thread?.otherUserUnavailable).toBe(false);
  });

  it("still returns the thread (not null) when the other profile is RLS-hidden by a block, with a neutral placeholder", async () => {
    mockResponses.dm_threads = {
      data: threadRow({
        last_message_at: "2026-09-01T00:00:00.000Z",
        last_message_id: "m1",
        b: null, // profiles_select_all hid this side's row — a block, not a query error
      }),
      error: null,
    };
    const thread = await fetchThread("t1", "me");
    expect(thread).not.toBeNull();
    expect(thread?.otherUserUnavailable).toBe(true);
    expect(thread?.otherUser.id).toBe("them"); // still the real id (from the row, not the embed)
    expect(thread?.otherUser.username).toBe(""); // never a fabricated handle a profile link could 404 on
  });
});

describe("getOrCreateThread", () => {
  it("calls the narrow RPC and returns the thread id", async () => {
    rpcResponses.get_or_create_dm_thread = { data: "t1", error: null };
    const id = await getOrCreateThread("them");
    expect(id).toBe("t1");
    expect(rpcSpy).toHaveBeenCalledWith("get_or_create_dm_thread", { other_user_id: "them" });
  });

  it("returns null when the RPC rejects (e.g. a blocked pair)", async () => {
    rpcResponses.get_or_create_dm_thread = { data: null, error: { message: "Cannot message this user" } };
    expect(await getOrCreateThread("them")).toBeNull();
  });
});

describe("markThreadRead", () => {
  it("calls the narrow RPC with the validated (created_at, id) boundary, not now()", async () => {
    await markThreadRead("t1", { createdAt: "2026-09-01T00:00:00.000Z", id: "m5" });
    expect(rpcSpy).toHaveBeenCalledWith("mark_dm_thread_read", {
      target_thread_id: "t1",
      p_through_created_at: "2026-09-01T00:00:00.000Z",
      p_through_id: "m5",
    });
  });
});

describe("fetchMessages", () => {
  it("with no cursor, fetches the newest page from the DB (descending, tie-broken by id) but returns it in chronological display order", async () => {
    // The DB is queried newest-first (so a long thread's initial load shows
    // recent activity within the 100-row cap, not its first-ever
    // messages) — this response is intentionally already newest-first, the
    // shape a real descending query would actually return.
    mockResponses.dm_messages = {
      data: [
        { id: "m3", thread_id: "t1", sender_id: "me", text: "third", created_at: "2026-09-03T00:00:00.000Z" },
        { id: "m2", thread_id: "t1", sender_id: "me", text: "second", created_at: "2026-09-02T00:00:00.000Z" },
        { id: "m1", thread_id: "t1", sender_id: "me", text: "first", created_at: "2026-09-01T00:00:00.000Z" },
      ],
      error: null,
    };
    const messages = await fetchMessages("t1");
    expect(calls).toContainEqual({ table: "dm_messages", method: "order", args: ["created_at", { ascending: false }] });
    expect(calls).toContainEqual({ table: "dm_messages", method: "order", args: ["id", { ascending: false }] });
    expect(calls).toContainEqual({ table: "dm_messages", method: "limit", args: [100] });
    expect(messages.map((m) => m.text)).toEqual(["first", "second", "third"]);
  });

  it("throws (rather than returning []) on a genuine query error — callers need to tell that apart from a legitimately empty page", async () => {
    mockResponses.dm_messages = { data: null, error: { message: "boom" } };
    await expect(fetchMessages("t1")).rejects.toThrow();
  });

  it("with a `before` cursor, calls the composite (created_at, id) keyset RPC and returns chronological order", async () => {
    rpcResponses.fetch_dm_messages_before = {
      data: [{ id: "m1", thread_id: "t1", sender_id: "me", text: "older", created_at: "2026-09-01T00:00:00.000Z" }],
      error: null,
    };
    const messages = await fetchMessages("t1", { before: { createdAt: "2026-09-02T00:00:00.000Z", id: "m2" } });
    expect(rpcSpy).toHaveBeenCalledWith("fetch_dm_messages_before", {
      p_thread_id: "t1",
      p_before_created_at: "2026-09-02T00:00:00.000Z",
      p_before_id: "m2",
      p_limit: 100,
    });
    expect(messages[0].text).toBe("older");
  });

  it("with an `after` cursor, calls the composite keyset RPC (already ascending — no reverse needed)", async () => {
    rpcResponses.fetch_dm_messages_after = {
      data: [{ id: "m2", thread_id: "t1", sender_id: "me", text: "newer", created_at: "2026-09-03T00:00:00.000Z" }],
      error: null,
    };
    const messages = await fetchMessages("t1", { after: { createdAt: "2026-09-02T00:00:00.000Z", id: "m1" } });
    expect(rpcSpy).toHaveBeenCalledWith("fetch_dm_messages_after", {
      p_thread_id: "t1",
      p_after_created_at: "2026-09-02T00:00:00.000Z",
      p_after_id: "m1",
      p_limit: 100,
    });
    expect(messages[0].text).toBe("newer");
  });

  it("throws when the before-cursor RPC errors", async () => {
    rpcResponses.fetch_dm_messages_before = { data: null, error: { message: "boom" } };
    await expect(fetchMessages("t1", { before: { createdAt: "2026-09-02T00:00:00.000Z", id: "m2" } })).rejects.toThrow();
  });

  it("throws when the after-cursor RPC errors", async () => {
    rpcResponses.fetch_dm_messages_after = { data: null, error: { message: "boom" } };
    await expect(fetchMessages("t1", { after: { createdAt: "2026-09-02T00:00:00.000Z", id: "m1" } })).rejects.toThrow();
  });
});

describe("sendMessage", () => {
  it("posts to the rate-limited route, not a direct insert", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "m1", thread_id: "t1", sender_id: "me", text: "hey", created_at: "2026-09-01T00:00:00.000Z" }),
    });
    const sent = await sendMessage("t1", "hey");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dm/messages",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ threadId: "t1", text: "hey" }) })
    );
    expect(sent?.text).toBe("hey");
  });

  it("returns null when the route rejects the send", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    expect(await sendMessage("t1", "hey")).toBeNull();
  });

  it("returns null (never throws) when the network request itself rejects — offline, DNS, aborted", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(sendMessage("t1", "hey")).resolves.toBeNull();
  });
});
