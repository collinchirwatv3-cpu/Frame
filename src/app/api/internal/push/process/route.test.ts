import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// claim_push_jobs/mark_push_job_sent/mark_push_job_failed's own real
// claim/recheck/retry/expiry behavior is covered live against local
// Postgres by scripts/verify-dm-web-push.mjs — this exercises the route's
// auth gate, VAPID config gate, per-job dispatch, and outcome bookkeeping
// with a mocked web-push send (simulated push handling, not a real
// browser delivery — see the handoff report).
let rpcResults: Record<string, { data: unknown; error: { message: string } | null }> = {};
const rpcSpy = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: (name: string, args: unknown) => {
      rpcSpy(name, args);
      return Promise.resolve(rpcResults[name] ?? { data: null, error: { message: `no mock for ${name}` } });
    },
  }),
}));

let sendImpl: (endpoint: string) => Promise<void>;
// payload is only captured for one test's assertion (the fixed-payload
// check below) — not consumed by sendImpl itself, hence the explicit void.
const sendNotificationSpy = vi.fn((sub: { endpoint: string }, payload: string) => {
  void payload;
  return sendImpl(sub.endpoint);
});
const setVapidDetailsSpy = vi.fn();

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (subject: string, publicKey: string, privateKey: string) =>
      setVapidDetailsSpy(subject, publicKey, privateKey),
    sendNotification: (sub: { endpoint: string }, payload: string) => sendNotificationSpy(sub, payload),
  },
}));

const { GET } = await import("./route");

function job(overrides: Partial<Record<string, string>> = {}) {
  return {
    job_id: overrides.job_id ?? "job-1",
    subscription_id: "sub-1",
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    p256dh: "p256dh",
    auth_key: "auth",
    recipient_id: "recipient-1",
    thread_id: "thread-1",
    ...overrides,
  };
}

function request(auth?: string) {
  return new NextRequest("http://localhost/api/internal/push/process", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  rpcSpy.mockClear();
  sendNotificationSpy.mockClear();
  setVapidDetailsSpy.mockClear();
  rpcResults = {
    claim_push_jobs: { data: [], error: null },
    mark_push_job_sent: { data: null, error: null },
    mark_push_job_failed: { data: null, error: null },
  };
  sendImpl = async () => {};
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
});

describe("GET /api/internal/push/process", () => {
  it("rejects a request without the correct CRON_SECRET bearer token", async () => {
    const res = await GET(request("Bearer wrong"));
    expect(res.status).toBe(401);
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("rejects when CRON_SECRET itself is unconfigured (fail closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(request("Bearer test-secret"));
    expect(res.status).toBe(401);
  });

  it("refuses to run if VAPID keys aren't configured, without claiming any jobs", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const res = await GET(request("Bearer test-secret"));
    expect(res.status).toBe(500);
    expect(rpcSpy).not.toHaveBeenCalledWith("claim_push_jobs", expect.anything());
  });

  it("sends each claimed job and marks it sent, with a fixed generic payload (no message content)", async () => {
    rpcResults.claim_push_jobs = { data: [job()], error: null };
    const res = await GET(request("Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ claimed: 1, sent: 1, failed: 0 });

    expect(sendNotificationSpy).toHaveBeenCalledTimes(1);
    const [, payload] = sendNotificationSpy.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed).toEqual({ title: "FRAME", body: "You have a new message", url: "/inbox/messages/thread-1" });

    expect(rpcSpy).toHaveBeenCalledWith("mark_push_job_sent", { p_job_id: "job-1" });
  });

  it("marks a job failed (not expired) on a generic send error, without deleting the subscription", async () => {
    rpcResults.claim_push_jobs = { data: [job()], error: null };
    sendImpl = async () => {
      const err = new Error("network blip") as Error & { statusCode: number };
      err.statusCode = 500;
      throw err;
    };
    const res = await GET(request("Bearer test-secret"));
    expect(await res.json()).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(rpcSpy).toHaveBeenCalledWith(
      "mark_push_job_failed",
      expect.objectContaining({ p_job_id: "job-1", p_expired: false })
    );
  });

  it("marks a job expired on a 410 Gone response, so the subscription gets cleaned up", async () => {
    rpcResults.claim_push_jobs = { data: [job()], error: null };
    sendImpl = async () => {
      const err = new Error("gone") as Error & { statusCode: number };
      err.statusCode = 410;
      throw err;
    };
    await GET(request("Bearer test-secret"));
    expect(rpcSpy).toHaveBeenCalledWith(
      "mark_push_job_failed",
      expect.objectContaining({ p_job_id: "job-1", p_expired: true })
    );
  });

  it("never includes the endpoint or keys in the error passed to mark_push_job_failed", async () => {
    rpcResults.claim_push_jobs = { data: [job({ job_id: "job-secret" })], error: null };
    sendImpl = async () => {
      const err = new Error("boom") as Error & { statusCode: number };
      err.statusCode = 500;
      throw err;
    };
    await GET(request("Bearer test-secret"));
    const call = rpcSpy.mock.calls.find(([name]) => name === "mark_push_job_failed");
    const errorText = (call?.[1] as { p_error: string }).p_error;
    expect(errorText).not.toContain("fcm.googleapis.com");
    expect(errorText).not.toContain("p256dh");
  });

  it("processes multiple claimed jobs and tallies sent/failed independently", async () => {
    rpcResults.claim_push_jobs = {
      data: [job({ job_id: "job-1" }), job({ job_id: "job-2" })],
      error: null,
    };
    let calls = 0;
    sendImpl = async () => {
      calls++;
      if (calls === 2) {
        const err = new Error("fail") as Error & { statusCode: number };
        err.statusCode = 500;
        throw err;
      }
    };
    const res = await GET(request("Bearer test-secret"));
    expect(await res.json()).toEqual({ claimed: 2, sent: 1, failed: 1 });
  });
});
