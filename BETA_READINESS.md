# FRAME — Beta Readiness Report

Version 3 shifted FRAME from feature development into Product Validation: "the
objective is no longer adding features — it's making FRAME irresistible to its
first 100 creators." This report is the audit that pass asked for, plus the two
checklists it asked for. The changelog of what got built is in
[README.md § Version 3](README.md#version-3--creator-beta-preparation); this
document is the reasoning and the state of readiness.

---

## 1. What should be removed

- **`VideoOptionsSheet`'s "Copy link" action** — duplicated `ActionRail`'s
  dedicated Share button. *Done: removed.*
- **The per-video Search icon** in the feed chrome — Explore is already one tap
  away via the persistent nav; a second entry point on every single video was
  pure icon clutter. *Done: removed.*
- **`Hidden Gems` rail** — at 5 mock videos it was just a re-sort of the same
  handful shown everywhere else on Discover, with no distinct signal behind it.
  Replaced with `New Voices` (creators below a follower threshold), which
  directly serves creator retention instead of just filling a rail slot.
  *Done: replaced.*
- **Nothing else earned removal.** The Discover/Browse-all toggle on Explore is
  worth watching — two discovery paradigms living on one page is exactly the
  kind of complexity this brief asks to hunt for — but "Browse all" (filter by
  category/aspect ratio) is real, used utility, not dead weight. Leave it; revisit
  once real usage data shows whether anyone actually uses "Browse all" at all.

## 2. What should be improved

Already addressed this pass (see README for detail): onboarding (added a "why
FRAME exists" step, fixed a broken settings reference, added Architecture/
Technology categories), empty states (Inbox, Profile's own-videos tab, saved
Collections), upload friction (filename-derived title, smart category default,
metadata-only draft persistence), search breadth, and sharing (real Open Graph
previews via `/watch/[id]`).

**Still worth improving, not done this pass, with reasons:**
- **Captions** — no `<track>`/VTT support anywhere. Faking captions for mock
  demo videos would be dishonest; this needs a real transcription pipeline
  (ties to the Phase 5 "auto captions" roadmap item). Real gap for a video
  platform's accessibility story — should not ship a public beta without a
  committed plan for this, even if the plan is "Phase 5, post-beta."
- **Contrast** — spot-checked, not exhaustively audited. `--color-text-secondary`
  (`#8E8E93`) on `--color-bg` (`#090909`) reads fine for large UI text at a
  glance; small-text contrast across every surface hasn't been measured against
  WCAG AA formally. Worth an actual contrast-checker pass before public beta.
- **Skeleton/loading states** — none exist anywhere, because there's no real
  async latency yet (all data is synchronous mock data). Building skeletons now
  would be theater with nothing to cover. This becomes a real, non-optional gap
  the moment Supabase/Cloudflare Stream queries introduce actual network
  latency — already tracked in `roadmap.md` Milestone 1–2.
- **Full performance audit** — obvious wins (avoiding new-array Zustand
  selectors, a bug class hit and fixed twice in this codebase) are applied as
  code gets touched, but a real profiling pass needs traffic against a deployed
  build, not a local mock-data app. Tracked in `roadmap.md` Milestone 5.
- **Discover/Browse-all duplication** — flagged above; watch, don't touch yet.

## 3. What should stay exactly as it is

- **Comments** (`CommentDrawer`) — investigated per the brief's own prompt
  ("should discussion feel more intentional?"). Finding: it already is. It's an
  opt-in bottom sheet, not an always-visible endless thread — never the pattern
  the brief worries about — and "Creator Notes" (one of the brief's suggested
  alternatives) already shipped in Version 2 as `VideoDetails.creatorNotes`.
  Replacing a working, expected feature for something unproven, days before a
  creator beta, is real risk with no demonstrated upside.
- **The blurred-backdrop letterbox player technique** and the **multi-ratio
  system** (16:9/21:9/16:10) — both genuinely differentiated, both already
  solid, neither touched this pass.
- **Director Mode, cinematic feed transitions, audio fade** — the Version 2
  identity work. Nothing here conflicted with "does this increase retention or
  delight," so nothing here changed.
- **Private videos + expiring share links** — real, working, lower priority to
  actively promote for the first 100 creators (most will want public reach, not
  private sharing), but not broken or worth removing. Leave as an available
  feature, don't spend more beta-prep effort polishing it further right now.

## 4. Five highest-impact improvements before public beta

Ranked by "will this increase creator retention or viewer delight," per the
brief's own test — and by what's still missing, not what's already shipped:

1. **Real backend** (`roadmap.md` Milestone 1). Nothing above matters if the
   product never leaves mock data. This is the actual bottleneck to a creator
   beta, not any UI polish.
2. **Real upload pipeline to Cloudflare Stream.** Creators can't beta-test a
   platform that can't actually host their video. Second-most-blocking item
   after the backend itself.
3. **Captions.** A video platform beta without any accessibility story for deaf/
   hard-of-hearing viewers is a real gap, not a nice-to-have — should have at
   least a committed plan before public (not necessarily creator) beta.
4. **Seed content** (`roadmap.md` Milestone 2). An empty feed is the single
   biggest killer of first-session delight, full stop — no amount of onboarding
   or empty-state polish fixes a platform with nothing to watch.
5. **Legal basics** — Terms, Privacy, DMCA (`roadmap.md` Milestone 4). Settings
   already links to these as "coming soon" placeholders; they need to stop being
   placeholders before real creators upload real video under their own name.

## 5. Creator Beta launch checklist

- [ ] Real Supabase project + Cloudflare Stream wired (`roadmap.md` Milestone 1)
- [ ] Real upload pipeline replaces the simulated `publish()` in `UploadDropzone`
- [ ] At least 15–30 real videos across a few categories seeded before any
      creator's first login — an empty Explore/Discover is the fastest way to
      lose a beta creator in the first minute
- [ ] Terms of Service, Privacy Policy, Content/DMCA policy — no longer
      "coming soon" in Settings
- [ ] Creator can actually delete their own account/content (doesn't exist yet
      — worth confirming before inviting anyone's real work onto the platform)
- [ ] Verify the upload rejection flow (portrait/unsupported ratio) against a
      real phone-recorded clip, not just the synthetic test video used during
      development
- [ ] Confirm `/watch/[id]` OG previews actually render correctly in iMessage,
      Slack, and Twitter/X — automated screenshot verification isn't the same
      as a real unfurl in each client
- [ ] Sign-out (Settings) actually clears a real session once Supabase auth is live

## 6. Viewer Beta launch checklist

- [ ] Real device testing — an actual iPhone and an actual Android phone, not
      just headless Chromium (autoplay policy, gesture handling, and haptics
      all behave differently on real hardware)
- [ ] Safari pass specifically — `navigator.share`, clipboard-write, and
      autoplay policy all differ from Chromium, and Chromium is what's been
      tested against throughout development
- [ ] Confirm reduced-motion is respected end-to-end on a device with the OS
      setting actually enabled, not just code-reviewed
- [ ] Basic error monitoring wired (`roadmap.md` Milestone 5) so a broken
      production build doesn't fail silently for viewers
- [ ] Confirm the Following-tab empty state and Discover rails all still make
      sense once there are real creators to follow, not just 4 mock ones
- [ ] Spot-check contrast on small secondary text against a real contrast
      checker, not a visual glance
- [ ] Decide the captions plan — even "not at launch, committed for Phase 5" is
      better than silence, and viewers should not discover the gap themselves
