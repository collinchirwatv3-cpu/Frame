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
    const supabase = createClient();
    const channel = supabase.channel(`watch-room:${partyId}`, {
      config: { presence: { key: crypto.randomUUID() }, private: true },
    });

    channel.on("presence", { event: "sync" }, () => {
      setCount(Object.keys(channel.presenceState()).length);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      setCount(0);
    };
  }, [partyId, enabled]);

  return count;
}
