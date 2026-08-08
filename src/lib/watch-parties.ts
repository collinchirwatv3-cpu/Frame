import { createClient } from "@/lib/supabase/client";
import type { Creator, Video } from "@/lib/types";

export type WatchParty = {
  id: string;
  title: string;
  createdAt: string;
  host: Pick<Creator, "id" | "username" | "displayName" | "avatarUrl">;
  video: Pick<Video, "id" | "title" | "posterUrl"> | null;
};

type Row = {
  id: string;
  title: string;
  created_at: string;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  videos: {
    id: string;
    title: string;
    poster_url: string | null;
  } | null;
};

// profiles!watch_parties_host_id_fkey / videos!watch_parties_video_id_fkey,
// not a bare embed — same reasoning as video-fetch.ts's SELECT: PostgREST
// needs the explicit constraint name whenever more than one relationship
// to the target table could exist, and being explicit here costs nothing.
const SELECT = `
  id, title, created_at,
  profiles!watch_parties_host_id_fkey ( id, username, display_name, avatar_url ),
  videos!watch_parties_video_id_fkey ( id, title, poster_url )
`;

function toParty(row: Row): WatchParty | null {
  if (!row.profiles) return null;
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    host: {
      id: row.profiles.id,
      username: row.profiles.username,
      displayName: row.profiles.display_name,
      avatarUrl: row.profiles.avatar_url ?? "",
    },
    video: row.videos
      ? { id: row.videos.id, title: row.videos.title, posterUrl: row.videos.poster_url ?? "" }
      : null,
  };
}

/** Every party, newest first — watch_parties_select_all makes this a fully
 * public read (see the migration's own comment for why), so this works the
 * same for signed-out visitors as signed-in ones. */
export async function fetchParties(limit = 30): Promise<WatchParty[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("watch_parties")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as unknown as Row[]).map(toParty).filter((p) => p !== null);
}

/** host_id isn't passed in — watch_parties_insert_own's `with check
 * (auth.uid() = host_id)` means anything other than the caller's own id
 * would just fail the RLS check, so there's no reason to make the caller
 * supply (and risk getting wrong) a value the database already knows. */
export async function createParty(params: { title: string; videoId: string }): Promise<WatchParty | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("watch_parties")
    .insert({ title: params.title, video_id: params.videoId, host_id: user.id })
    .select(SELECT)
    .single();
  if (error || !data) return null;
  return toParty(data as unknown as Row);
}

/** No host_id check needed client-side — watch_parties_delete_own's
 * `using (auth.uid() = host_id)` already means this silently affects zero
 * rows for anyone but the host, same reasoning as createParty above. */
export async function deleteParty(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("watch_parties").delete().eq("id", id);
  return !error;
}
