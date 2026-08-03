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
    // Structural sanity only — the actual supported-ratio banding (16:9/21:9/
    // 16:10) is a business rule owned by checkUpload() in
    // lib/video-validation.ts, not duplicated here. This schema just refuses
    // obviously-malformed dimensions before that check ever runs.
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .refine((data) => data.width > data.height, {
    message: "FRAME is landscape-only",
    path: ["width"],
  });

export type UploadMetadataInput = z.infer<typeof uploadMetadataSchema>;
