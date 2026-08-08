import { z } from "zod";
import { categories } from "@/lib/mock-data";
import type { Category } from "@/lib/types";

/** Below this, a video is always "short" — see the API route, which
 * re-derives content_type from this same threshold server-side and never
 * trusts whatever the client sent for that boundary. Above it, "film" is
 * the default and "longform" is a real, explicit creator choice. */
export const LONGFORM_MIN_DURATION_SECONDS = 180;

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
    category: z.enum(categories as [Category, ...Category[]]),
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
    // never for the short boundary (see LONGFORM_MIN_DURATION_SECONDS
    // below for the one rule this schema *does* enforce: longform requires
    // a video already long enough not to be a short).
    contentType: z.enum(["film", "short", "longform"]).default("film"),
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
    // The separate, unconditional "duration < 180s is always short"
    // derivation lives in the API route, not here — that one silently
    // normalizes rather than rejects, since it's not really a rejected
    // *choice*, just an unspecified/default value getting corrected.
    if (data.contentType === "longform" && data.durationSeconds < LONGFORM_MIN_DURATION_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "LongForm requires a video at least 3 minutes long",
        path: ["contentType"],
      });
    }
  });

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
