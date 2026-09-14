import { z } from "zod";

/** Server-side validation for POST /api/dm/messages — mirrors dm_messages'
 * own check(char_length(text) between 1 and 2000) (20260917000000) so a bad
 * request fails here with a clear 400 instead of a raw Postgres error. */
export const sendDmMessageSchema = z.object({
  threadId: z.string().uuid(),
  replyToId: z.string().uuid().optional(),
  text: z.string().trim().min(1, "Message can't be empty").max(2000, "Message is too long"),
});

export type SendDmMessageInput = z.infer<typeof sendDmMessageSchema>;
