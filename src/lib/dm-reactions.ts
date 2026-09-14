import { createClient } from "@/lib/supabase/client";

export const DM_REACTIONS = [
  { emoji: "❤️", label: "Love" },
  { emoji: "👍", label: "Like" },
  { emoji: "😂", label: "Laugh" },
  { emoji: "😮", label: "Surprised" },
  { emoji: "😢", label: "Sad" },
  { emoji: "🙏", label: "Thanks" },
] as const;
export type DMEmoji = typeof DM_REACTIONS[number]["emoji"];
/** A reaction's emoji is any single emoji sequence the full picker offers,
 * not just the 6 quick reactions above — `is_valid_reaction_emoji()`
 * (20260917070000_dm_reaction_emoji_validation.sql) is the actual
 * authority on what's acceptable; `isValidReactionEmoji` below is a
 * friendly client-side pre-check, not a second source of truth. */
export type DMReaction = { messageId: string; userId: string; emoji: string };

/** A permissive, browser-native pre-check — "is this string a single
 * emoji-shaped grapheme cluster" — using Intl.Segmenter's own Unicode
 * text segmentation rather than re-implementing it in JS. This exists to
 * give the picker/composer fast, friendly feedback before a round trip;
 * it is NOT the authorization boundary (the database function is, and
 * it's stricter about what counts as "emoji-shaped" — a plain letter or
 * digit is one grapheme cluster too, so this alone can't tell "🙂" from
 * "a"). Never trust this over what the server actually accepted. */
export function isValidReactionEmoji(value: string): boolean {
  if (!value || new TextEncoder().encode(value).length > 64) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  if (segments.length !== 1) return false;
  // Reject plain ASCII (letters, digits, punctuation) — a real emoji
  // grapheme cluster always includes at least one code point above the
  // Basic Latin block, even the legacy BMP ones like "❤" (U+2764).
  return [...value].some((ch) => (ch.codePointAt(0) ?? 0) > 0x7f);
}

export async function fetchReactions(threadId: string, messageIds: string[]): Promise<DMReaction[]> {
  const result: DMReaction[] = [];
  const client = createClient();
  // At most two rows per message, including removals. Stay below the API
  // row cap regardless of how many history pages the reader has loaded.
  for (let offset = 0; offset < messageIds.length; offset += 100) {
    const { data, error } = await client.from("dm_reactions")
      .select("message_id, user_id, emoji").eq("thread_id", threadId)
      .in("message_id", messageIds.slice(offset, offset + 100));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      // A removed reaction is a real row with emoji = null (see the
      // migration's own comment on why) — never surfaced as a reaction.
      if (row.emoji) result.push({ messageId: row.message_id, userId: row.user_id, emoji: row.emoji });
    }
  }
  return result;
}

export async function setReaction(messageId: string, emoji: string | null): Promise<void> {
  const { error } = await createClient().rpc("set_dm_reaction", { p_message_id: messageId, p_emoji: emoji });
  if (error) throw new Error(error.message);
}
