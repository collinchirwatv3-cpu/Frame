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
export type DMReaction = { messageId: string; userId: string; emoji: DMEmoji };

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
      if (DM_REACTIONS.some((r) => r.emoji === row.emoji)) {
        result.push({ messageId: row.message_id, userId: row.user_id, emoji: row.emoji as DMEmoji });
      }
    }
  }
  return result;
}

export async function setReaction(messageId: string, emoji: DMEmoji | null): Promise<void> {
  const { error } = await createClient().rpc("set_dm_reaction", { p_message_id: messageId, p_emoji: emoji });
  if (error) throw new Error(error.message);
}
