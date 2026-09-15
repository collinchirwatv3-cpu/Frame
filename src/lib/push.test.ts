import { beforeEach, describe, expect, it, vi } from "vitest";

let mockUser: { id: string } | null = { id: "u1" };
const getUserSpy = vi.fn(async () => ({ data: { user: mockUser } }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: getUserSpy } }),
}));

const {
  isPushSupported,
  isIOSSafariNotInstalled,
  getPermissionState,
  subscribeToPush,
  unsubscribeFromPush,
  hasActivePushSubscription,
} = await import("./push");

function stubNavigatorPush(overrides: Partial<{ serviceWorker: unknown; PushManager: unknown; Notification: unknown }> = {}) {
  Object.defineProperty(window, "PushManager", { value: overrides.PushManager ?? class {}, configurable: true });
  Object.defineProperty(window, "Notification", {
    value: overrides.Notification ?? { permission: "default", requestPermission: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    value: overrides.serviceWorker ?? {},
    configurable: true,
  });
}

beforeEach(() => {
  mockUser = { id: "u1" };
  getUserSpy.mockClear();
  vi.unstubAllGlobals();
  // vi.spyOn(global, "fetch") returns the SAME mock instance across tests
  // once global.fetch is already a mock (it doesn't re-wrap), so its call
  // history survives to the next test unless explicitly restored here.
  vi.restoreAllMocks();
});

describe("isPushSupported", () => {
  it("is false when PushManager/serviceWorker/Notification aren't present", () => {
    // jsdom doesn't define these by default.
    // @ts-expect-error deliberately deleting for the test
    delete window.PushManager;
    expect(isPushSupported()).toBe(false);
  });

  it("is true when all three exist", () => {
    stubNavigatorPush();
    expect(isPushSupported()).toBe(true);
  });
});

describe("isIOSSafariNotInstalled", () => {
  it("is false on a non-iOS user agent", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    expect(isIOSSafariNotInstalled()).toBe(false);
  });

  it("is true on iPhone Safari not running standalone", () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(isIOSSafariNotInstalled()).toBe(true);
  });

  it("is false on iPhone Safari already running standalone (installed)", () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      standalone: true,
    });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(isIOSSafariNotInstalled()).toBe(false);
  });
});

describe("getPermissionState", () => {
  it("reports 'unsupported' when the Push API isn't available", () => {
    // @ts-expect-error deliberately deleting for the test
    delete window.PushManager;
    expect(getPermissionState()).toBe("unsupported");
  });

  it("reports Notification.permission otherwise", () => {
    stubNavigatorPush({ Notification: { permission: "granted" } });
    expect(getPermissionState()).toBe("granted");
  });
});

describe("subscribeToPush", () => {
  it("returns unsupported when the browser lacks the Push API", async () => {
    // @ts-expect-error deliberately deleting for the test
    delete window.PushManager;
    const result = await subscribeToPush("fake-vapid-key");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("never calls Notification.requestPermission before this function is invoked (permission is request-on-demand only)", () => {
    const requestPermission = vi.fn();
    stubNavigatorPush({ Notification: { permission: "default", requestPermission } });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("returns denied and registers nothing server-side if the user declines the permission prompt", async () => {
    const requestPermission = vi.fn().mockResolvedValue("denied");
    const register = vi.fn();
    stubNavigatorPush({
      Notification: { permission: "default", requestPermission },
      serviceWorker: { register, ready: Promise.resolve() },
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const result = await subscribeToPush("fake-vapid-key");
    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("registers the subscription with the server on success", async () => {
    const requestPermission = vi.fn().mockResolvedValue("granted");
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      toJSON: () => ({ keys: { p256dh: "p", auth: "a" } }),
    };
    const pushManager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockResolvedValue(subscription) };
    const register = vi.fn().mockResolvedValue({ pushManager });
    stubNavigatorPush({
      Notification: { permission: "default", requestPermission },
      serviceWorker: { register, ready: Promise.resolve() },
    });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    const result = await subscribeToPush("fake-vapid-key");
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/push/subscriptions",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual(
      expect.objectContaining({ endpoint: subscription.endpoint, p256dh: "p", auth: "a" })
    );
  });
});

describe("unsubscribeFromPush", () => {
  it("is a no-op that never throws when there is no active subscription", async () => {
    stubNavigatorPush({ serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) } });
    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
  });

  it("unsubscribes locally and calls DELETE on the server when a subscription exists", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe };
    const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } };
    stubNavigatorPush({ serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) } });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await unsubscribeFromPush();
    expect(unsubscribe).toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith("/api/push/subscriptions", expect.objectContaining({ method: "DELETE" }));
  });

  it("still unsubscribes locally even if there is no session to authenticate a server-side delete with", async () => {
    mockUser = null;
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe };
    const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } };
    stubNavigatorPush({ serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) } });
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    await unsubscribeFromPush();
    expect(unsubscribe).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never throws even if the server call itself rejects", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe };
    const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) } };
    stubNavigatorPush({ serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) } });
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
  });
});

describe("hasActivePushSubscription", () => {
  it("is false when unsupported", async () => {
    // @ts-expect-error deliberately deleting for the test
    delete window.PushManager;
    expect(await hasActivePushSubscription()).toBe(false);
  });

  it("reflects whether the service worker has a live subscription", async () => {
    const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: "x" }) } };
    stubNavigatorPush({ serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) } });
    expect(await hasActivePushSubscription()).toBe(true);
  });
});
