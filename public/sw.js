// FRAME push notification service worker.
//
// Scope is deliberately narrow: receive a push event, show a notification,
// and route a click to the right conversation. No fetch handler, no
// offline caching, no asset precaching — this is not a PWA-offline
// service worker, just the minimum surface Push API / Notifications API
// require to exist somewhere.
importScripts("/push-url-guard.js");

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  // The server never puts message content in the payload (see
  // src/app/api/internal/push/process/route.ts) — this default is the
  // actual expected body, not just a fallback for a malformed payload.
  const title = typeof payload.title === "string" ? payload.title : "FRAME";
  const body = typeof payload.body === "string" ? payload.body : "You have a new message";
  const url = isSafeFrameDmUrl(payload.url) ? payload.url : "/inbox";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url },
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url;
  const safeUrl = isSafeFrameDmUrl(targetUrl) ? targetUrl : "/inbox";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.endsWith(safeUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(safeUrl);
      }
    })
  );
});
