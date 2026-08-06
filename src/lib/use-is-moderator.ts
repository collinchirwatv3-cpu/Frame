"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ModeratorStatus = "loading" | "moderator" | "not-moderator";

/** Used in exactly two places — the Settings link's visibility and the
 * moderation dashboard's own gate — so a shared hook beats duplicating the
 * query, without pulling `is_moderator` into the global current-user store
 * (current-user-store.ts's Creator type is about public profile display;
 * this is authorization, a different concern). */
export function useIsModerator(): ModeratorStatus {
  const [status, setStatus] = useState<ModeratorStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        if (!cancelled) setStatus("not-moderator");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("is_moderator")
        .eq("id", user.id)
        .single();
      if (!cancelled) setStatus(data?.is_moderator ? "moderator" : "not-moderator");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
