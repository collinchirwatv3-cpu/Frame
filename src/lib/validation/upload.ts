import { z } from "zod";
import { categories } from "@/lib/mock-data";
import type { Category } from "@/lib/types";

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
    // shorts are the separate, portrait, non-cinematic Discover feed — see
    // supabase/migrations/20260806120000_shorts_content_type.sql. Defaults
    // to "film" so every pre-existing caller of this schema keeps working
    // unchanged.
    contentType: z.enum(["film", "short"]).default("film"),
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
    if (data.contentType === "film" && !landscape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FRAMES films are landscape-only",
        path: ["width"],
      });
    }
    if (data.contentType === "short" && landscape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Shorts are portrait-only",
        path: ["width"],
      });
    }
  });

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
