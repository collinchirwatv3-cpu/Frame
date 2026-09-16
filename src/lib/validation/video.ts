import { z } from "zod";

/** Server-side validation for PATCH /api/videos/[id] — mirrors
 * uploadMetadataSchema's own title/description limits (validation/upload.ts)
 * and videos_title_length/videos_description_length's matching database
 * CHECK constraints (20260919100000_video_self_edit.sql), so a bad request
 * fails here with a clear 400 instead of a raw Postgres error. */
export const editVideoSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
  description: z.string().trim().max(2000, "Description is too long").optional().default(""),
});

export type EditVideoInput = z.infer<typeof editVideoSchema>;
