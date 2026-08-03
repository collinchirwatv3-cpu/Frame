# FRAME — Prototype-to-Production Migration Plan

Written from the position of: we expect **1M monthly active users within three
years**, and today FRAME is a fully-designed, fully-tested Next.js frontend
running against in-memory mock data with zero live backend, zero database,
zero CI/CD, and zero observability. That gap is normal for where the product
is — this document is the audit and the plan to close it, not a criticism of
the work so far. It supersedes [roadmap.md](roadmap.md) (which covers the
narrower "how do we get *a* live site up" checklist) and extends
[BETA_READINESS.md](BETA_READINESS.md) (product/UX readiness) with the
engineering/infrastructure lens.

Work is split into three tiers:

- **Critical** — must exist before any alpha (real accounts, real video,
  anyone outside the team using it). Getting this wrong risks data loss,
  security incidents, or legal exposure.
- **Important** — must exist before a public beta (unknown users, real
  scale starting to matter, reputational risk if it breaks).
- **Future** — needed on the path to 1M MAU, but doesn't block beta.

Each domain below states what's true today, what's already been built in
this pass (with file paths), what's left, and which tier it falls in.

---

## Executive summary — the checklist

**Critical (before alpha)**
- [x] Security headers + CSP with per-request nonce (`src/proxy.ts`, `src/lib/security-headers.ts`)
- [x] Postgres schema + RLS migration (`supabase/migrations/20260101000000_init.sql`)
- [x] Input validation pattern established (Zod — `src/lib/validation/upload.ts`)
- [x] Rate-limiting scaffold, activates the moment real endpoints exist (`src/lib/rate-limit.ts`)
- [x] CI gate on every PR (`.github/workflows/ci.yml`)
- [x] Error tracking scaffold (`src/instrumentation.ts`, `src/instrumentation-client.ts`)
- [x] `/api/health` endpoint for uptime checks
- [ ] **Commit this repository to git and push to a real remote.** One commit
      exists today (the `create-next-app` scaffold) — every feature built is
      uncommitted working-tree state. This is the single highest-risk item in
      this entire document and is a decision for you, not something to do
      silently (see [Technical debt](#technical-debt--repo-hygiene)).
- [ ] Provision real Supabase + Cloudflare Stream/R2 accounts, run the migration for real
- [ ] Real auth wired end-to-end (code already calls real Supabase methods — needs real keys)
- [ ] Replace `localStorage`-backed engagement/comments/share-link state with real DB reads/writes scoped to `auth.uid()`
- [ ] Moderation: reports persist to the `reports` table (schema exists); a human reviews them somewhere (even a shared spreadsheet is fine at alpha scale — the requirement is "not silently discarded," not "full trust & safety tooling")
- [ ] Backups: enable Supabase point-in-time recovery (PITR) the day the project is created
- [ ] Terms of Service / Privacy Policy / DMCA process (legal, not engineering — see [roadmap.md Milestone 4](roadmap.md#milestone-4--legal-basics))

**Important (before public beta)**
- [x] Feed virtualization — bounded DOM/video-element count at real catalog scale (`src/components/feed/SwipeFeed.tsx`, `VideoPlaceholder.tsx`)
- [x] E2E test suite covering golden paths (`e2e/*.spec.ts`)
- [ ] Cost model validated against real Stream/R2/Supabase/Vercel usage once real traffic exists
- [ ] CSAM-scanning vendor integrated on upload (legal requirement for UGC video, not optional — see [Moderation](#moderation))
- [ ] Structured logging + dashboards (Sentry alone is error-only, not general observability)
- [ ] Load test the feed query and upload path at 10x expected alpha traffic
- [ ] Disaster-recovery runbook written and drilled once (not just documented — actually restore a backup once, in staging)
- [ ] Staging environment mirroring production (separate Supabase project + Vercel preview env)

**Future (post-launch, on the way to 1M MAU)**
- [ ] Read replicas / connection pooling (PgBouncer, Supabase's built-in pooler) once single-primary Postgres becomes the bottleneck
- [ ] CDN cache tuning for Explore/profile pages (currently dynamic; most traffic is read-heavy and cacheable)
- [ ] Multi-region Stream/R2 placement once creator/viewer geography data exists to justify it
- [ ] Formal on-call rotation + paging (PagerDuty/Opsgenie) once team > 1 engineer
- [ ] `watch_progress` table's write volume (every few seconds per active viewer) will need write-batching or a faster store (Redis) well before 1M MAU — Postgres row-per-heartbeat doesn't scale to that write rate

---

## Architecture

**Today**: Next.js 16 App Router on Vercel (implied, not yet connected),
Supabase for future Postgres+auth, Cloudflare Stream+R2 for future video.
No backend code exists yet beyond the new `/api/health` route — every
"data layer" is `src/lib/mock-data.ts` plus `localStorage`-persisted Zustand
stores. This is the correct shape for a frontend-first MVP build; the
question for production is whether that shape survives contact with real
traffic.

**What survives unchanged**: the read path. Videos, creators, and feed
composition are natural fits for Supabase's Postgres + RLS, fronted by
Vercel's edge network. The `videos_visibility_created_at_idx` composite
index in the new migration is specifically shaped for the feed's hot-path
query (`WHERE visibility = 'public' ORDER BY created_at DESC`).

**What needs real design work before alpha**: the upload pipeline. Today
`UploadDropzone.tsx`'s `publish()` is a 1.4s `setTimeout` fake. The real
version (documented in README's ["What's stubbed, not
built"](README.md#whats-stubbed-not-built) and [roadmap.md Milestone
1](roadmap.md#milestone-1--real-backend)) is: a Route Handler mints a
Cloudflare Stream direct-upload URL → client PUTs the file straight to
Cloudflare (bypassing our server entirely, which matters at scale — we never
proxy video bytes) → a webhook flips the video to `ready` and applies any
Rotate/Crop decision. That webhook needs to exist as a real, signature-verified
Route Handler before any real creator can publish — it's the one piece of
"replace mock data with a real query" that's actually new systems design,
not a swap.

**Recommendation, not yet built**: a `video_processing_status` enum on the
`videos` row (`uploading`, `processing`, `ready`, `failed`) so the client can
show real state instead of assuming success — currently `publish()` always
"succeeds." Tier: **Critical**, blocks real uploads from being trustworthy.

---

## Security

**Built this pass:**
- Full security header set in `next.config.ts`: `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy` (camera/mic/geolocation/FLoC all denied), HSTS with
  `preload`.
- Content-Security-Policy with a genuine per-request nonce
  (`src/proxy.ts` generates it, `src/lib/security-headers.ts` builds the
  policy, `src/lib/supabase/middleware.ts` threads it through every
  `NextResponse.next()` reconstruction so Next's own injected scripts get
  nonced too). Verified via `curl -I` showing the nonce landing correctly on
  Next's own `link: rel=preload` headers, and via a real browser CSP
  violation report catching a genuine bug — `fastly.picsum.photos` (the
  actual host mock images load from) wasn't in the original `img-src`
  allowlist even though `picsum.photos` was.
- `script-src` includes `'unsafe-eval'` **only** in development
  (`process.env.NODE_ENV !== "production"`), because React's dev-mode
  debugging genuinely requires `eval()` — confirmed by a real dev-server
  console error before the fix, and a clean Playwright run after it.
  Production's `script-src` never gets `'unsafe-eval'`.
- RLS enabled on every table in the new migration, not just the obvious
  ones — including `saves` (fully private; nobody should be able to query
  what videos another user has saved) and `reports` (select/update
  restricted to `is_moderator = true` via an `EXISTS` subquery against
  `profiles`).
- Rate-limiting scaffold (`src/lib/rate-limit.ts`, Upstash-backed) with
  pre-defined limiters for auth (5/min), upload (10/hour), and general
  engagement actions (60/min) — no-ops safely with no env vars set, so it's
  safe to leave wired even before the Upstash account exists.
- Zod validation pattern established (`src/lib/validation/upload.ts`) —
  the model every future Route Handler taking user input should follow;
  TypeScript types alone don't survive to runtime and don't stop a malicious
  payload.

**Known, accepted gap**: `style-src` allows `'unsafe-inline'`. The app uses
inline `style` props pervasively (dynamic aspect-ratio boxes, Framer Motion
transforms). A nonce-based `style-src` needs a broader refactor away from
inline styles first — documented inline in `security-headers.ts` as a
deliberate tradeoff, not an oversight. Tier: **Important** — script-src (the
directive that actually stops XSS payloads from executing) is locked down;
style-src is the lower-severity gap.

**Not yet done, Critical before alpha:**
- Every Route Handler that will exist (upload URL minting, webhook receiver,
  comment/like/follow writes if they move server-side instead of direct
  Supabase client calls) needs the rate-limiter actually called, not just
  available. Today nothing calls `checkRateLimit` — confirmed via grep,
  zero call sites outside `rate-limit.ts` itself.
- Webhook signature verification for the Cloudflare Stream upload-complete
  webhook (HMAC verification against Cloudflare's signing secret) — an
  unverified webhook is a way for anyone to mark arbitrary videos "ready."
- Secrets management: `.env.local.example` documents every var needed but
  actual production secrets need to live in Vercel's environment variable
  store (or a dedicated secrets manager once the team grows), never in git.
- Dependency audit is currently advisory-only in CI (`npm audit --audit-level=high || true`)
  — fine at this stage, but revisit once Dependabot/Renovate auto-PRs exist
  so "advisory" can become "blocking" without manual triage overhead.

---

## Scalability

**Built this pass:** feed virtualization (`src/components/feed/SwipeFeed.tsx`
+ new `VideoPlaceholder.tsx`). Previously every video in the feed array
rendered as a full `VideoCard` — real `<video>` element, Framer Motion
instances, comment/options/details sheets — regardless of scroll position.
Fine at 5 mock videos, a genuine memory/performance problem at real catalog
scale (thousands of videos in a session). Now only `activeIndex ± 2` render
as full `VideoCard`s; everything else renders as a lightweight
`VideoPlaceholder` (blurred poster backdrop, no `<video>`, no motion
instances). Verified via Playwright: mounted `<video>` count stays bounded
(3–5, matching the ±2 window) while scrolling through the full feed in both
directions, with the same scroll-snap continuity preserved (`h-dvh`,
`data-index`, ref wiring all unchanged).

**Database, not yet load-tested:** the schema's indexes are designed for the
known hot paths — `videos_visibility_created_at_idx` for the main feed
query, `videos_creator_id_idx` for profile grids, `comments_video_id_created_at_idx`
for comment threads — but no index is proven correct until it's run against
real query plans (`EXPLAIN ANALYZE`) with real data volume. Tier:
**Important**, do this once Milestone 1's real backend exists and before
beta traffic arrives.

**Counter design**: `likes_count`/`comments_count`/`saves_count`/
`shares_count`/`followers_count`/`following_count`/`total_views` are all
denormalized integer columns maintained by `AFTER INSERT/DELETE` triggers
(`adjust_video_counter()` in the migration), not `COUNT(*)` at read time.
This is the right call at 1M MAU scale — a feed query that does five
`COUNT(*)` subqueries per row does not survive real traffic. The tradeoff:
counters can drift from ground truth if a trigger ever fails silently or a
row is deleted outside the ORM path (e.g., a manual `DELETE` in the Supabase
dashboard bypassing the trigger — it won't, triggers fire on any `DELETE`
regardless of origin, but a raw `TRUNCATE` would skip them). Recommendation:
a periodic reconciliation job (nightly cron comparing counter columns
against real counts, alerting on drift) before beta, not before alpha.

**`watch_progress` write volume** (flagged in the executive summary as a
Future item): resuming playback cross-device means writing a row roughly
every few seconds per actively-watching user. At 1M MAU with even modest
concurrent viewership, that's a write-heavy pattern Postgres row-per-heartbeat
won't absorb gracefully. Recommendation: batch writes client-side (write on
pause/unmount/interval, not every timeupdate event) as a first mitigation;
if that's insufficient at real scale, move the hot write path to Redis with
periodic flush-to-Postgres. Not needed before beta — flagging now so the
`watch_progress` table isn't designed as row-per-second from day one.

**Feed pagination**: today's mock feed is 5 videos, unpaginated by
necessity. The real feed query needs cursor-based pagination (keyset on
`created_at`, not `OFFSET`) the moment real content volume exists — `OFFSET`
pagination degrades linearly with offset depth and is a well-known trap at
scale. Tier: **Critical**, this is part of Milestone 2's "swap mock data for
real queries" work, not a later optimization.

---

## Observability

**Built this pass:**
- `@sentry/nextjs` wired for all three runtimes: `src/instrumentation.ts`
  (`register()` checks `NEXT_RUNTIME` for `nodejs`/`edge` and initializes
  accordingly, plus `onRequestError` for server-side error capture),
  `src/instrumentation-client.ts` (browser init, `10%` trace sample rate,
  `10%` error-replay sample rate, `0%` session-replay sample rate to control
  cost by default), `next.config.ts` wrapped with `withSentryConfig`.
  Degrades safely to a no-op with no `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`
  set — confirmed via a clean production build with zero Sentry warnings.
- `/api/health` (`src/app/api/health/route.ts`) — returns `200` with
  `{ status: "ok" | "degraded", timestamp, missingConfig? }`, `force-dynamic`
  so it's never cached. Wire this into whatever uptime monitor gets chosen
  (Vercel's built-in, UptimeRobot, Better Stack — any of them can poll this).

**Not yet done:**
- Structured application logging. Sentry captures *errors*, not general
  request/decision logs (e.g., "rate limit triggered for user X," "webhook
  received with invalid signature"). At minimum, log these security-relevant
  events somewhere queryable — Vercel's log drains to a real log aggregator
  (Axiom, Better Stack, Datadog) once volume justifies the cost. Tier:
  **Important** — not needed for a small alpha, genuinely needed before
  opening to unknown beta users, since without it a security incident is
  undiagnosable after the fact.
- Product analytics (Vercel Analytics or Plausible, per
  [roadmap.md Milestone 6](roadmap.md#milestone-6--launch)) — not
  observability in the incident-response sense, but "is anyone actually
  using this" is a real launch-blocking question. Tier: **Important**.
- Alerting rules. Sentry and uptime checks are useless if nobody gets paged.
  Tier: **Important** before beta; **Future** formal on-call rotation once
  the team is more than one person.

---

## Moderation

This is the domain with the largest gap between "built" and "legally
required," and it's worth being direct about that rather than treating it
as a nice-to-have.

**Today**: `VideoOptionsSheet.tsx`'s "Report video" action
(`handleReport()`) sets a client-side toast ("Reported — thanks for helping
keep FRAME safe") and does nothing else. No report is persisted anywhere. No
human ever sees it.

**Built this pass**: the `reports` table now exists in the migration
(`reporter_id`, `video_id`, `reason` enum, `status` enum, `created_at`), with
RLS restricting `SELECT`/`UPDATE` to rows where the requesting user's
`profiles.is_moderator = true`. This is schema-only — no Route Handler writes
to it yet, because that requires the real upload/comment pipeline to exist
first (a report needs a real video row to point at).

**Critical before alpha** (not optional, this is where legal exposure is
real for any UGC video platform):
- Wire `handleReport()` to actually insert a `reports` row via a Route
  Handler (server-side, not a direct client insert, so the report can't be
  spoofed or tampered with in transit).
- **CSAM detection on upload.** This is a legal requirement in most
  jurisdictions (the US requires NCMEC CyberTip reporting; the EU has its
  own equivalents), not a trust & safety nice-to-have. The standard approach
  at this scale is a vendor-provided perceptual-hash match against known
  material (e.g., Cloudflare itself offers CSAM scanning as part of Stream in
  some plans; Thorn's Safer, or Microsoft's PhotoDNA-for-video, are the other
  common integrations) run on every upload before it's marked `ready`. This
  needs a legal consultation alongside the vendor integration — flagging it
  here as a blocking requirement, not something to silently skip.
- A moderation review surface for reports. At alpha scale this can genuinely
  be a Supabase Table Editor view filtered to `status = 'pending'`, or even a
  shared spreadsheet a human checks daily — the requirement is "reports are
  seen by a person," not "we built a moderation dashboard." A real
  dashboard is an **Important** (pre-beta) item once report volume exceeds
  what's comfortable to triage by hand.

**Important before beta:**
- A visible content policy / DMCA takedown process
  ([roadmap.md Milestone 4](roadmap.md#milestone-4--legal-basics)) — legal
  text, not code, but the `/dmca` route needs to exist and be linked from
  upload/signup once the text exists.
- Rate-limit the report action itself (already have `engagementRateLimiter`
  scaffolded at 60/min — apply it here) so reporting can't itself become a
  harassment/spam vector against a specific creator.

---

## Cost optimization

No real traffic exists yet, so this is a stated-assumptions model, not a
measured one — treat it as a planning baseline to revisit the moment real
usage data exists (**Important**, before beta, once there's real Stream/R2
minutes to measure against).

| Component | Assumption at ~10K MAU (early beta) | Assumption at ~1M MAU |
|---|---|---|
| Vercel | Pro plan (~$20/mo/seat) covers it | Enterprise likely needed for support SLAs + higher function concurrency limits |
| Supabase | Pro plan (~$25/mo) covers DB + auth | Compute add-ons scale with connection count; read replicas become relevant (see [Scalability](#scalability)) |
| Cloudflare Stream | ~$1–2K/mo range depending on average watch time and upload volume (pricing is $5/1000 min stored + $1/1000 min delivered) | This becomes the dominant cost line by far — video delivery cost scales roughly linearly with (MAU × average session watch minutes), not with MAU alone. **The single most important cost lever is average watch time per session**, which is also the product's core success metric — cost and product health move together here, which is a good sign but means cost can spike with product success and needs headroom budgeted, not treated as a fixed line item. |
| Cloudflare R2 | Negligible (poster images, egress free) | Still comparatively negligible next to Stream |
| Upstash Redis (rate limiting) | Free tier likely sufficient | Pay-as-you-go, small relative to Stream cost |
| Sentry | Free/Team tier | Scales with error+trace volume; tune `tracesSampleRate` down before this becomes a real line item |

**Recommendation**: instrument real Stream usage from day one of alpha (even
at tiny volume) specifically so the 1M MAU cost model is a real extrapolation
by the time beta planning happens, not a guess made twice in a row.

---

## CI/CD

**Built this pass** (`.github/workflows/ci.yml`):
- Triggers on every PR and push to `main`, with a `concurrency` group that
  cancels superseded runs (don't waste CI minutes on a commit nobody will
  merge).
- `lint-typecheck-test` job: `npm run lint`, `npx tsc --noEmit`, `npm test`
  (79 unit tests), `npm run build` — with placeholder Supabase env vars so
  the build succeeds without real secrets ever touching CI.
- `e2e` job (depends on the above passing first): installs Playwright's
  Chromium browser, runs the new `e2e/*.spec.ts` suite against a real `next
  dev` server (see [Testing](#testing)), uploads the HTML report as an
  artifact on failure only.
- `audit` job: `npm audit --audit-level=high`, advisory-only for now (see
  [Security](#security) for why).

**Not yet done, Important before beta:**
- Actual deploy step. This workflow blocks a bad merge; it doesn't deploy
  anything. Recommendation, not yet executed (needs your GitHub + Vercel
  accounts connected): Vercel's native GitHub integration handles this
  automatically once the repo has a remote — every PR gets a preview
  deployment, every merge to `main` deploys to production, with zero custom
  deploy-step code needed. This is genuinely simpler than a custom
  `vercel deploy` CI step and is Vercel's intended workflow for a Next.js app
  already living in their platform. Connection steps (once you have a GitHub
  remote): Vercel dashboard → Add New Project → import the repo → set
  production env vars from `.env.local.example` → done. No code changes
  required on our side.
- Preview-environment env vars (a separate, non-production Supabase project
  for PR previews so preview deploys never touch production data).
- Migration-runner step: once `supabase/migrations/*.sql` files are the
  source of truth, CI (or a deploy hook) should run `supabase db push` (or
  equivalent) against the target environment automatically, rather than
  migrations being applied by hand.

---

## Testing

**Built this pass:**
- `@playwright/test` installed, `playwright.config.ts` added (Chromium
  project, `next dev` as the `webServer` — production-build correctness is
  already covered by the CI build step, so E2E doesn't need the slower
  build+start cycle).
- Three committed E2E specs (`e2e/*.spec.ts`) covering the golden paths:
  `onboarding-to-feed.spec.ts` (first-time visitor → intro → interest picker
  → skip → lands on feed → reload doesn't re-trigger onboarding),
  `feed-engagement.spec.ts` (like toggles `aria-pressed` and the
  `Like`/`Unlike` label and survives a reload, since engagement state lives
  in a persisted Zustand store, not just component state; following a
  creator hides that creator's Follow button specifically — not just "a"
  Follow button, since multiple creators' buttons can be mounted
  simultaneously within the render window), and `upload.spec.ts` (dropzone
  renders the landscape-only copy and a real `<input type="file">` exists —
  functional file-drop testing is out of scope without a real video fixture,
  see below).
- All 4 E2E tests pass against a real running dev server; all 79 pre-existing
  unit tests continue to pass (`vitest.config.mts` updated to exclude
  `e2e/**` after discovering Vitest was trying to execute the Playwright
  spec files directly — a real, caught-by-running-it bug, not a hypothetical
  one).

**Real bugs this pass's testing caught** (worth stating plainly — this is
what the verification rigor is for):
1. The CSP blocked `eval()`, breaking React dev-mode entirely — caught by a
   Playwright test timing out, traced to a real browser console error.
2. `fastly.picsum.photos` (the actual host mock images load from, via a
   redirect from `picsum.photos`) wasn't in the CSP `img-src` allowlist —
   caught by real CSP violation console errors during the same verification
   run, not by static analysis.
3. Two E2E test flakiness bugs: a race condition (`page.goto("/")` returning
   before the client-side `router.replace("/onboarding")` redirect
   completed) and a stale-locator bug (`.first()` re-matching a *different*
   creator's Follow button after the intended one unmounted) — both fixed by
   racing two expected end-states instead of trusting `page.url()`
   immediately, and by capturing the specific `aria-label` before acting.

**Not yet done:**
- **No test video fixture for upload rejection.** `checkUpload()`'s
  aspect-ratio rejection logic already has real unit test coverage
  (`video-validation.test.ts`), so this isn't an untested code path — it's
  specifically the *browser file-drop → rejection UI* path that isn't
  covered end-to-end. Generating a real synthetic portrait-aspect video
  fixture (`ffmpeg` wasn't available in this environment to generate one)
  is a small, mechanical follow-up. Tier: **Important**, not **Critical** —
  the underlying logic is genuinely tested, this closes a UI-integration gap.
- No load/performance testing yet (see [Scalability](#scalability)) — needs
  real backend to exist first.
- No visual regression testing (Percy, Chromatic, or Playwright's own
  screenshot comparison) — **Future**, once the design system is stable
  enough that visual diffs are signal rather than noise.

---

## Deployment

Not yet connected to anything — no Vercel project, no GitHub remote. See
[CI/CD](#cicd) for the recommended connection path and
[roadmap.md Milestone 3](roadmap.md#milestone-3--deploy) for the full
step-by-step (domain DNS, OAuth redirect URI updates from `localhost:3000`
to production, `next.config.ts` `images.remotePatterns` verification against
real hostnames). Tier: **Critical** — nothing else in this document matters
if the app never leaves a laptop.

---

## Backups & disaster recovery

**Not yet built** (genuinely blocked on a real Supabase project existing —
this is a runbook to execute the day that project is created, not code to
write now):

- **Enable Supabase PITR (point-in-time recovery) immediately upon project
  creation**, not after the first real user signs up. Retention window
  should match whatever RPO (recovery point objective) is acceptable —
  recommend starting at Supabase's standard 7-day PITR window for
  alpha/beta, revisiting for a longer window once real data volume/value
  justifies the storage cost.
- **RTO (recovery time objective) target**: for an alpha with a handful of
  users, a multi-hour RTO is acceptable. Before beta, this should tighten to
  "under an hour" — meaning the restore process needs to have been
  *actually rehearsed once* in a staging project, not just documented. A
  runbook nobody has executed is a guess, not a plan.
- **Cloudflare Stream/R2**: video assets live with Cloudflare, not in our
  Postgres backup — confirm Cloudflare's own durability guarantees cover
  this (R2 is designed for 11 nines durability; Stream's source video
  retention policy needs to be explicitly checked, not assumed) rather than
  treating video as something our DR plan needs to separately protect.
- **The actual runbook** (to write once a real Supabase project exists):
  who has restore access, where the recovery point is chosen from, how
  environment variables/DNS get repointed if it's a full region failure vs.
  a data-corruption rollback, and a communication plan (status page or
  equivalent) for a beta-scale user base during an incident.

Tier: **Critical** to enable PITR the day the project exists (it's a
one-time toggle, there's no reason to delay it); **Important** to have
actually drilled a restore before beta.

---

## Technical debt & repo hygiene

- **Git history.** One commit exists (`4d0275e Initial commit from Create
  Next App`), no remote configured, and every feature built across this
  entire project — the aspect-ratio system, private share links, Director
  Mode, Collections, the Version 3 refinements, everything in this
  migration pass — is uncommitted working-tree state. This is a live
  data-loss risk independent of the production question: one bad `git
  clean`, disk failure, or accidental `rm` away from losing the whole
  project. I have not committed anything, per this session's git safety
  rules — **this needs your explicit go-ahead**, and it should happen
  before anything else on this list, since every other recommendation in
  this document assumes there's a real, recoverable git history to build on.
- **`@tanstack/react-query` was removed this pass**, not wired up. It was
  present as a dependency with a working `QueryClientProvider` already
  mounted in `layout.tsx`, but zero components anywhere called
  `useQuery`/`useMutation` — confirmed by grep, not assumption. There is
  currently no real server data-fetching surface in the app at all (only
  `/api/health` exists as a Route Handler; everything else is static mock
  data or `localStorage`). Wiring a query hook to something fake just to
  "use" the dependency would have been exactly the kind of invented
  complexity this project's own conventions warn against. **Recommendation
  for when it's needed again** (once Milestone 1's real Supabase queries
  exist): reintroduce `@tanstack/react-query`, re-add a `QueryProvider`
  wrapping `{children}` in `layout.tsx` (same insertion point as before —
  innermost, inside `MotionConfig`), and establish query keys per resource
  from the start, e.g. `["video", videoId]`, `["feed", { tab, cursor }]`,
  `["profile", userId]` — consistent, colocated keys matter more once
  there's real cache invalidation to reason about (a like/follow mutation
  needs to know which queries to invalidate).
- **Two recurring Zustand bugs already hit and fixed in earlier work**
  (`CommentDrawer.tsx`, `CreateShareLinkSheet.tsx`): a selector returning a
  *new* array/object literal every call (`(s) => s.x.filter(...)` or
  `(s) => s.y ?? []`) breaks `useSyncExternalStore`'s reference-equality
  check, causing "getSnapshot should be cached" infinite-loop warnings. Fix
  pattern: select the raw stable-reference array/object and derive via
  `useMemo` in the component, or use a module-level constant fallback
  instead of an inline `?? []`. Worth a standing code-review checklist item
  for any new Zustand selector, not just a one-off fix — this class of bug
  will recur the moment real server data starts flowing through similarly-shaped stores.
- **SSR-unsafe `store.persist.hasHydrated()`**: the built-in Zustand
  persist API's `hasHydrated()` is `undefined` during Next.js's server-render
  pass, causing 500s. The established, proven-safe pattern in this codebase
  (`onboarding-store.ts`, `upload-draft-store.ts`) is a custom `hasHydrated:
  boolean` field + `setHasHydrated` action + `onRehydrateStorage: () =>
  (state) => state?.setHasHydrated(true)`, gating render with `if
  (!hasHydrated) return null`. Any new persisted store should follow this
  pattern from creation, not rediscover the bug.
- **No SQL migration has been run against a real Postgres instance yet.**
  The new migration (`supabase/migrations/20260101000000_init.sql`) was
  reviewed line-by-line for syntax correctness (enum/table/trigger creation
  order, dynamic SQL parameter binding in `adjust_video_counter()`, named
  constraint syntax) but could not be executed against a real database in
  this environment (Docker daemon wasn't running, and launching a GUI app
  autonomously wasn't appropriate here). **Run this migration against a real
  throwaway Supabase/Postgres instance before trusting it in production** —
  manual review is a good-faith substitute for execution, not a replacement
  for it. Tier: **Critical**, do this before Milestone 1's real backend work
  starts, not after.

---

## What this plan deliberately does not do

Per the same discipline established in [BETA_READINESS.md](BETA_READINESS.md):
this document does not invent new product features, and it does not build
speculative infrastructure for scale the product hasn't validated yet
(multi-region failover, Kubernetes, a custom video pipeline instead of
Cloudflare Stream). Everything above is either already a stated project
dependency (Supabase, Cloudflare, Vercel — all chosen in the original
architecture discussion) or a direct consequence of a specific, cited risk
(legal exposure, data loss, a real bug caught by real testing). Where a
recommendation is genuinely a judgment call rather than a requirement (the
cost table's assumptions, the CSAM-scanning vendor choice, the exact PITR
retention window), it's flagged as such rather than presented as settled.
