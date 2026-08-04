// One-time setup: registers this app's /api/webhooks/stream endpoint with
// Cloudflare Stream so it gets notified when an upload finishes encoding.
// Cloudflare allows exactly one webhook subscription per account, so
// re-running this safely replaces whatever URL was registered before.
//
// Run after CLOUDFLARE_STREAM_API_TOKEN is set and the app is deployed
// somewhere publicly reachable — Stream needs a real URL, not localhost.
//
//   node --env-file=.env.local scripts/register-stream-webhook.mjs https://getframe.vercel.app
//
// Prints the signing secret Cloudflare generates — copy it into
// CLOUDFLARE_STREAM_WEBHOOK_SECRET in both .env.local and Vercel's
// production environment variables. It is only ever shown once here.

const appUrl = process.argv[2];
if (!appUrl) {
  console.error("Usage: node scripts/register-stream-webhook.mjs <https://your-app-url>");
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
if (!accountId || !token) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN in env.");
  process.exit(1);
}

const notificationUrl = new URL("/api/webhooks/stream", appUrl).toString();

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ notificationUrl }),
});

if (!res.ok) {
  console.error(`Cloudflare rejected the webhook registration (${res.status})`);
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();
console.log(`Registered webhook -> ${notificationUrl}`);
console.log(`\nSigning secret (copy this into CLOUDFLARE_STREAM_WEBHOOK_SECRET, shown once):`);
console.log(body.result.secret);
