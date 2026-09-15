import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

let supported = true;
let iosNeedsInstall = false;
let permission: "default" | "granted" | "denied" | "unsupported" = "default";
let active = false;
type SubscribeResult = { ok: true } | { ok: false; reason: string };
const subscribeSpy = vi.fn<(vapidPublicKey: string) => Promise<SubscribeResult>>(async () => ({ ok: true }));
const unsubscribeSpy = vi.fn(async () => {});

vi.mock("@/lib/push", () => ({
  isPushSupported: () => supported,
  isIOSSafariNotInstalled: () => iosNeedsInstall,
  getPermissionState: () => permission,
  hasActivePushSubscription: async () => active,
  subscribeToPush: (vapidPublicKey: string) => subscribeSpy(vapidPublicKey),
  unsubscribeFromPush: () => unsubscribeSpy(),
}));

const { PushNotificationSettings } = await import("./PushNotificationSettings");

beforeEach(() => {
  supported = true;
  iosNeedsInstall = false;
  permission = "default";
  active = false;
  subscribeSpy.mockClear();
  unsubscribeSpy.mockClear();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "test-vapid-key");
});

describe("PushNotificationSettings", () => {
  it("shows an unsupported explanation when the browser lacks push support", async () => {
    supported = false;
    render(<PushNotificationSettings />);
    expect(await screen.findByText(/aren't supported in this browser/i)).toBeInTheDocument();
  });

  it("shows the iOS Home Screen install explanation when relevant", async () => {
    iosNeedsInstall = true;
    render(<PushNotificationSettings />);
    expect(await screen.findByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText(/16\.4/)).toBeInTheDocument();
  });

  it("shows a blocked-permission explanation instead of a toggle when denied", async () => {
    permission = "denied";
    render(<PushNotificationSettings />);
    expect(await screen.findByText(/blocked for FRAME/i)).toBeInTheDocument();
  });

  it("only requests permission after the switch is explicitly clicked, never on mount", async () => {
    render(<PushNotificationSettings />);
    await screen.findByRole("switch");
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it("clicking the switch when off calls subscribeToPush and reflects the on state", async () => {
    render(<PushNotificationSettings />);
    const toggle = await screen.findByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(subscribeSpy).toHaveBeenCalledWith("test-vapid-key");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
  });

  it("clicking the switch when on calls unsubscribeFromPush and reflects the off state", async () => {
    active = true;
    render(<PushNotificationSettings />);
    const toggle = await screen.findByRole("switch");
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));

    fireEvent.click(toggle);

    expect(unsubscribeSpy).toHaveBeenCalled();
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });

  it("shows a denied state if the permission prompt is declined mid-flow", async () => {
    subscribeSpy.mockResolvedValueOnce({ ok: false, reason: "denied" });
    render(<PushNotificationSettings />);
    const toggle = await screen.findByRole("switch");
    fireEvent.click(toggle);
    expect(await screen.findByText(/blocked for FRAME/i)).toBeInTheDocument();
  });
});
