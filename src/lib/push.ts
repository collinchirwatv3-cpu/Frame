import { createClient } from "@/lib/supabase/client";

/** Feature detection only — never assume support from platform sniffing. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iOS/iPadOS Safari requires the site to be installed to the Home Screen
 * (running in standalone display mode) before Push API is usable at all —
 * verified against WebKit's own "Web Push for Web Apps on iOS and iPadOS"
 * announcement (iOS/iPadOS 16.4+). `isPushSupported()` can be true on iOS
 * Safari even when NOT installed (the API objects exist), but subscribing
 * will still fail — so this needs to be checked separately, before that. */
export function isIOSSafariNotInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && "ontouchend" in document); // iPadOS Safari reports as Mac
  if (!isIOS) return false;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function getPermissionState(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registerSubscriptionWithServer(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    }),
  });
  return res.ok;
}

/** Only ever called from a click handler, per the requirement that browser
 * permission is requested only after an explicit user action in Settings —
 * this function itself doesn't guard that; the caller (Settings UI) does,
 * by only wiring it to the enable button's onClick. */
export async function subscribeToPush(vapidPublicKey: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const saved = await registerSubscriptionWithServer(subscription);
  if (!saved) return { ok: false, reason: "server_error" };
  return { ok: true };
}

/** Best-effort, non-throwing: used both for the explicit "turn off on this
 * device" Settings action and for the pre-sign-out detach hook, neither of
 * which should ever block on a network hiccup here. */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    if (!isPushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe().catch(() => {});

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return; // signOut() may already have cleared the session — nothing to authenticate the delete with.

    await fetch("/api/push/subscriptions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  } catch {
    // Never let a cleanup failure surface to the caller — see doc comment.
  }
}

export async function hasActivePushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  return !!subscription;
}
