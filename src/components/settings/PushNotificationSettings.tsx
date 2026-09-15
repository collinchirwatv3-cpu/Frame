"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import {
  isPushSupported,
  isIOSSafariNotInstalled,
  getPermissionState,
  hasActivePushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

type Status = "checking" | "unsupported" | "ios_needs_install" | "denied" | "off" | "on";

/** The one place browser permission is ever requested — only from the
 * switch's onClick below, never on mount, per "request browser permission
 * only after that [explicit] action." */
export function PushNotificationSettings() {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isPushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (isIOSSafariNotInstalled()) {
        if (!cancelled) setStatus("ios_needs_install");
        return;
      }
      const permission = getPermissionState();
      if (permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const active = await hasActivePushSubscription();
      if (!cancelled) setStatus(active ? "on" : "off");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(next: boolean) {
    setError(null);
    setBusy(true);
    try {
      if (next) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          setError("Push notifications aren't configured yet.");
          return;
        }
        const result = await subscribeToPush(vapidPublicKey);
        if (result.ok) {
          setStatus("on");
        } else if (result.reason === "denied") {
          setStatus("denied");
        } else {
          setError("Couldn't turn on push notifications — try again.");
        }
      } else {
        await unsubscribeFromPush();
        setStatus("off");
      }
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") return null;

  if (status === "unsupported") {
    return (
      <p className="text-sm text-text-secondary">
        Push notifications aren&apos;t supported in this browser.
      </p>
    );
  }

  if (status === "ios_needs_install") {
    return (
      <p className="text-sm text-text-secondary">
        To get message notifications on iPhone/iPad, add FRAME to your Home Screen first: tap the
        Share button, then &quot;Add to Home Screen,&quot; then open FRAME from the Home Screen icon
        and come back here. (Requires iOS/iPadOS 16.4 or later.)
      </p>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-text-secondary">
        Notifications are blocked for FRAME in your browser settings. Allow notifications there to
        turn this on.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full flex items-center justify-between">
        <span className="text-sm flex items-center gap-2">
          <BellRing size={15} />
          New message notifications on this device
        </span>
        <Switch
          checked={status === "on"}
          onChange={handleToggle}
          disabled={busy}
          label="New message notifications on this device"
        />
      </div>
      {error && <p className="text-xs text-primary">{error}</p>}
    </div>
  );
}
