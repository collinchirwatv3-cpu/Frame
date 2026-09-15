import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uploadMetadataSchema, LONGFORM_MIN_DURATION_SECONDS } from "@/lib/validation/upload";
import { createTusUploadSession } from "@/lib/cloudflare-stream";
import { uploadRateLimiter, checkRateLimit, rateLimitedResponse } from "@/lib/rate-limit";

// 2x the $5 base advertising CPM — Promote is deliberately pricier than
// Run as an Ad, so paid reach can't disguise itself as cheap commercial
// advertising (the monetization model's own stated reasoning). No Stripe
// integration exists yet (Phase 2) — the campaigns row this creates lands
// status: "pending_payment" and can't actually be charged until then.
const PROMOTE_CPM_CENTS = 1000;

// Mints a real Cloudflare Stream direct-upload (TUS) session and creates the
// video's DB row up front, in `uploading` state — see
// supabase/migrations/20260805000000_upload_pipeline.sql for why
// playback_url/poster_url are nullable until the Stream webhook confirms
// the encode is ready. Replaces UploadDropzone.tsx's old fake setTimeout
// publish() entirely.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  // RLS (videos_insert_own, see 20260808030000_invite_gate_rls.sql) already
  // enforces this at the database layer — this is a clearer, faster-failing
  // error than letting an uninvited insert bubble up as a raw RLS violation.
  // monetization_eligible rides along in the same query (see the
  // publishMode === "monetise" check below) — it's on the same row, no
  // extra round trip.
  const { data: profile } = await supabase
    .from("profiles")
    .select("invite_redeemed_at, monetization_eligible")
    .eq("id", user.id)
    .single();
  if (!profile?.invite_redeemed_at) {
    return NextResponse.json({ error: "An invite is required" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(uploadRateLimiter, user.id);
  if (!rateLimit.success) {
    return rateLimitedResponse(rateLimit);
  }

  const parsed = uploadMetadataSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const {
    title,
    description,
    contentTypeTagId,
    genreTagIds,
    topicTagIds,
    moodTagIds,
    locationTagId,
    gearTagIds,
    contentType,
    publishMode,
    width,
    height,
    durationSeconds,
    fileSizeBytes,
  } = parsed.data;

  // Pre-flight tag validation — before createTusUploadSession is even
  // called, so a bad tag id fails fast with zero side effects, same
  // "clearer, faster-failing error" reasoning as the invite check above.
  // zod only checked shape (valid UUIDs, right counts); id-existence and
  // facet membership (a genre id actually being a genre.tags row, not a
  // gear id smuggled into the genre slot) needs the DB.
  const tagSelection: { ids: string[]; facet: string; label: string }[] = [
    { ids: [contentTypeTagId], facet: "content_type", label: "Content type" },
    { ids: genreTagIds, facet: "genre", label: "Genre" },
    { ids: topicTagIds, facet: "topic", label: "Topic" },
    { ids: moodTagIds, facet: "mood", label: "Mood" },
    { ids: locationTagId ? [locationTagId] : [], facet: "location", label: "Location" },
    { ids: gearTagIds, facet: "gear", label: "Gear" },
  ];
  const allSubmittedTagIds = [...new Set(tagSelection.flatMap((s) => s.ids))];

  if (allSubmittedTagIds.length > 0) {
    const { data: validTags, error: tagsError } = await supabase
      .from("tags")
      .select("id, tag_categories!inner(facet)")
      .in("id", allSubmittedTagIds)
      .eq("active", true);
    if (tagsError) {
      return NextResponse.json({ error: "Could not validate tags" }, { status: 500 });
    }
    const facetById = new Map(
      ((validTags ?? []) as unknown as { id: string; tag_categories: { facet: string } }[]).map((t) => [
        t.id,
        t.tag_categories.facet,
      ])
    );
    for (const { ids, facet, label } of tagSelection) {
      for (const id of ids) {
        const actualFacet = facetById.get(id);
        if (!actualFacet) {
          return NextResponse.json({ error: `${label}: one or more tags no longer exist` }, { status: 400 });
        }
        if (actualFacet !== facet) {
          return NextResponse.json({ error: `${label}: invalid tag selection` }, { status: 400 });
        }
      }
    }
  }

  // Authoritative, not client-trusted: under 3 minutes is always "short",
  // full stop — the schema's superRefine already rejects an explicit
  // longform request that's too short, but this covers every other case
  // too (e.g. a client that just sent "film" for a 90-second clip). Above
  // the threshold, the schema has already validated contentType is a real
  // choice ("film" or "longform"), so it's trusted as-is here.
  const contentTypeFinal = durationSeconds < LONGFORM_MIN_DURATION_SECONDS ? "short" : contentType;

  // Same "never trust the client for a derived boundary" posture as
  // contentTypeFinal above: the schema's superRefine only catches
  // publishMode === "monetise" against the client-claimed contentType — a
  // client could claim "film" for a 90-second video (schema sees no
  // conflict) while contentTypeFinal, re-derived from real duration, comes
  // out "short". Re-check against the authoritative value, not the claimed
  // one. videos_insert_own (20260808060000) would reject this at the RLS
  // layer regardless via the eligibility check below, but this is the same
  // "clearer, faster-failing error" reasoning as the invite check above.
  if (publishMode === "monetise" && contentTypeFinal === "short") {
    return NextResponse.json(
      { error: "Monetise is for long-form videos — Shorts earn through the creator pool instead" },
      { status: 400 }
    );
  }
  if (publishMode === "monetise" && !profile.monetization_eligible) {
    return NextResponse.json({ error: "You're not eligible to monetise videos yet" }, { status: 403 });
  }

  // Businesses can Run as an Ad but never Promote — advertising must never
  // masquerade as organic creator content, per the monetization model's
  // own explicit rule. A second query, only for this branch, since it's a
  // different table than the profile fetch above and most uploads never
  // touch it.
  if (publishMode === "promote") {
    const { data: businessChannel } = await supabase
      .from("business_channels")
      .select("status")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (businessChannel?.status === "approved") {
      return NextResponse.json(
        { error: "Business Channels can Run as an Ad instead of Promote" },
        { status: 403 }
      );
    }
  }

  let session: Awaited<ReturnType<typeof createTusUploadSession>>;
  try {
    session = await createTusUploadSession(durationSeconds, fileSizeBytes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start the upload" },
      { status: 502 }
    );
  }

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      creator_id: user.id,
      stream_uid: session.uid,
      processing_status: "uploading",
      content_type: contentTypeFinal,
      title,
      description,
      width,
      height,
      duration_seconds: durationSeconds,
      publish_mode: publishMode,
      // Required NOT NULL columns with no real value yet — Stream's webhook
      // overwrites both the moment the encode is ready.
      playback_url: null,
      poster_url: null,
    })
    .select("id")
    .single();

  if (error || !video) {
    return NextResponse.json({ error: "Could not create the video record" }, { status: 500 });
  }

  // Write the creator's direct tag selections, then resolve gear
  // inheritance (tag_implies) and location ancestry (tag_ancestors RPC)
  // into additional source='inherited' rows. A failure here degrades
  // gracefully rather than failing the whole upload — same tolerance this
  // route already has for the campaigns insert below: the video is real
  // either way, only its tags silently wouldn't have attached. Already
  // validated to exist/be-active/match-facet above, so this is just the
  // write.
  if (allSubmittedTagIds.length > 0) {
    const { error: directTagsError } = await supabase
      .from("video_tags")
      .insert(allSubmittedTagIds.map((tag_id) => ({ video_id: video.id, tag_id, source: "creator" as const })));
    if (directTagsError) {
      console.error(`Upload: failed to write direct tags for video ${video.id}:`, directTagsError);
    } else {
      const gearIds = gearTagIds;
      if (gearIds.length > 0) {
        const { data: implies } = await supabase
          .from("tag_implies")
          .select("implied_tag_id")
          .in("tag_id", gearIds);
        const impliedIds = [
          ...new Set(
            ((implies ?? []) as { implied_tag_id: string }[])
              .map((i) => i.implied_tag_id)
              .filter((id) => !allSubmittedTagIds.includes(id))
          ),
        ];
        if (impliedIds.length > 0) {
          const { error: impliedError } = await supabase
            .from("video_tags")
            .insert(impliedIds.map((tag_id) => ({ video_id: video.id, tag_id, source: "inherited" as const })));
          if (impliedError) {
            console.error(`Upload: failed to write inherited gear tags for video ${video.id}:`, impliedError);
          }
        }
      }

      if (locationTagId) {
        const { data: ancestors } = await supabase.rpc("tag_ancestors", { p_tag_id: locationTagId });
        const ancestorIds = ((ancestors ?? []) as { id: string }[])
          .map((a) => a.id)
          .filter((id) => !allSubmittedTagIds.includes(id));
        if (ancestorIds.length > 0) {
          const { error: ancestorError } = await supabase
            .from("video_tags")
            .insert(ancestorIds.map((tag_id) => ({ video_id: video.id, tag_id, source: "inherited" as const })));
          if (ancestorError) {
            console.error(`Upload: failed to write location ancestor tags for video ${video.id}:`, ancestorError);
          }
        }
      }
    }
  }

  // Same user-scoped client as the videos insert above, not service-role —
  // this genuinely exercises campaigns_insert_own's RLS check
  // (20260808080000_campaigns.sql), rather than bypassing it. A failure
  // here doesn't roll back the video itself — the video is real and
  // published either way; only the boost campaign silently didn't attach,
  // same "the upload succeeded, a secondary step didn't" tolerance this
  // route already has for the thumbnail step elsewhere in the app.
  if (publishMode === "promote") {
    const { error: campaignError } = await supabase.from("campaigns").insert({
      type: "promote",
      owner_id: user.id,
      video_id: video.id,
      cpm_cents: PROMOTE_CPM_CENTS,
      status: "pending_payment",
    });
    if (campaignError) {
      console.error(`Upload: failed to create promote campaign for video ${video.id}:`, campaignError);
    }
  }

  return NextResponse.json({ uploadUrl: session.uploadUrl, videoId: video.id });
}
