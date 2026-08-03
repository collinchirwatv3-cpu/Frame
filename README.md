# FRAME

The cinematic social network. Not a TikTok clone — the test for every feature here is
"does this make watching video feel more cinematic?" FRAME is **landscape-first**, not
16:9-only — 16:9, 21:9 Cinema, and 16:10 are all first-class, with 3:2 and 4:3 wired
into the same taxonomy for future launch. Swipe-first, full-screen, built for
filmmakers, drone pilots, and anyone who shoots wide.

This repo is the **Phase 1 MVP**, now through its **Version 2 transformation** (see
[Version 2 — Cinematic Social Network](#version-2--cinematic-social-network) below):
the core swipe feed, upload flow with landscape enforcement, Explore/Discovery,
Collections, profile, inbox, and auth scaffolding. No monetization, TV app, or AI
features yet — see [Roadmap](#roadmap).

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript | RSC for fast first paint on feed/profile pages, route handlers double as the API layer |
| Styling | Tailwind CSS v4 | Design tokens live in `globals.css` via `@theme`, no separate config file to drift |
| Animation | Framer Motion | Shared motion vocabulary in `lib/motion.ts` — cinematic focus-pull, Director Mode chrome fade, sheet springs — nothing snaps |
| State | Zustand | One tiny global store (`src/store/player-store.ts`) for mute + active video; everything else is local component state |
| Data fetching | TanStack Query | Wired via `QueryProvider`, ready for real endpoints — feed currently reads mock data directly |
| Auth + DB | Supabase | Postgres for users/videos/follows/likes, `@supabase/ssr` for cookie-based sessions |
| Video delivery | Cloudflare Stream (recommended) | Adaptive HLS out of the box, cheaper per-minute than Mux at MVP scale, revisit Mux once creator analytics depth matters more than cost |
| Object storage | Cloudflare R2 | Avatars, banners, thumbnails, LUT/preset downloads — no egress fees pairs well with Stream |

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Cloudflare keys when ready
npm run dev
```

The app runs fully on mock data (`src/lib/mock-data.ts`) with zero env vars set —
the feed, explore, and profile screens all work out of the box. Auth and upload
publish are stubbed until Supabase/Cloudflare Stream credentials are added.

## Version 2 — Cinematic Social Network

FRAME's identity changed: from "TikTok for landscape video" to a cinematic social
network — every decision measured against "does this make watching video feel more
cinematic?" This was a critique-then-transform pass, not a feature bolt-on. The full
critique and prioritization is preserved in the session's plan file; the summary:

**What was removed or softened (TikTok patterns that didn't fit the new identity):**
- The flying heart-burst "double-tap" animation is gone — liking a video now gives a
  single subtle scale-pulse on the icon itself (`ActionRail.tsx`), not a separate
  animated element flying up the screen.
- The pop-in "+" follow badge that overlapped the avatar (Instagram Stories' exact
  affordance) is replaced with a calm text "Follow" pill beside the avatar.
- Engagement counts are de-emphasized (smaller, secondary-colored) so the icon reads
  first and the number second — counts exist for creators, they're not the point.

**What's new:**
- **Director Mode** — the signature feature. One tap fades out every piece of chrome
  (tabs, icons, caption, action rail, progress bar, and the entire nav shell — the
  desktop sidebar actually collapses its width so video goes edge-to-edge, not just
  invisible-but-still-taking-space) leaving only the video. Tap anywhere to restore.
  Lives in `player-store.ts` (`directorMode`), rendered in `VideoCard.tsx`,
  `FeedTabs.tsx`, `SideRail.tsx`, `BottomNav.tsx`; reset on feed unmount
  (`SwipeFeed.tsx`) so it can never leak into other routes.
- **Cinematic feed transitions** — a gentle focus-pull (opacity/scale/blur) as a video
  becomes active, layered on top of the existing native CSS scroll-snap (the reliable,
  performant part isn't touched). `scroll-snap-stop: always` in `globals.css` keeps a
  fast fling from skipping past multiple videos — "one scene at a time," not doomscroll
  velocity.
- **Audio fade in/out** — `lib/audio.ts`'s `fadeVolume()` ramps volume via
  `requestAnimationFrame` instead of snapping; video never begins or ends abruptly
  once unmuted. Spatial Audio/Dolby Atmos need encode-side support Cloudflare Stream
  doesn't expose today — that's a Phase 5 dependency, documented honestly rather than
  faked client-side.
- **Video Details** — optional, creator-controlled camera/lens/fps/codec/location/
  notes/equipment/tags (`VideoDetails` in `types.ts`, `VideoDetailsSheet.tsx`),
  reached by tapping "Shot details" under a caption rather than adding another icon
  to an already-busy rail.
- **Collections** — first-class, not a playlist: `Collection` type, a cover-art rail
  (`CollectionsRail.tsx`), a `/collections/[id]` detail page, and a real destination
  for the Profile "Collections" tab (previously a dead stub) backed by a new
  `savedCollections` set in `engagement-store.ts`, following the exact pattern
  already used for likes/saves/follows.
- **Explore → Editorial Discovery** — the default view is now curated horizontal
  rails (Staff Picks, Best Drone Footage, Hidden Gems, a Collections rail), derived
  from *existing* signals (badges, engagement counts) rather than a separate curation
  dataset — pragmatic for a mock-data catalog. The previous category/aspect-ratio
  filterable grid is **preserved**, not deleted — it's one tap away behind a
  "Browse all" toggle.
- **Watch Later** — a Netflix-shelf-styled rail on Discovery (larger cards than the
  editorial rails), populated from the `savedVideos` that already existed in
  `engagement-store.ts` but previously went nowhere.
- **Creator Profile → portfolio** — `Creator` gained optional `statement`,
  `equipment`, `availableForHire`; `ProfileHeader.tsx` shows them when present, and a
  new `FeaturedWork.tsx` surfaces a creator's top video and a collection their work
  appears in, above the tabs.
- **Motion vocabulary** — `lib/motion.ts` centralizes duration/easing constants
  (`DURATION`, `EASE_OUT`, `SHEET_SPRING`, `FOCUS_PULL_TRANSITION`,
  `CHROME_FADE_TRANSITION`) so every animation reaches for the same considered
  vocabulary instead of an inline spring config invented per component.

**Deliberately not built yet (documented, not faked):**
- **Cinema Mode** (uninterrupted 30/60-minute sessions) — the brief frames this
  around suppressing notifications/interruptions, but FRAME has no notification
  system at all yet. Building a "do not disturb" mode with nothing to disturb it
  would be theater. Real target: once Inbox has actual push notifications, add this
  as a genuine focus-session toggle.
- **Live streaming** — explicitly out of scope for now. Only architecture
  consideration: `videos.type: 'vod' | 'live'` is a natural reserved column whenever
  this gets built; no code changes needed today to keep the door open.
- **FRAME ecosystem** (TV, Studio, Creator, Live, Marketplace, AI) and monetization
  (subscriptions, tips, memberships, LUT/preset marketplace) — the brief's own
  language here is "design the platform around" and "architect so these fit
  tomorrow," which is a documentation ask. See [Roadmap](#roadmap) Phase 3 for the
  monetization sequencing rationale (subscriptions/tips/marketplace before ads,
  never the reverse). No transactional UI exists yet, intentionally.
- **Performance audit** — obvious wins (memoization, avoiding new-array selectors in
  Zustand stores — a bug class hit and fixed twice already in this codebase) are
  applied as components are touched, but a real profiling pass needs traffic against
  a deployed build. Already covered by `roadmap.md` Milestone 5.

## Version 3 — Creator Beta Preparation

A different mode from the last two rounds: "FRAME is no longer in feature
development... Do not invent unnecessary features. Refine. Simplify. Polish." The
full audit and reasoning behind every call here lives in **[BETA_READINESS.md](BETA_READINESS.md)**
— what got removed, what got improved, what was deliberately left alone, and two
launch checklists. This section is the changelog; that file is the report.

**Removed, not added** — the point of this pass:
- `VideoOptionsSheet`'s "Copy link" action, which duplicated `ActionRail`'s
  dedicated Share button.
- The per-video Search icon in `VideoCard` — redundant with Explore already being
  one tap away in the persistent nav.
- `Hidden Gems` (lowest-like-count videos) in favor of **New Voices** (creators
  below a follower threshold) — a real, distinct signal that serves creator
  retention directly, unlike a rail that was really just re-sorting the same 5
  videos. The brief's other four suggested rail types (Award Winners, Trending
  Collections, Weekend Watchlist, Editor's Choice) were deliberately **not**
  built — with 4 creators and 5 videos they'd have no real signal behind them,
  which is exactly the "endless algorithmic clutter" the brief warns against.

**Fixed — broken promises and real friction:**
- Onboarding referenced a Settings page that didn't exist. It does now
  (`app/(app)/settings`) — interests, sound-on-by-default, sign out — and
  onboarding gained a real "why FRAME exists" step instead of dropping straight
  into a category picker.
- Two categories (Architecture, Technology) that the brief's own onboarding copy
  named but `Category` didn't support.
- Inbox and Profile's own-videos tab had no empty-state handling at all — a
  new creator saw a blank gap, not a designed state with a next action.
- Upload now pre-fills the title from the filename and defaults the category to
  whatever the creator shoots most, instead of always resetting to the first
  category in the list — one fewer required action before publishing. A new
  `upload-draft-store.ts` autosaves title/description/category (metadata only —
  a `File` object can't survive a reload without IndexedDB, which is out of
  scope here; documented rather than half-built).

**Built — each tied to a specific brief section:**
- **Sharing**: `/watch/[id]` — a real `generateMetadata` + `opengraph-image.tsx`
  (Next's built-in `ImageResponse`, no external service) so a shared link
  actually unfurls as a branded card (poster, title, creator, duration) in
  iMessage/Slack/Twitter. `ActionRail`'s Share button points here now instead of
  the internal `/?v=` deep link, which stays as the in-app navigation mechanism.
  Deliberately scoped to public videos only — `/watch/[id]` never looks at
  `privateVideos`; a private video's only public surface remains the
  token-gated, revocable `/s/[token]`.
- **Search** (`lib/search.ts`): matches category, location, camera, lens,
  equipment, tags, and badges — not just title/username — and surfaces matching
  Collections above the video grid, not just videos.
- **Quality Index** (`lib/quality.ts`): a 0–100 score from resolution, supported
  aspect ratio, badge signals, and an engagement-per-follower proxy — never
  shown as a number anywhere (per spec). It matters through one real
  integration: `FRAME Certified` in `computeBadges()` can now be earned by score
  as well as manually authored, so it's a live signal instead of a fixed list.
  Honest gap: completion rate and watch retention (which the spec also asks
  for) need real playback analytics this app doesn't have yet — the proxy is
  named as a proxy, not disguised as the real thing.
- **Premieres** — architecture only, per explicit instruction ("NOT live
  streaming... Architecture only. No fake backend"): a `Premiere` type in
  `types.ts` documenting scheduled-release, reminder, and countdown-chat-window
  semantics. No UI, no store, nothing wired — a schema for later, not a feature
  now.
- **Accessibility**: `<MotionConfig reducedMotion="user">` at the root layout —
  every existing Framer Motion animation in the app now respects the OS-level
  reduced-motion setting from one place, rather than needing prefers-reduced-motion
  checks threaded through every component individually.

**Investigated, not changed** — the brief asked whether comments should exist at
all, or whether something like "Creator Notes" would feel more intentional.
Worth noting: **Creator Notes already exists** — `VideoDetails.creatorNotes`,
shipped in Version 2, surfaced in `VideoDetailsSheet`. The existing
`CommentDrawer` is already an opt-in bottom sheet, not an always-visible endless
thread — it was never the pattern the brief worries about. Replacing a working,
expected feature with something unproven days before a creator beta is real risk
for no demonstrated upside, so it stays as-is. Full reasoning in
`BETA_READINESS.md`.

## Architecture

```
src/
  app/
    (app)/            route group with the shared nav shell
      page.tsx         Home — swipe feed
      explore/
      upload/
      inbox/
      profile/
    onboarding/        interest picker, gates the (app) shell on first visit
    login/             outside the shell (no bottom nav)
  components/
    feed/              SwipeFeed, VideoCard, FeedTabs, ActionRail, VideoOverlay,
                        CommentDrawer, VideoOptionsSheet
    upload/            UploadDropzone + UploadRejection (multi-ratio gate + Rotate/Crop/Guidelines)
    explore/ profile/ inbox/ nav/
    ui/                Logo, Avatar, BadgeRow
  lib/
    aspect-ratio.ts    the ratio taxonomy — single source of truth for classification
    video-validation.ts  upload accept/reject logic, built on aspect-ratio.ts
    badges.ts          merges editorial + computed badges (never asserts a ratio badge
                        the real pixels don't back up)
    supabase/          browser + server clients, middleware session refresh
    mock-data.ts        types.ts
  store/
    player-store.ts     mute + active-video
    engagement-store.ts likes/saves/follows, persisted to localStorage
    comments-store.ts   locally-added comments, persisted to localStorage
    onboarding-store.ts  first-visit interest picker, persisted to localStorage
```

### The feed

`SwipeFeed` is a native CSS scroll-snap container (`snap-y snap-mandatory`), not a
custom drag/swipe reimplementation — that gets momentum scrolling, rubber-banding,
and mouse-wheel-advances-to-next-video **for free**, which also satisfies the desktop
"wheel scrolls to next video" requirement without extra code. An `IntersectionObserver`
tracks which card is ≥60% visible and marks it `active`; only the active `<video>`
plays, everything else is paused and reset — critical for battery/bandwidth once this
is real HLS instead of mock MP4s.

**Where I pushed back on the brief:** "every video is 16:9" and "no black bars" are in
tension on a portrait phone screen — a 16:9 video literally cannot fill a 9:19.5
viewport without either cropping the frame or leaving empty space above/below it.
Cropping would violate "every video is 16:9" (you'd be showing a different crop than
the creator uploaded). So instead of hard black bars, the letterbox space is filled
with a blurred, scaled-up copy of the video's poster frame — the Apple TV app /
Netflix mobile technique. It reads as intentional and cinematic rather than as an
unfilled gap, and the actual frame the creator shot is never cropped or stretched.

### Aspect ratio system

`lib/aspect-ratio.ts` defines the taxonomy as five non-overlapping ratio bands
(`minRatio`–`maxRatio`, not a single nominal value) so real-world encodes classify
correctly — e.g. 21:9 in the spec is nominally 2.33:1, but the actual example
resolutions (2560×1080, 3440×1440, 5120×2160) range 2.37–2.39, so the band is
[2.20, 2.45]. 16:9/21:9/16:10 are `enabled: true` (Primary Support); 3:2/4:3 are
`enabled: false` (Optional Future Support) — flipping that one flag is the entire
launch step for either, since classification, badges, and the discovery filter all
key off the same table. Gaps between bands (e.g. 1.85:1 "flat" cinema) are
intentionally unsupported until added here, not silently rounded into a neighbor.

**The player needed almost no changes.** It renders `<video className="w-full h-full
object-contain">` inside a full-bleed centered flex box, sized from the video's real
intrinsic pixels — never a hardcoded 16:9 box. That means 21:9 letterboxes and 16:10
pillarboxes *for free*, using the exact same blurred-backdrop technique already built
for 16:9. The only real player change was constraining the overlay chrome (captions,
action rail, tabs) to a `max-w-[1920px]` centered column so it stays visually anchored
to the video instead of floating at the edges of an ultra-wide monitor.

**Grid thumbnails respect the real ratio too.** `TrendingGrid` (Explore/Profile) used
to be a fixed `aspect-video` CSS grid; it's now a CSS-columns masonry layout with each
card sized via `style={{ aspectRatio: width/height }}` — a 21:9 upload genuinely reads
as a wide card, not a 16:9 box with a cropped thumbnail. Pure CSS, no JS masonry library.

### Upload gate

`UploadDropzone` loads the dropped file into an off-DOM `<video>` element, reads
`videoWidth`/`videoHeight` from `loadedmetadata`, and calls `checkUpload()` *before*
anything reaches a form or an upload request. Two distinct rejection paths, because
they warrant different copy and different recovery options:

- **`not-landscape`** (portrait or square) → `UploadRejection` explains FRAME is
  landscape-only and offers three real options: **Rotate 90°** (genuinely swaps
  width/height and re-validates — this is the actual fix for the common "phone
  recorded sideways, exported portrait" case, not just a message), **Crop to a
  supported ratio** (shows a real centered-crop preview per target ratio, nothing
  applied until confirmed — the spec is explicit: *do not auto-crop*), and
  **guidelines** (the supported ratios + example resolutions, pulled from the same
  `ASPECT_RATIOS` table so it can't drift from what's actually enforced).
- **`unsupported-ratio`** (landscape, but outside every enabled band — e.g. 1.85:1)
  → softer copy, plus the nearest enabled ratio by distance from the closer band edge.

### Metadata display — client vs server honesty

The upload screen shows aspect ratio, resolution, and duration immediately — a
browser `<video>` element can read those from `loadedmetadata`. FPS, codec, and
bitrate are shown as **"detected after upload"** rather than faked: the browser's
media APIs don't expose them reliably cross-browser, and in the real pipeline they
only become available once Cloudflare Stream finishes probing the file server-side.
Showing placeholder values here would be lying about what the client actually knows.

### Badges

`lib/badges.ts` computes a video's badge list by merging two sources: editorial/
creator-declared badges (`video.badges` — Drone, Shot on RED, FRAME Certified) and
badges computed from the real encode (4K if the resolution qualifies, 21:9 Cinema
if `classifyAspectRatio` says so). This split matters: a "21:9 Cinema" badge can
never be manually asserted on a video that doesn't actually play back that wide —
it's derived, not editable. **Known gap:** all current mock videos are genuinely
16:9 (they're reused stock demo clips), so the 21:9/16:10 Explore filters and the
21:9 Cinema badge are correctly empty in this build — they'll populate the moment
a real widescreen file is uploaded, since validation runs against real probed
dimensions, not mock data.

### Private videos & expiring share links

A creator's Profile has a third tab, **Private**, alongside Videos and Collections
(`ProfileTabs.tsx`). Private videos (`mock-data.ts`'s `privateVideos`) never appear
in the feed, Explore, or the public profile grid — the only way to reach one is a
share link the creator generates from that tab (`CreateShareLinkSheet.tsx`), with a
chosen TTL (1 hour / 24 hours / 7 days). The link resolves at `/s/[token]`, outside
the app shell, and:

- while active, plays the video in a stripped-down viewer with a "Get FRAME" CTA
  (no login required to watch — the point is frictionless sharing with people who
  aren't on FRAME yet);
- once expired or revoked, shows a distinct screen instead of a dead link — creator
  attribution plus a sign-up CTA, so an expired share becomes an acquisition
  moment rather than a dead end (`ExpiredLinkNotice.tsx`).

Revocation is immediate and independent of the expiry timer — a creator can kill a
link early from the same sheet that created it, and each link tracks a basic view
count (incremented once per valid page load).

**Real implementation vs. this build:** `lib/share-links.ts` documents the intended
shape — a server-minted, DB-backed token (not a client-generated one) checked
against a `share_links` table on every request, with Cloudflare Stream's own
signed-URL/`requireSignedURLs` feature layered underneath to control actual
playback access (short-lived, minted fresh per page load, independent of the
share link's own longer TTL). **In this Phase 1 build, `share-links-store.ts` is
`localStorage`-backed like the other engagement stores** — which means a link only
resolves in the same browser that created it. That's enough to demo and test the
full creation → view → expiry → revocation flow, but it does *not* yet work for
actually sending a link to someone else's device — that requires Milestone 1 of
[roadmap.md](roadmap.md).

## Data model

No live database exists yet in Phase 1 (state lives in `mock-data.ts` and
`localStorage`-backed Zustand stores) — this documents the schema the current
types already assume, so Phase 2's actual Postgres migration doesn't have to
re-derive it:

```
videos
  id, creator_id, playback_url, poster_url, title, description, category,
  width int, height int,        -- source of truth for aspect ratio; never store
                                 -- a separate "aspect_ratio" enum column, derive
                                 -- it from width/height like the client does
  visibility enum('public','private'),  -- private videos are excluded from every
                                 -- feed/Explore/profile-grid query, full stop —
                                 -- reachable only via a valid share_links row
  badges text[],                -- editorial only (Drone, Shot on RED, FRAME Certified);
                                 -- computed badges (4K, 21:9 Cinema) stay derived,
                                 -- never written to a row
  duration_seconds, sound_name, likes/comments/shares/saves counters,
  created_at

creators
  id, username, display_name, avatar_url, banner_url, bio, website,
  verified bool, followers/following/total_views (denormalized counters
  or materialized views once real-time accuracy matters)

follows        (user_id, creator_id)
likes          (user_id, video_id)
saves          (user_id, video_id)
comments       (id, video_id, user_id, text, created_at)
watch_progress (user_id, video_id, position_seconds)   -- Phase 4, cross-device resume
share_links    (token pk, video_id, creator_id, expires_at, revoked_at, view_count,
                created_at)                             -- token is server-generated;
                                                          -- `/s/[token]` checks this
                                                          -- table, not client state
```

`width`/`height` as the aspect-ratio source of truth (rather than a stored ratio
label) is deliberate — it's the same principle `lib/badges.ts` relies on client-side:
derive, don't duplicate, so nothing can claim a ratio the pixels don't back up.

## What's stubbed, not built

- **Upload → Cloudflare Stream**: `publish()` in `UploadDropzone.tsx` simulates a
  publish instead of calling Stream's direct-upload API. Real version: a route
  handler mints a one-time upload URL via Stream's API, the client PUTs the file
  directly to Cloudflare (never through our server), then we poll/webhook for
  `ready` status before the video appears in feeds — that webhook is also where
  a confirmed Rotate/Crop decision from the upload flow gets applied for real.
- **Crop confirmation**: `UploadRejection`'s crop preview is a real, accurate
  centered-crop preview, but "Continue cropped" doesn't cut pixels client-side —
  no canvas/WebCodecs re-encode exists yet. It stages the decision and shows it
  back to the uploader; the real crop happens server-side alongside transcoding.
- **Auth**: `login/page.tsx` calls real Supabase methods (`signInWithOAuth`,
  `signInWithOtp`) — they'll work the moment `.env.local` has real keys and the
  providers are enabled in the Supabase dashboard. Passkeys are Phase 1.5.
- **Likes/follows/comments/onboarding interests**: persisted to `localStorage` via
  Zustand (`engagement-store.ts`, `comments-store.ts`, `onboarding-store.ts`) so
  state survives reloads today, but it's per-browser, not per-account — needs the
  `likes`/`follows`/`comments` tables above once Supabase is wired.
- **Share links**: same `localStorage` limitation, more consequential here — a
  link literally cannot be opened on a different device until it's backed by the
  real `share_links` table + Stream signed URLs (see [above](#private-videos--expiring-share-links)).
  The whole point of this feature is cross-device sharing, so this is the first
  thing to move off `localStorage` once real backend work starts.

## Roadmap

Feature evolution *after* launch. For the checklist to actually get from this repo
to a live production site, see [roadmap.md](roadmap.md).

- **Phase 1 — MVP** *(this repo)*: swipe feed, multi-ratio landscape upload gate
  (16:9/21:9/16:10) with rotate/crop-preview/guidelines recovery, aspect-ratio +
  category discovery filters, quality/equipment badges, explore, profile, inbox
  shell, auth scaffolding.
- **Phase 2 — Creator tools**: real Stream upload pipeline, likes/comments/follows
  persisted to Postgres, creator dashboard (views, watch time, retention, top
  videos, audience geography).
- **Phase 3 — Monetization**: subscriptions + tips (Stripe Connect), memberships,
  marketplace for LUTs/presets/courses/footage licensing. Deliberately ordered
  *before* ads — ads come last and get capped placement so they never interrupt
  a swipe.
- **Phase 4 — TV**: tvOS/Android TV app, "continue watching" sync via a
  `watch_progress` table keyed by user+video, shared across mobile/desktop/TV.
- **Phase 5 — AI**: auto captions, translation, thumbnail generation, highlight
  clips/auto-trailers, SEO metadata suggestions, voice dubbing — all as async
  jobs triggered off the Stream "video ready" webhook, never blocking upload.
