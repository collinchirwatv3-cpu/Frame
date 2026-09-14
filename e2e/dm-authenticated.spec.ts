import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { bypassOnboardingGate } from "./test-utils";

// Real, authenticated DM browser coverage — send/receive, history loading,
// retry, navigation during pending work, and blocked-history behavior, all
// against a real Supabase project with real signed-in sessions. This is
// deliberately separate from dm.spec.ts, which only ever exercises the
// CI-safe placeholder-backend "loading skeleton, doesn't crash" smoke
// test — that coverage proves the route mounts; it says nothing about
// whether a message actually sends, arrives, or survives a race.
//
// Requires a real Supabase project (URL + anon + SERVICE ROLE key) — not
// available in CI (ci.yml deliberately runs e2e against a placeholder
// project with no service role key, since it needs no real backend for
// the specs it does run). This whole file is skipped there. Run locally
// with `.env.local` populated to actually exercise it:
//
//   npx playwright test e2e/dm-authenticated.spec.ts
//
// Creates and tears down its own throwaway users/threads/messages — safe
// to run against a real project repeatedly.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canRunLive = !!SUPABASE_URL && !!ANON_KEY && !!SERVICE_KEY && !SUPABASE_URL.includes("placeholder");

test.describe("DM — authenticated browser coverage (requires a real Supabase project)", () => {
  // Generous: these tests create several real users via the Auth admin
  // API, which has occasionally exhibited transient AuthRetryableFetchError
  // failures against this shared dev project under heavy use — the retry
  // helper below backs off for several seconds per attempt, which can
  // exceed Playwright's 30s default well before the underlying request
  // actually succeeds.
  test.setTimeout(60000);

  test.skip(
    !canRunLive,
    "Requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY for a real project. " +
      "Not available in CI (placeholder project, no service role key) — run locally with .env.local to exercise this coverage."
  );

  const admin = canRunLive
    ? createClient(SUPABASE_URL!, SERVICE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  const stamp = Date.now();
  const password = "TestPass123!e2edm";

  /** admin.auth.admin.createUser intermittently throws
   * AuthRetryableFetchError against a busy dev project (its own name says
   * it's meant to be retried) — this suite alone creates a couple dozen
   * throwaway users per run, on a project other scripts are also hitting.
   * A short backoff-and-retry is standard practice for exactly this error
   * class, not a workaround for a real bug. */
  async function createUserWithRetry(params: Parameters<NonNullable<typeof admin>["auth"]["admin"]["createUser"]>[0]) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await admin!.auth.admin.createUser(params);
      if (!error) return data;
      lastError = error;
      if (error.name !== "AuthRetryableFetchError") throw error;
      const delay = 1000 * 2 ** attempt;
      console.log(`  createUser retry ${attempt + 1}/3 after ${error.name} — waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError;
  }

  async function makeUser(tag: string) {
    const email = `e2edm-${tag}-${stamp}@example.com`;
    const data = await createUserWithRetry({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: `E2E ${tag}`, username: `e2edm${tag}${stamp}` },
    });
    await admin!.from("profiles").update({ invite_redeemed_at: new Date().toISOString() }).eq("id", data.user!.id);
    const client = createClient(SUPABASE_URL!, ANON_KEY!);
    const { data: signedIn, error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr || !signedIn.session) throw new Error(`sign-in failed for ${tag}: ${signInErr?.message}`);
    return { id: data.user!.id, email, session: signedIn.session };
  }


  /** Injects a real session into a browser context using the exact cookie
   * shape @supabase/ssr's browser client reads (see src/lib/supabase/client.ts,
   * which uses createBrowserClient with no cookie name override —
   * `sb-<project-ref>-auth-token`, mirroring @supabase/supabase-js's own
   * default storageKey derivation, base64url-encoded with the "base64-"
   * prefix @supabase/ssr writes when cookieEncoding is "base64url" (its
   * default), chunked past node_modules/@supabase/ssr's 3180-char
   * MAX_CHUNK_SIZE exactly like createChunks does. Verified empirically
   * against this exact installed @supabase/ssr version — if that package
   * ever changes its cookie format, this needs updating alongside it. */
  async function injectSession(context: BrowserContext, session: unknown) {
    const ref = new URL(SUPABASE_URL!).hostname.split(".")[0];
    const cookieName = `sb-${ref}-auth-token`;
    const encoded = "base64-" + Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");

    const MAX_CHUNK_SIZE = 3180;
    const chunks: { name: string; value: string }[] =
      encoded.length <= MAX_CHUNK_SIZE
        ? [{ name: cookieName, value: encoded }]
        : Array.from({ length: Math.ceil(encoded.length / MAX_CHUNK_SIZE) }, (_, i) => ({
            name: `${cookieName}.${i}`,
            value: encoded.slice(i * MAX_CHUNK_SIZE, (i + 1) * MAX_CHUNK_SIZE),
          }));

    await context.addCookies(
      chunks.map((c) => ({
        name: c.name,
        value: c.value,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      }))
    );
  }

  const cleanupUserIds: string[] = [];
  const cleanupThreadIds: string[] = [];

  test.afterAll(async () => {
    if (!admin) return;
    for (const id of cleanupThreadIds) await admin.from("dm_threads").delete().eq("id", id);
    for (const id of cleanupUserIds) await admin.auth.admin.deleteUser(id);
  });

  test("send and receive: a message sent by one user appears for the other without a manual reload", async ({ browser }) => {
    const alice = await makeUser("alice1");
    const bob = await makeUser("bob1");
    cleanupUserIds.push(alice.id, bob.id);
    // get_or_create_dm_thread is caller-scoped (auth.uid()) — create the
    // thread through Alice's own authenticated REST call, not the admin
    // client, which has no identity to be "the caller."
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);

    const aliceContext = await browser.newContext();
    const bobContext = await browser.newContext();
    await injectSession(aliceContext, alice.session);
    await injectSession(bobContext, bob.session);
    const alicePage = await aliceContext.newPage();
    const bobPage = await bobContext.newPage();
    await bypassOnboardingGate(alicePage);
    await bypassOnboardingGate(bobPage);

    await alicePage.goto(`/inbox/messages/${threadId}`);
    await bobPage.goto(`/inbox/messages/${threadId}`);
    await expect(alicePage.getByPlaceholder("Message…")).toBeVisible();
    await expect(bobPage.getByPlaceholder("Message…")).toBeVisible();

    const messageText = `hello from alice ${stamp}`;
    await alicePage.getByPlaceholder("Message…").fill(messageText);
    await alicePage.getByLabel("Send message").click();
    await expect(alicePage.getByText(messageText)).toBeVisible();

    // Bob's page never reloads — this only passes if realtime delivery
    // (useDMRealtime) plus the sync-cursor drain actually works end to end.
    await expect(bobPage.getByText(messageText)).toBeVisible({ timeout: 10000 });

    await aliceContext.close();
    await bobContext.close();
  });

  test("history loading: seeded older messages beyond one page load via 'Load earlier messages'", async ({ browser }) => {
    test.setTimeout(120000); // includes a deliberate 61s wait — see below.
    const alice = await makeUser("alice2");
    const bob = await makeUser("bob2");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);

    // 120 messages: > MESSAGE_PAGE_SIZE (100), so the initial load shows
    // only the newest 100 and "Load earlier messages" appears. A single
    // sender_id for all 120 in one admin batch would trip
    // enforce_dm_rate_limit's 30/minute cap and roll back the entire
    // insert (a batch insert is atomic; a real user could never actually
    // GET 120 messages into a thread this fast either, which is exactly
    // why that cap exists) — needs either more distinct senders or more
    // time. Deliberately the latter here: creating additional throwaway
    // users just to act as filler senders has intermittently tripped this
    // project's own Auth API rate limiting under this suite's cumulative
    // account-creation load, so this reuses only alice/bob (30 each, twice,
    // 61s apart — just past enforce_dm_rate_limit's own 1-minute window)
    // rather than creating any more.
    const base = Date.now();
    const firstBatch = await admin!.from("dm_messages").insert(
      Array.from({ length: 60 }, (_, i) => ({
        thread_id: threadId,
        sender_id: i % 2 === 0 ? alice.id : bob.id,
        text: `history-${i}`,
        created_at: new Date(base + i * 1000).toISOString(),
      }))
    );
    if (firstBatch.error) throw new Error(`seeding first 60 history messages failed: ${firstBatch.error.message}`);

    await new Promise((resolve) => setTimeout(resolve, 61000));

    const secondBatch = await admin!.from("dm_messages").insert(
      Array.from({ length: 60 }, (_, i) => ({
        thread_id: threadId,
        sender_id: i % 2 === 0 ? alice.id : bob.id,
        text: `history-${60 + i}`,
        created_at: new Date(base + (60 + i) * 1000).toISOString(),
      }))
    );
    if (secondBatch.error) throw new Error(`seeding second 60 history messages failed: ${secondBatch.error.message}`);

    const context = await browser.newContext();
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);

    await expect(page.getByText("history-119")).toBeVisible();
    await expect(page.getByText("history-19")).not.toBeVisible();
    await page.getByText("Load earlier messages").click();
    await expect(page.getByText("history-19")).toBeVisible();
    await expect(page.getByText("history-0")).toBeVisible();

    await context.close();
  });

  test("retry: a failed sync page surfaces 'Continue syncing' and recovers once retried", async ({ browser }) => {
    const alice = await makeUser("alice3");
    const bob = await makeUser("bob3");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);

    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: alice.id, text: "seed" });

    const context = await browser.newContext();
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);

    // Fail the FIRST post-load "after" drain call only — a real network
    // blip mid-sync — by aborting the first matching request only.
    let intercepted = false;
    await page.route("**/rest/v1/rpc/fetch_dm_messages_after", async (route) => {
      if (!intercepted) {
        intercepted = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.goto(`/inbox/messages/${threadId}`);
    await expect(page.getByText("seed")).toBeVisible();

    // A new message triggers realtime -> refresh -> the intercepted,
    // failing drain call -> syncIncomplete.
    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: bob.id, text: "arrives during the blip" });
    await expect(page.getByText(/Continue syncing/)).toBeVisible({ timeout: 10000 });

    await page.getByText(/Continue syncing/).click();
    await expect(page.getByText("arrives during the blip")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Continue syncing/)).not.toBeVisible();

    await context.close();
  });

  test("navigation during pending work: switching threads mid-send never leaves the new thread's composer stuck disabled", async ({ browser }) => {
    const alice = await makeUser("alice4");
    const bob = await makeUser("bob4");
    const carol = await makeUser("carol4");
    cleanupUserIds.push(alice.id, bob.id, carol.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadAB, error: threadABErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadABErr) throw threadABErr;
    const { data: threadAC, error: threadACErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: carol.id });
    if (threadACErr) throw threadACErr;
    cleanupThreadIds.push(threadAB, threadAC);

    const context = await browser.newContext();
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);

    // Delay the send request itself so navigation genuinely happens while
    // it's still in flight.
    await page.route("**/api/dm/messages", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.goto(`/inbox/messages/${threadAB}`);
    await expect(page.getByPlaceholder("Message…")).toBeVisible();
    await page.getByPlaceholder("Message…").fill("sent right before navigating away");
    await page.getByLabel("Send message").click();

    // Navigate to a DIFFERENT thread while that send is still pending.
    await page.goto(`/inbox/messages/${threadAC}`);
    await expect(page.getByPlaceholder("Message…")).toBeVisible();

    // The delayed send resolves in the background at some point after
    // this — the new thread's composer must not be stuck disabled once it
    // does.
    await page.waitForTimeout(2000);
    await page.getByPlaceholder("Message…").fill("a message on the new thread");
    await expect(page.getByLabel("Send message")).toBeEnabled();

    await context.close();
  });

  test("blocked-history: existing history stays readable, sends fail both ways, unblocking restores messaging", async ({ browser }) => {
    const alice = await makeUser("alice5");
    const bob = await makeUser("bob5");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);
    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: alice.id, text: "before the block" });

    const context = await browser.newContext();
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);
    await expect(page.getByText("before the block")).toBeVisible();

    // Alice blocks Bob.
    await aliceRest.from("blocks").insert({ blocker_id: alice.id, blocked_id: bob.id });

    await page.reload();
    await expect(page.getByText("before the block")).toBeVisible();
    await expect(page.getByText("You can't send messages in this conversation.")).toBeVisible();
    await expect(page.getByPlaceholder("Message…")).not.toBeVisible();

    // A direct insert attempt from either side is rejected at the RLS
    // boundary regardless of what the UI shows.
    const { error: aliceSendErr } = await aliceRest.from("dm_messages").insert({ thread_id: threadId, sender_id: alice.id, text: "should fail" });
    expect(aliceSendErr).toBeTruthy();
    const bobRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bob.session.access_token}` } },
    });
    const { error: bobSendErr } = await bobRest.from("dm_messages").insert({ thread_id: threadId, sender_id: bob.id, text: "should also fail" });
    expect(bobSendErr).toBeTruthy();

    // Unblock — messaging is restored.
    await aliceRest.from("blocks").delete().eq("blocker_id", alice.id).eq("blocked_id", bob.id);
    await page.reload();
    await expect(page.getByPlaceholder("Message…")).toBeVisible();
    await page.getByPlaceholder("Message…").fill("unblocked, works again");
    await page.getByLabel("Send message").click();
    await expect(page.getByText("unblocked, works again")).toBeVisible();

    await context.close();
  });
});
