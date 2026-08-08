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
      builder.delete = chain;
      builder.match = chain;
      builder.single = chain;
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
      return builder;
    },
  }),
}));

const { useCommentsStore } = await import("./comments-store");
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
  useCommentsStore.setState({ byVideoId: {}, loadingVideoId: null });
  useEngagementStore.setState({ userId: "u1" });
});

describe("comments store", () => {
  it("fetches and maps comments joined to their author profile", async () => {
    mockResponses.comments = {
      data: [
        {
          id: "cmt-1",
          text: "Great shot",
          created_at: new Date().toISOString(),
          user: { username: "reddrift", avatar_url: "https://example.com/a.png" },
        },
      ],
      error: null,
    };

    await useCommentsStore.getState().fetchComments("v1");
    const comments = useCommentsStore.getState().byVideoId.v1;
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      id: "cmt-1",
      author: "reddrift",
      avatarUrl: "https://example.com/a.png",
      text: "Great shot",
    });
  });

  it("does not refetch a video whose comments are already loaded", async () => {
    mockResponses.comments = { data: [], error: null };
    await useCommentsStore.getState().fetchComments("v1");
    await useCommentsStore.getState().fetchComments("v1");
    expect(fromSpy).toHaveBeenCalledTimes(1);
  });

  it("appends a new comment after inserting it", async () => {
    mockResponses.comments = {
      data: {
        id: "cmt-2",
        text: "Nice",
        created_at: new Date().toISOString(),
        user: { username: "auroraok", avatar_url: "https://example.com/b.png" },
      },
      error: null,
    };

    await useCommentsStore.getState().addComment("v1", "Nice");
    const comments = useCommentsStore.getState().byVideoId.v1;
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ author: "auroraok", text: "Nice" });
  });

  it("redirects to /login instead of posting when logged out", async () => {
    useEngagementStore.setState({ userId: null });
    await useCommentsStore.getState().addComment("v1", "Nice");
    expect(window.location.assign).toHaveBeenCalledWith("/login");
    expect(useCommentsStore.getState().byVideoId.v1).toBeUndefined();
  });

  describe("replies", () => {
    it("maps a fetched comment's parent_id onto parentId", async () => {
      mockResponses.comments = {
        data: [
          {
            id: "reply-1",
            text: "Which drone?",
            created_at: new Date().toISOString(),
            parent_id: "cmt-1",
            user: { username: "auroraok", avatar_url: null },
          },
        ],
        error: null,
      };

      await useCommentsStore.getState().fetchComments("v1");
      expect(useCommentsStore.getState().byVideoId.v1[0].parentId).toBe("cmt-1");
    });

    it("maps a top-level comment's null parent_id onto a null parentId", async () => {
      mockResponses.comments = {
        data: [
          {
            id: "cmt-1",
            text: "Great shot",
            created_at: new Date().toISOString(),
            parent_id: null,
            user: { username: "reddrift", avatar_url: null },
          },
        ],
        error: null,
      };

      await useCommentsStore.getState().fetchComments("v1");
      expect(useCommentsStore.getState().byVideoId.v1[0].parentId).toBeNull();
    });

    it("inserts a reply with the given parentId", async () => {
      mockResponses.comments = {
        data: {
          id: "reply-1",
          text: "Which drone?",
          created_at: new Date().toISOString(),
          parent_id: "cmt-1",
          user: { username: "auroraok", avatar_url: null },
        },
        error: null,
      };

      await useCommentsStore.getState().addComment("v1", "Which drone?", "cmt-1");
      const comments = useCommentsStore.getState().byVideoId.v1;
      expect(comments[0]).toMatchObject({ text: "Which drone?", parentId: "cmt-1" });
      // The response-mapping assertion above would pass even if the wrong
      // parent_id were sent (the mock's response is fixed, not derived from
      // the call) — this actually verifies what addComment sent.
      expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "cmt-1" }));
    });

    it("omitting parentId posts a top-level comment (parentId null)", async () => {
      mockResponses.comments = {
        data: {
          id: "cmt-1",
          text: "Great shot",
          created_at: new Date().toISOString(),
          parent_id: null,
          user: { username: "reddrift", avatar_url: null },
        },
        error: null,
      };

      await useCommentsStore.getState().addComment("v1", "Great shot");
      expect(useCommentsStore.getState().byVideoId.v1[0].parentId).toBeNull();
      expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ parent_id: null }));
    });
  });
});
