"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Live participant count for a party's room, without actually joining it.
 * Same channel topic (`watch-room:{partyId}`) and private-channel shape
 * use-watch-room.ts opens for the real in-party experience, so it's
 * governed by the exact same Realtime Authorization RLS
 * (can_access_watch_room, 20260808050000_watch_room_realtime_rls.sql) — a
 * private party this viewer can't reach just never syncs and reads 0,
 * never an error surfaced on a list card.
 *
 * Deliberately never calls channel.track() — a pure observer shouldn't
 * inflate the count it's trying to read. Presence's own "sync" event still
 * delivers the full current state to any subscriber, tracking or not.
 *
 * `enabled` should be wired to useInView (see PartyCard.tsx) — one
 * subscription per rendered card regardless of scroll position would be
 * real, wasted Realtime connection cost on any list longer than a screen.
 */
export function usePartyPresenceCount(partyId: string, enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    // A list of these mounts per visible card, on whatever connection the
    // viewer has — a dropped/slow mobile socket should read as "0 watching"
    // like a private party this viewer can't reach does, never crash the
    // whole list. subscribe()'s status callback + this try/catch are
    // belt-and-suspenders around the same "never surface an error here"
    // intent the module comment already states.
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;
    try {
      const supabase = createClient();
      channel = supabase.channel(`watch-room:${partyId}`, {
        config: { presence: { key: crypto.randomUUID() }, private: true },
      });

      channel.on("presence", { event: "sync" }, () => {
        try {
          setCount(Object.keys(channel!.presenceState()).length);
        } catch {
          // Stale/torn-down channel racing this callback — leave the count
          // as-is rather than let it throw during a React state update.
        }
      });

      channel.subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Party presence count: realtime subscribe failed, staying at 0.", err);
        }
      });
    } catch (err) {
      console.warn("Party presence count: could not open a realtime channel, staying at 0.", err);
      return;
    }

    return () => {
      try {
        const supabase = createClient();
        supabase.removeChannel(channel!).catch(() => {});
      } catch {
        // Already torn down or never fully subscribed — nothing to clean up.
      }
      setCount(0);
    };
  }, [partyId, enabled]);

  return count;
}
