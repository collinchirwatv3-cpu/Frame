# Path to Live

This is the checklist to get FRAME from "runs on my laptop against mock data" to
"real people can visit a real URL and use it." It's distinct from the Phase 1–5
feature roadmap in [README.md](README.md#roadmap), which covers product evolution
*after* launch (creator dashboard, monetization, TV app, AI). This one stops at
"the MVP is live and safe to point real users at."

Milestones are ordered by dependency — each one mostly needs the previous one done.
**You** marks steps that need an account, payment, or a decision only you can make.
**Me** marks steps I can execute once the account/decision exists.

---

## Milestone 0 — Accounts & infrastructure

Nothing after this milestone can happen without these existing first.

- [ ] **You** — Create a [Supabase](https://supabase.com) project (free tier is fine to start). Gives us the DB URL + anon key + service role key.
- [ ] **You** — Create a [Cloudflare](https://cloudflare.com) account, enable billing, create an **R2** bucket (free tier: 10GB storage, egress always free) and enable **Stream** (no free tier — budget ~$10–20/mo for early testing; $5/1000 min stored + $1/1000 min delivered).
- [ ] **You** — Create a [Vercel](https://vercel.com) account (free tier is fine to start).
- [ ] **You** — Buy a domain.
- [ ] **You** — Create a Google Cloud OAuth client for "Continue with Google" (free, ~5 min).
- [ ] **You** — Decide: is Apple Sign-In in v1? It requires the Apple Developer Program ($99/yr). If not, launch with Google + email only and add Apple later — the login screen already has all three built, so this is a config decision, not a code change.
- [ ] **You** — Hand me the Supabase and Cloudflare keys (or drop them into `.env.local` yourself using `.env.local.example` as the template).

## Milestone 1 — Real backend

Everything here is currently mocked or stubbed — see README's ["What's stubbed, not
built"](README.md#whats-stubbed-not-built) for the exact list. This milestone replaces it with the real thing.

- [ ] **Me** — Write the actual Postgres migration from the schema already documented in [README.md § Data model](README.md#data-model) (`videos`, `creators`, `follows`, `likes`, `saves`, `comments`, `watch_progress`, `share_links`) + RLS policies so users can only write their own rows.
- [ ] **Me** — Wire real Supabase auth: confirm `signInWithOAuth`/`signInWithOtp` work end-to-end once Google/Apple providers are enabled in the Supabase dashboard.
- [ ] **Me** — Build the real upload pipeline: a route handler that mints a Cloudflare Stream direct-upload URL, the client PUTs the file straight to Cloudflare (never through our server), then a webhook flips the video to `ready` and applies any Rotate/Crop decision from the upload flow.
- [ ] **Me** — Replace the `localStorage`-backed Zustand stores (`engagement-store`, `comments-store`) with real reads/writes against the `likes`/`follows`/`comments` tables, scoped to the logged-in user.
- [ ] **Me** — Move share links off `localStorage`: server-minted tokens in the `share_links` table, checked on every `/s/[token]` request, with Cloudflare Stream `requireSignedURLs` controlling actual playback. This is the one piece of Milestone 1 that's not just "swap mock data for a query" — right now a share link genuinely cannot be opened on a different device or browser, which defeats the point of the feature.
- [ ] **You** — Decide: keep the interest-picker onboarding local-only (fine for v1), or start persisting `interests` to the `creators`/`users` table for real recommendation logic later? No urgency — flag it, don't block on it.

## Milestone 2 — Replace mock data, seed real content

A backend with zero content is not a launchable product — this is the "chicken and
egg" problem every UGC platform hits.

- [ ] **Me** — Swap `mock-data.ts` reads for real Supabase queries across Home, Explore, and Profile.
- [ ] **You** — Recruit or personally upload a starter set of real creators/videos (I'd suggest 15–30 videos minimum across a few categories) so the feed and Explore grid aren't embarrassingly empty on day one. This is the one item on this list that's fundamentally not a coding task.
- [ ] **You** — Decide whether early creators get manually-set "FRAME Certified" / equipment badges, or whether that stays fully creator-self-declared from launch.

## Milestone 3 — Deploy

- [ ] **You** — Push this repo to GitHub (currently local-only, not yet a git repo — I can `git init` and make the first commit whenever you want).
- [ ] **Me** — Connect the GitHub repo to Vercel, set all production env vars from `.env.local.example`.
- [ ] **You** — Point the domain's DNS at Vercel.
- [ ] **Me** — Update OAuth redirect URIs (Google Cloud Console, Supabase Auth settings, Apple if enabled) from `localhost:3000` to the real production domain — auth will silently fail on prod until this is done.
- [ ] **Me** — Confirm the `next.config.ts` `images.remotePatterns` list covers the real R2/Stream/Supabase hostnames being used in production (currently has placeholder patterns for `*.supabase.co`, `*.r2.dev`, `videodelivery.net` — verify against your actual bucket/stream hostnames).

## Milestone 4 — Legal basics

Not optional once real people can upload video and create accounts.

- [ ] **You** — Terms of Service.
- [ ] **You** — Privacy Policy (required regardless; doubly so if targeting EU users — GDPR).
- [ ] **You** — Content policy / DMCA takedown process. This is a real liability exposure for any platform hosting user-uploaded video, not a nice-to-have.
- [ ] **Me** — Once you have the text, wire up the actual `/terms`, `/privacy`, `/dmca` routes and link them from signup/upload.

## Milestone 5 — Trust & safety

A report pipeline and a review surface exist now; the layer that catches harmful
content *before* a human ever sees a report is still open.

- [x] **Me** — Report pipeline: the report action posts to `/api/reports`, a server-side (not direct-client) insert into the `reports` table, rate-limited.
- [x] **Me** — Moderation review dashboard (`/moderation`, gated to `profiles.is_moderator`): lists pending reports with a preview of the actual video, and Dismiss / Remove video / Ban creator actions — each re-checked server-side regardless of what the page renders.
- [ ] **You** — Set your own account's `is_moderator = true`. No self-service UI for this on purpose — it's a manual SQL step at this scale, not a settings toggle.
- [ ] **You** — CSAM detection on upload. Legal requirement, not optional, for any UGC video platform (the US requires NCMEC CyberTipline reporting; the EU has its own equivalents) — needs an actual legal consult on the reporting obligation alongside the vendor pick, not just a code integration. Leaning toward [Thorn Safer](https://safer.io) (video-native, bundles NCMEC reporting) over Microsoft PhotoDNA (image-hash-matching — would need frame extraction first); worth comparing against Google's CSAI Match too. Verify current pricing/access terms directly, don't take secondhand numbers as current.
- [ ] **You** — General content classifier (extreme violence, pornography) to auto-flag on upload. Leaning toward Hive Moderation or Sightengine over AWS Rekognition/Google Video Intelligence — purely to avoid standing up a new full cloud-provider account for one feature, when everything else in this stack (Cloudflare, Supabase, Upstash, Sentry, R2) is a simple API-key integration.
- [ ] **Me** — Once a vendor's picked and there's a real API key: hook the classifier into the Stream webhook (`/api/webhooks/stream/route.ts`) — sample a few frames the moment a video hits `readyToStream`, before `processing_status` flips to `ready`. Auto-clear clean results, auto-reject high-confidence hits, route anything borderline into the moderation dashboard above.
- [ ] **You** — Content policy language covering what's actually prohibited — extends Milestone 4's ToS/DMCA work, same legal pass, don't do it twice.

## Milestone 6 — Pre-launch QA

- [ ] **Me** — Cross-browser pass, Safari especially — autoplay policy, `navigator.share`, and clipboard-write behave differently there than in Chromium, and Chromium/Playwright is all I've been able to test against directly.
- [ ] **You** — Real device testing (an actual iPhone and an actual Android phone) — headless Chromium screenshots are a good proxy but aren't a substitute for real touch/scroll/autoplay behavior.
- [ ] **Me** — Lighthouse pass on the deployed build (performance, accessibility, SEO basics).
- [ ] **Me** — Wire up basic error monitoring (Sentry or Vercel's built-in) so a broken production build doesn't fail silently.

## Milestone 7 — Launch

- [ ] **Me** — Basic analytics wired (Vercel Analytics or Plausible — enough to know if anyone's actually using it).
- [ ] **You** — Decide on a soft-launch audience (friends/beta list) vs. going straight public.
- [ ] **You** — Flip the switch.

---

## What's already done

Worth stating plainly so this doesn't read as "nothing exists yet": the entire
Phase 1 MVP UI is built, tested, and working against mock data — swipe feed,
multi-ratio upload validation with the rejection/rotate/crop flow, Explore with
category + aspect-ratio filters, profile, inbox, onboarding, and auth screens that
already call real Supabase methods (they just need real keys to light up). Nothing
in Milestones 0–3 is "design this from scratch" — it's "connect what's already built
to real infrastructure."
