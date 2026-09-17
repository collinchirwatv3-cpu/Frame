import { z } from "zod";

/** Videos up to and including six minutes are Shorts. */
export const SHORTS_MAX_DURATION_SECONDS = 360;

/**
 * Server-side validation for upload metadata — the pattern every future
 * Server Action/Route Handler that accepts user input should follow. The
 * client already validates (`UploadDropzone.tsx`, `checkUpload()` in
 * `lib/video-validation.ts`), but client validation is a UX nicety, not a
 * security boundary: TypeScript types vanish at runtime, and nothing stops a
 * request from being crafted by hand. Every mutation needs this same
 * safeParse-at-the-boundary treatment once real Route Handlers exist.
 *
 * Example usage in a future Route Handler:
 *   const parsed = uploadMetadataSchema.safeParse(await request.json());
 *   if (!parsed.success) {
 *     return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
 *   }
 *   // parsed.data is now UploadMetadataInput, safe to use.
 */
export const uploadMetadataSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
    description: z.string().trim().max(2000, "Description is too long").optional().default(""),
    // Replaces the old single `category` enum — real tag ids now, from the
    // tag taxonomy (see supabase/migrations/20260917100000_tag_taxonomy_schema.sql).
    // Shape/count only, enforced here; id-existence and category-membership
    // (does this id actually belong to the genre facet, etc.) is a DB round
    // trip, done in the route (src/app/api/uploads/route.ts) — same
    // "zod validates shape, the route re-derives/re-checks anything
    // DB-dependent" split this file already uses for contentType/duration.
    contentTypeTagId: z.string().uuid("Pick a content type"),
    genreTagIds: z.array(z.string().uuid()).min(1, "Pick at least one genre").max(3, "Up to 3 genres"),
    topicTagIds: z.array(z.string().uuid()).min(1, "Pick at least one topic").max(5, "Up to 5 topics"),
    moodTagIds: z.array(z.string().uuid()).max(3, "Up to 3 mood/style tags").default([]),
    locationTagId: z.string().uuid().nullable().default(null),
    // Optional but encouraged per the spec — generous cap, not a real limit
    // on how much gear a creator can tag, just a sanity bound.
    gearTagIds: z.array(z.string().uuid()).max(60, "Too many gear tags").default([]),
    // Films are the cinematic landscape library (the app's core identity);
    // shorts are the separate, also-landscape, non-cinematic Discover feed —
    // see supabase/migrations/20260806120000_shorts_content_type.sql (that
    // migration's own comment is explicit the film/short split was never
    // about shape). "longform" (supabase/migrations/20260808040000_longform_content_type.sql)
    // is a third, explicit creator choice for documentaries/extended
    // cinematic pieces — "film" already means what the product calls
    // "Standard," so this just adds one more value alongside it rather than
    // renaming anything. Defaults to "film" so every pre-existing caller of
    // this schema keeps working unchanged. src/app/api/uploads/route.ts
    // re-derives "short" from duration server-side regardless of what's
    // sent here — the client is trusted for the film-vs-longform choice,
    // never for the short boundary (see SHORTS_MAX_DURATION_SECONDS
    // below for the one rule this schema *does* enforce: longform requires
    // a video already long enough not to be a short).
    contentType: z.enum(["film", "short", "longform"]).default("film"),
    // Post (free, default) / Promote (creator pays to boost visibility,
    // src/app/api/uploads/route.ts additionally inserts a `campaigns` row
    // when this is chosen) / Monetise (eligible creators only — ads run
    // inside their long-form video). Eligibility itself is re-verified
    // server-side against profiles.monetization_eligible/business_channels,
    // never trusted from this schema alone — same "client claims, server
    // re-derives" posture as contentType's own short-duration boundary.
    publishMode: z.enum(["post", "promote", "monetise"]).default("post"),
    // Structural sanity only — the actual supported-ratio banding (16:9/21:9/
    // 16:10) is a business rule owned by checkUpload() in
    // lib/video-validation.ts, not duplicated here. This schema just refuses
    // obviously-malformed dimensions before that check ever runs.
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationSeconds: z.number().positive(),
    // Cloudflare Stream's TUS session needs the byte length up front
    // (`Upload-Length` header) — capped well above any real phone-recorded
    // clip so a crafted request can't claim an absurd size.
    fileSizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024 * 1024, "File is too large"),
  })
  .superRefine((data, ctx) => {
    const landscape = data.width > data.height;
    if (!landscape) {
      const message =
        data.contentType === "short" ? "Shorts are landscape-only" : "FRAMES films are landscape-only";
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: ["width"] });
    }

    // A real rejection (not a silent downgrade) when someone explicitly
    // requests longform on a too-short video — gives the creator actual
    // feedback rather than surprising them with a "film" upload instead.
    // The separate, unconditional "duration <= 360s is always short"
    // derivation lives in the API route, not here — that one silently
    // normalizes rather than rejects, since it's not really a rejected
    // *choice*, just an unspecified/default value getting corrected.
    if (data.contentType === "longform" && data.durationSeconds <= SHORTS_MAX_DURATION_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LongForm requires a video longer than 6 minutes",
        path: ["contentType"],
      });
    }

    // Monetise is long-form-only — Shorts creators earn through the
    // Shorts creator pool automatically (ad revenue split across eligible
    // creators by watch time), not via a per-video opt-in the way a
    // long-form creator's own video can carry ads directly.
    if (data.publishMode === "monetise" && data.contentType === "short") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Monetise is for long-form videos — Shorts earn through the creator pool instead",
        path: ["publishMode"],
      });
    }
  });

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
