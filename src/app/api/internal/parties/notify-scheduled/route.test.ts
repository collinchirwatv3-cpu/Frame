import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let candidateParties: { id: string; host_id: string; repeat_rule: string; last_notified_at: string | null }[] = [];
let followersByHost: Record<string, string[]> = {};
const insertedNotifications: unknown[] = [];
const updatedLastNotified: { id: string; last_notified_at: string }[] = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "watch_parties") {
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = chain;
        builder.not = chain;
        builder.lte = async () => ({ data: candidateParties, error: null });
        builder.update = (values: { last_notified_at: string }) => ({
          eq: async (_col: string, id: string) => {
            updatedLastNotified.push({ id, last_notified_at: values.last_notified_at });
            return { error: null };
          },
        });
        return builder;
      }
      if (table === "follows") {
        return {
          select: () => ({
            eq: async (_col: string, hostId: string) => ({
              data: (followersByHost[hostId] ?? []).map((follower_id) => ({ follower_id })),
              error: null,
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: async (rows: unknown[]) => {
            insertedNotifications.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  }),
}));

const { GET, isDue } = await import("./route");

function request() {
  return new NextRequest("http://localhost/api/internal/parties/notify-scheduled", {
    headers: { authorization: "Bearer test-secret" },
  });
}

beforeEach(() => {
  candidateParties = [];
  followersByHost = {};
  insertedNotifications.length = 0;
  updatedLastNotified.length = 0;
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
});

describe("isDue", () => {
  const now = new Date("2026-01-08T12:00:00Z");

  it("is due when never notified, regardless of repeat_rule", () => {
    expect(isDue({ repeat_rule: "none", last_notified_at: null }, now)).toBe(true);
    expect(isDue({ repeat_rule: "weekly", last_notified_at: null }, now)).toBe(true);
  });

  it("a one-off ('none') party is never due again once notified", () => {
    expect(isDue({ repeat_rule: "none", last_notified_at: "2026-01-01T12:00:00Z" }, now)).toBe(false);
  });

  it("a daily party is not due before 24h have elapsed", () => {
    expect(isDue({ repeat_rule: "daily", last_notified_at: "2026-01-08T00:00:00Z" }, now)).toBe(false);
  });

  it("a daily party is due once 24h have elapsed", () => {
    expect(isDue({ repeat_rule: "daily", last_notified_at: "2026-01-07T11:00:00Z" }, now)).toBe(true);
  });

  it("a weekly party is not due before 7 days have elapsed", () => {
    expect(isDue({ repeat_rule: "weekly", last_notified_at: "2026-01-05T12:00:00Z" }, now)).toBe(false);
  });

  it("a weekly party is due once 7 days have elapsed", () => {
    expect(isDue({ repeat_rule: "weekly", last_notified_at: "2026-01-01T11:00:00Z" }, now)).toBe(true);
  });
});

describe("GET /api/internal/parties/notify-scheduled", () => {
  it("rejects a request without the correct CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "the-real-secret");
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("notifies every follower of a due party's host and marks it notified", async () => {
    candidateParties = [{ id: "party-1", host_id: "host-1", repeat_rule: "none", last_notified_at: null }];
    followersByHost = { "host-1": ["follower-1", "follower-2"] };

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notified).toBe(1);
    expect(insertedNotifications).toEqual([
      { recipient_id: "follower-1", actor_id: "host-1", type: "party_starting", party_id: "party-1" },
      { recipient_id: "follower-2", actor_id: "host-1", type: "party_starting", party_id: "party-1" },
    ]);
    expect(updatedLastNotified).toHaveLength(1);
    expect(updatedLastNotified[0].id).toBe("party-1");
  });

  it("still marks a party notified when it has zero followers", async () => {
    candidateParties = [{ id: "party-1", host_id: "host-1", repeat_rule: "none", last_notified_at: null }];
    followersByHost = {};

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(insertedNotifications).toEqual([]);
    expect(updatedLastNotified).toHaveLength(1);
  });

  it("skips a candidate that isn't actually due yet (already notified, one-off)", async () => {
    candidateParties = [
      { id: "party-1", host_id: "host-1", repeat_rule: "none", last_notified_at: "2026-01-01T00:00:00Z" },
    ];
    followersByHost = { "host-1": ["follower-1"] };

    const res = await GET(request());
    const body = await res.json();

    expect(body.notified).toBe(0);
    expect(insertedNotifications).toEqual([]);
    expect(updatedLastNotified).toEqual([]);
  });
});
