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

    const aliceContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const bobContext = await browser.newContext({ viewport: { width: 844, height: 390 } });
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

    for (const page of [alicePage, bobPage]) {
      await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toHaveCount(0);
      const composer = await page.locator("form").boundingBox();
      expect(composer!.y + composer!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    }

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

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);

    await expect(page.getByText("history-119")).toBeVisible();
    await expect(page.getByText("history-19")).not.toBeVisible();
    await page.getByText("Load earlier messages").click();
    await expect(page.getByText("history-19")).toBeVisible();
    await expect(page.getByText("history-0")).toBeVisible();

    await expect(page.getByLabel("Back")).toBeVisible();
    const composer = await page.locator("form").boundingBox();
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(845);
    const scroller = page.locator(".overflow-y-auto");
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(845);

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

  // --- Reactions and replies (20260917060000_dm_replies_reactions.sql /
  // useDMReactions / DMMessageBubble) ---------------------------------
  //
  // scripts/verify-dm-reactions-replies.mjs already covers the database
  // side of this (RLS, constraints, set_dm_reaction's rate limiting) with
  // no browser involved, and DMMessageBubble.test.tsx covers the
  // component's own logic against a synthetic jsdom tree with mocked
  // network calls and mocked (jsdom fireEvent) touch events. Neither
  // establishes that a real browser, talking to the real API/RPCs, with a
  // real live realtime subscription across two independent authenticated
  // sessions, actually behaves correctly end to end — that's what this
  // block is for.

  test("reactions: add, change, and remove sync live to the other participant with no reload; selecting the same emoji again removes it", async ({ browser }) => {
    const alice = await makeUser("alice6");
    const bob = await makeUser("bob6");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);
    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: alice.id, text: "react to me" });

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
    await expect(alicePage.getByText("react to me")).toBeVisible();
    await expect(bobPage.getByText("react to me")).toBeVisible();

    const reactGroup = bobPage.getByRole("group", { name: "React to message" });

    // Bob adds a reaction.
    await bobPage.getByLabel("Message actions").click();
    await reactGroup.getByLabel("Love", { exact: true }).click();
    await expect(bobPage.getByLabel("Love, 1, including you")).toBeVisible();
    // Alice's page is never reloaded — this only passes if the realtime
    // subscription plus the independent HTTP refresh actually round-trip.
    await expect(alicePage.getByLabel("Love, 1")).toBeVisible({ timeout: 10000 });

    // Bob changes it to a different emoji — the old chip is replaced, not added alongside.
    await bobPage.getByLabel("Message actions").click();
    await reactGroup.getByLabel("Like", { exact: true }).click();
    await expect(bobPage.getByLabel("Like, 1, including you")).toBeVisible();
    await expect(bobPage.getByLabel("Love, 1", { exact: true })).toHaveCount(0);
    await expect(alicePage.getByLabel("Like, 1")).toBeVisible({ timeout: 10000 });
    await expect(alicePage.getByLabel("Love, 1")).toHaveCount(0);

    // Selecting the SAME emoji again removes it entirely.
    await bobPage.getByLabel("Message actions").click();
    await reactGroup.getByLabel("Like", { exact: true }).click();
    await expect(bobPage.getByLabel(/^Like, \d/)).toHaveCount(0);
    await expect(alicePage.getByLabel(/^Like, \d/)).toHaveCount(0, { timeout: 10000 });

    await aliceContext.close();
    await bobContext.close();
  });

  test("reactions and quoted replies survive new messages and loading older history, including a reply whose parent lives on an unloaded page", async ({ browser }) => {
    test.setTimeout(150000); // includes the same deliberate 61s wait as the history-loading test above.
    const alice = await makeUser("alice10");
    const bob = await makeUser("bob10");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);

    // Deliberately disjoint literal strings (no one substring of another) —
    // Playwright's getByText does substring matching by default, and
    // "quoting X" would otherwise also match a getByText("X") search,
    // making several of the assertions below ambiguous.
    const ROOT_TEXT = "root-message-oldest";
    const REPLY_TEXT = "reply-quoting-root";
    const { data: root, error: rootErr } = await admin!
      .from("dm_messages")
      .insert({ thread_id: threadId, sender_id: alice.id, text: ROOT_TEXT })
      .select("id")
      .single();
    if (rootErr) throw new Error(`seeding root message failed: ${rootErr.message}`);

    // 100 filler messages, same rate-limit-aware shape as the plain
    // history-loading test above: two batches of 50 (25/25 per sender,
    // under enforce_dm_rate_limit's 30/minute cap), 61s apart. Total after
    // this is 101 messages — MESSAGE_PAGE_SIZE (100) guarantees `root`
    // itself falls off the initial page.
    const base = Date.now();
    const firstBatch = await admin!.from("dm_messages").insert(
      Array.from({ length: 50 }, (_, i) => ({
        thread_id: threadId,
        sender_id: i % 2 === 0 ? alice.id : bob.id,
        text: `filler-${i}`,
        created_at: new Date(base + (i + 1) * 1000).toISOString(),
      }))
    );
    if (firstBatch.error) throw new Error(`seeding first 50 filler messages failed: ${firstBatch.error.message}`);

    await new Promise((resolve) => setTimeout(resolve, 61000));

    const secondBatch = await admin!.from("dm_messages").insert(
      Array.from({ length: 50 }, (_, i) => ({
        thread_id: threadId,
        sender_id: i % 2 === 0 ? alice.id : bob.id,
        text: `filler-${50 + i}`,
        created_at: new Date(base + (51 + i) * 1000).toISOString(),
      }))
    );
    if (secondBatch.error) throw new Error(`seeding second 50 filler messages failed: ${secondBatch.error.message}`);

    // The newest message quotes the very first one — its parent will not
    // be part of the initially-loaded page.
    const { data: reply, error: replyErr } = await admin!
      .from("dm_messages")
      .insert({
        thread_id: threadId,
        sender_id: bob.id,
        text: REPLY_TEXT,
        reply_to_id: root.id,
        created_at: new Date(base + 200 * 1000).toISOString(),
      })
      .select("id")
      .single();
    if (replyErr) throw new Error(`seeding reply message failed: ${replyErr.message}`);

    // Pre-seed reactions on both the root (unloaded-page) message and the
    // newest (loaded-page) message before the page ever loads.
    const { error: rootReactErr } = await aliceRest.rpc("set_dm_reaction", { p_message_id: root.id, p_emoji: "🙏" });
    if (rootReactErr) throw rootReactErr;
    const { error: replyReactErr } = await aliceRest.rpc("set_dm_reaction", { p_message_id: reply.id, p_emoji: "😮" });
    if (replyReactErr) throw replyReactErr;

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);

    await expect(page.getByText(REPLY_TEXT)).toBeVisible();
    // The quoted preview on the loaded reply already names the real
    // parent's text, even though root itself isn't part of the loaded
    // page yet — fetchMessages' withReplies() resolves parents
    // independently of pagination. Exactly one match for ROOT_TEXT proves
    // both things at once: it's the blockquote's quoted text (correct,
    // not a "Message unavailable" fallback, which would be zero matches),
    // and root's own separate bubble isn't loaded yet (which would make
    // it two).
    await expect(page.getByText(ROOT_TEXT)).toHaveCount(1);

    // Reload — proves this is genuinely refetched and correct, not just
    // carried over in client state from the page that authored it.
    await page.reload();
    await expect(page.getByText(REPLY_TEXT)).toBeVisible();
    await expect(page.getByText(ROOT_TEXT)).toHaveCount(1);
    await expect(page.getByLabel("Surprised, 1")).toBeVisible(); // reaction loaded over HTTP, no realtime event needed

    // A new message arrives — the reply's reaction must survive it.
    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: bob.id, text: "arrives-after-everything-else" });
    await expect(page.getByText("arrives-after-everything-else")).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("Surprised, 1")).toBeVisible();

    // Loading older history reveals the root message itself (now a second,
    // separate match for ROOT_TEXT) and its own reaction, fetched
    // incrementally, without disturbing the reply's reaction above.
    await page.getByText("Load earlier messages").click();
    await expect(page.getByText(ROOT_TEXT)).toHaveCount(2);
    await expect(page.getByLabel("Thanks, 1")).toBeVisible();
    await expect(page.getByLabel("Surprised, 1")).toBeVisible();

    await context.close();
  });

  test("reply via the message-actions menu and via a real touch swipe gesture, both quoting the correct original message", async ({ browser }) => {
    const alice = await makeUser("alice11");
    const bob = await makeUser("bob11");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);
    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: alice.id, text: "original message to quote" });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await injectSession(context, bob.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);
    await expect(page.getByText("original message to quote")).toBeVisible();

    // --- Reply via the message-actions menu ---
    await page.getByLabel("Message actions").click();
    await page.getByRole("button", { name: "Reply" }).click();
    await expect(page.getByRole("status")).toContainText("Replying to");
    await page.getByPlaceholder("Message…").fill("replying via the menu");
    await page.getByLabel("Send message").click();
    await expect(page.getByText("replying via the menu")).toBeVisible();
    const menuReplyBubble = page.locator("div").filter({ hasText: "replying via the menu" }).filter({ hasText: "original message to quote" }).last();
    await expect(menuReplyBubble).toBeVisible();

    // --- Reply via a genuine touch swipe ---
    // CDP-dispatched touch events go through Chromium's real touch input
    // pipeline — the same code path an actual touchscreen digitizer
    // drives, including real touch-action/gesture handling — NOT a
    // synthetic React TouchEvent the way DMMessageBubble.test.tsx's jsdom
    // fireEvent.touchStart/touchEnd is, and a step further than
    // page.dispatchEvent (which also just constructs a plain synthetic
    // Event object rather than driving the browser's own input pipeline).
    // Short of an actual physical device, this is as real as an automated
    // browser gets.
    const originalBubble = page.locator(".touch-pan-y", { hasText: "original message to quote" }).first();
    const box = await originalBubble.boundingBox();
    if (!box) throw new Error("original message bubble not found");
    const cdp = await context.newCDPSession(page);
    const startX = box.x + 10;
    const startY = box.y + box.height / 2;
    const endX = box.x + 100;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY }] });
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: startX + ((endX - startX) * i) / steps, y: startY }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(page.getByRole("status")).toContainText("Replying to");
    await page.getByPlaceholder("Message…").fill("replying via swipe");
    await page.getByLabel("Send message").click();
    await expect(page.getByText("replying via swipe")).toBeVisible();
    const swipeReplyBubble = page.locator("div").filter({ hasText: "replying via swipe" }).filter({ hasText: "original message to quote" }).last();
    await expect(swipeReplyBubble).toBeVisible();

    await context.close();
  });

  test("blocked: neither participant can react or reply, but existing reactions and message history stay readable", async ({ browser }) => {
    const alice = await makeUser("alice12");
    const bob = await makeUser("bob12");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);
    const { data: msg, error: msgErr } = await admin!
      .from("dm_messages")
      .insert({ thread_id: threadId, sender_id: alice.id, text: "before block" })
      .select("id")
      .single();
    if (msgErr) throw new Error(`seeding message failed: ${msgErr.message}`);
    const { error: reactErr } = await aliceRest.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "❤️" });
    if (reactErr) throw reactErr;

    const context = await browser.newContext();
    await injectSession(context, alice.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);
    await expect(page.getByText("before block")).toBeVisible();
    await expect(page.getByLabel("Love, 1, including you")).toBeVisible();

    await aliceRest.from("blocks").insert({ blocker_id: alice.id, blocked_id: bob.id });
    await page.reload();

    // Existing history and its reaction stay visible and readable...
    await expect(page.getByText("before block")).toBeVisible();
    await expect(page.getByLabel("Love, 1")).toBeVisible();
    // ...but there is no way left to react or reply: the actions menu
    // itself is gone (DMMessageBubble hides it whenever `disabled`).
    await expect(page.getByLabel("Message actions")).not.toBeVisible();
    await expect(page.getByText("You can't send messages in this conversation.")).toBeVisible();
    await expect(page.getByPlaceholder("Message…")).not.toBeVisible();

    // The DB boundary rejects both a reaction and a reply attempt from the
    // blocked side regardless of what the UI shows.
    const bobRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bob.session.access_token}` } },
    });
    const { error: bobReactErr } = await bobRest.rpc("set_dm_reaction", { p_message_id: msg.id, p_emoji: "👍" });
    expect(bobReactErr).toBeTruthy();
    const { error: bobReplyErr } = await bobRest
      .from("dm_messages")
      .insert({ thread_id: threadId, sender_id: bob.id, text: "blocked reply attempt", reply_to_id: msg.id });
    expect(bobReplyErr).toBeTruthy();

    await context.close();
  });

  test("keyboard: React and Reply actions in the message-actions menu are both operable without a mouse", async ({ browser }) => {
    const alice = await makeUser("alice13");
    const bob = await makeUser("bob13");
    cleanupUserIds.push(alice.id, bob.id);
    const aliceRest = createClient(SUPABASE_URL!, ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${alice.session.access_token}` } },
    });
    const { data: threadId, error: threadErr } = await aliceRest.rpc("get_or_create_dm_thread", { other_user_id: bob.id });
    if (threadErr) throw threadErr;
    cleanupThreadIds.push(threadId);
    await admin!.from("dm_messages").insert({ thread_id: threadId, sender_id: alice.id, text: "keyboard target" });

    const context = await browser.newContext();
    await injectSession(context, bob.session);
    const page = await context.newPage();
    await bypassOnboardingGate(page);
    await page.goto(`/inbox/messages/${threadId}`);
    await expect(page.getByText("keyboard target")).toBeVisible();

    await page.getByLabel("Message actions").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Message actions" })).toBeVisible();
    // Opening the menu moves focus straight to Reply (DMMessageBubble's own
    // focus-management effect) — confirm it landed somewhere keyboard-reachable.
    await expect(page.getByRole("button", { name: "Reply" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("group", { name: "Message actions" })).toHaveCount(0);
    await expect(page.getByLabel("Message actions")).toBeFocused();

    // Reopen and drive a reaction purely via Tab + Enter — Reply is
    // focused first, so one Tab reaches the first reaction button.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "Message actions" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Love", { exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Love, 1, including you")).toBeVisible();

    await context.close();
  });
});
