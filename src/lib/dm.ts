import { createClient } from "@/lib/supabase/client";

export type DMThread = {
  id: string;
  otherUser: { id: string; username: string; displayName: string; avatarUrl: string };
  lastMessageAt: string | null;
  unread: boolean;
  /** True when the other participant's profile is RLS-hidden — in practice
   * this only happens because one side has blocked the other
   * (profiles_select_all, 20260915000000_blocks.sql); a deleted account
   * cascades the whole thread away rather than leaving a dangling row. The
   * thread and its message history stay reachable either way (dm_threads/
   * dm_messages RLS don't depend on profiles RLS at all) — otherUser is a
   * neutral placeholder in this case, not the real (blocked) profile data. */
  otherUserUnavailable: boolean;
};

export type DMMessage = {
  id: string;
  threadId: string;
  senderId: string;
  text: string;
  createdAt: string;
};

/** A message's position for keyset pagination and for the read boundary
 * mark_dm_thread_read validates — created_at alone isn't unique enough:
 * two messages can share the exact timestamp (real, not just theoretical,
 * under concurrent senders), and a strict </> comparison on created_at
 * alone would silently skip/duplicate a page boundary, or misidentify
 * exactly which of a tied pair has actually been read. (created_at, id)
 * together always is unique. */
export type MessageCursor = { createdAt: string; id: string };

type ThreadRow = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string | null;
  last_message_id: string | null;
  user_a_last_read_at: string | null;
  user_a_last_read_message_id: string | null;
  user_b_last_read_at: string | null;
  user_b_last_read_message_id: string | null;
  a: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  b: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
};

const THREAD_SELECT =
  "id, user_a_id, user_b_id, last_message_at, last_message_id, user_a_last_read_at, user_a_last_read_message_id, user_b_last_read_at, user_b_last_read_message_id, a:profiles!dm_threads_user_a_id_fkey(id, username, display_name, avatar_url), b:profiles!dm_threads_user_b_id_fkey(id, username, display_name, avatar_url)";

/** Used only when the other participant's profile embed came back null (a
 * block) — never returned for a real, visible profile. Deliberately no
 * username, since UserListRow-style profile links would otherwise 404 on
 * a made-up handle; callers gate navigation on otherUserUnavailable
 * instead of relying on this shape looking unusual. */
function unavailableUser(id: string) {
  return { id, username: "", displayName: "Unavailable", avatarUrl: "" };
}

/** True if the thread has activity (last_message_id) this viewer's read
 * position hasn't reached. Composite (created_at, id) comparison, same
 * reasoning as pagination and mark_dm_thread_read's own boundary check —
 * two messages can share an exact created_at, so comparing timestamps
 * alone can't tell "read through the first of a tied pair" from "read
 * through both." */
function isUnread(
  lastMessageAt: string | null,
  lastMessageId: string | null,
  lastReadAt: string | null,
  lastReadId: string | null
): boolean {
  if (!lastMessageAt || !lastMessageId) return false;
  if (!lastReadAt || !lastReadId) return true;
  if (lastReadAt !== lastMessageAt) return lastReadAt < lastMessageAt;
  return lastReadId < lastMessageId;
}

function toThread(row: ThreadRow, viewerId: string): DMThread {
  const isA = row.user_a_id === viewerId;
  const otherId = isA ? row.user_b_id : row.user_a_id;
  const otherProfile = isA ? row.b : row.a;
  const lastReadAt = isA ? row.user_a_last_read_at : row.user_b_last_read_at;
  const lastReadId = isA ? row.user_a_last_read_message_id : row.user_b_last_read_message_id;
  const unread = isUnread(row.last_message_at, row.last_message_id, lastReadAt, lastReadId);
  return {
    id: row.id,
    otherUser: otherProfile
      ? {
          id: otherProfile.id,
          username: otherProfile.username,
          displayName: otherProfile.display_name,
          avatarUrl: otherProfile.avatar_url ?? "",
        }
      : unavailableUser(otherId),
    lastMessageAt: row.last_message_at,
    unread,
    otherUserUnavailable: !otherProfile,
  };
}

/** Every thread the caller is part of, newest activity first. Threads with
 * no messages yet sort last (last_message_at is null until the first
 * message lands) — a freshly-created empty thread isn't "recent activity."
 * A thread with a blocked other participant is still included (with a
 * neutral placeholder), not dropped — existing history stays reachable. */
export async function fetchThreads(viewerId: string): Promise<DMThread[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dm_threads")
    .select(THREAD_SELECT)
    .or(`user_a_id.eq.${viewerId},user_b_id.eq.${viewerId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return (data as unknown as ThreadRow[]).map((row) => toThread(row, viewerId));
}

/** Finds or creates the 1:1 thread with `otherUserId`, via the narrow RPC —
 * never a direct insert (dm_threads has no client insert grant at all, and
 * the RPC is also what enforces the block check, canonical id ordering,
 * and — as of 20260917010000 — does so as a single atomic upsert, so two
 * concurrent callers can never race into a duplicate-key error). Returns
 * null if it's rejected (blocked pair, self, no invite). */
export async function getOrCreateThread(otherUserId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_or_create_dm_thread", { other_user_id: otherUserId });
  if (error || !data) return null;
  return data as string;
}

/** Marks the thread read THROUGH a specific, real message — never "read as
 * of now." The database validates that `through` actually names a message
 * in this thread (20260917030000_dm_fixes_3.sql) before accepting it, so a
 * caller can only ever acknowledge messages it can prove it fetched, not
 * "everything up to whenever this call happens to run." A message that
 * lands between the caller's last fetch and this call is never covered by
 * `through`, so it correctly stays unread until a later fetch actually
 * retrieves it.
 *
 * Also monotonic and a no-op when it wouldn't advance anything (both
 * enforced server-side) — safe to call after every successfully-fetched
 * page during a drain, not just once at the end, and safe to call
 * redundantly without needing to check "is this thread even unread" first. */
export async function markThreadRead(threadId: string, through: MessageCursor): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("mark_dm_thread_read", {
    target_thread_id: threadId,
    p_through_created_at: through.createdAt,
    p_through_id: through.id,
  });
}

/** A single thread by id, for the conversation view's header — same shape
 * fetchThreads returns, just scoped to one row instead of the list. */
export async function fetchThread(threadId: string, viewerId: string): Promise<DMThread | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("dm_threads").select(THREAD_SELECT).eq("id", threadId).maybeSingle();
  if (error || !data) return null;
  return toThread(data as unknown as ThreadRow, viewerId);
}

const MESSAGE_LIMIT = 100;

function toMessage(row: { id: string; thread_id: string; sender_id: string; text: string; created_at: string }): DMMessage {
  return { id: row.id, threadId: row.thread_id, senderId: row.sender_id, text: row.text, createdAt: row.created_at };
}

/**
 * Chronological (oldest-first) page of messages, always returned in
 * display order regardless of which cursor is used:
 * - no options: the newest MESSAGE_LIMIT messages (fetched newest-first
 *   under the hood so a long thread's initial load shows recent activity,
 *   not its first-ever messages, then reversed for display).
 * - `before`: the next-older MESSAGE_LIMIT messages before that cursor —
 *   pagination for scrolling up into history.
 * - `after`: messages newer than that cursor, ascending — for an
 *   incremental realtime refresh that appends rather than replaces.
 *
 * `before`/`after` go through fetch_dm_messages_before/after (SQL
 * functions doing a native Postgres row comparison on (created_at, id))
 * rather than PostgREST's or=() filter string — not worth relying on that
 * string DSL's parsing around a value that itself contains literal dots
 * (an ISO timestamp's fractional seconds) when a native row comparison
 * says the same thing unambiguously. Both are security invoker: query
 * helpers, not a new authorization layer — dm_messages_select_own still
 * applies to the calling user exactly as a direct select would.
 *
 * Throws on a genuine query failure, rather than this file's usual
 * "return [] and let the caller treat it as empty" — callers that need to
 * tell "nothing more to load" apart from "the fetch itself failed" (the
 * incremental-refresh drain loop in [threadId]/page.tsx, specifically)
 * cannot do that if both cases look identical.
 */
export async function fetchMessages(
  threadId: string,
  options?: { before?: MessageCursor; after?: MessageCursor }
): Promise<DMMessage[]> {
  const supabase = createClient();

  if (options?.after) {
    const { data, error } = await supabase.rpc("fetch_dm_messages_after", {
      p_thread_id: threadId,
      p_after_created_at: options.after.createdAt,
      p_after_id: options.after.id,
      p_limit: MESSAGE_LIMIT,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toMessage);
  }

  if (options?.before) {
    const { data, error } = await supabase.rpc("fetch_dm_messages_before", {
      p_thread_id: threadId,
      p_before_created_at: options.before.createdAt,
      p_before_id: options.before.id,
      p_limit: MESSAGE_LIMIT,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toMessage).reverse();
  }

  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, thread_id, sender_id, text, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGE_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toMessage).reverse();
}

/** Goes through the rate-limited route, not a direct client insert — see
 * /api/dm/messages' own comment for why (same reasoning as /api/comments).
 * Never throws: a rejected fetch (offline, DNS, aborted) is caught and
 * treated the same as a non-ok response — callers only ever need to
 * branch on "did this return a message or not." */
export async function sendMessage(threadId: string, text: string): Promise<DMMessage | null> {
  try {
    const res = await fetch("/api/dm/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return toMessage(data);
  } catch {
    return null;
  }
}
