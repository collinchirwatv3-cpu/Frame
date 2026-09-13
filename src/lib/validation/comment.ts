import { z } from "zod";

/** Server-side validation for POST /api/comments — mirrors the `text`
 * column's own check(char_length(text) between 1 and 2000)
 * (20260101000000_init.sql) so a bad request fails here with a clear 400
 * instead of surfacing as a raw Postgres constraint error. */
export const createCommentSchema = z.object({
  videoId: z.string().uuid(),
  text: z.string().trim().min(1, "Comment can't be empty").max(2000, "Comment is too long"),
  parentId: z.string().uuid().nullable().optional().default(null),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
