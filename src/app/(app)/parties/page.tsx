"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { fetchParties, fetchMyParties, fetchFollowedParties, type WatchParty } from "@/lib/watch-parties";
import { PartyCard } from "@/components/parties/PartyCard";
import { CreatePartySheet } from "@/components/parties/CreatePartySheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCurrentUserStore } from "@/store/current-user-store";

/** Mirrors PartySection's own layout (an uppercase label + a grid of
 * cards) so loading doesn't reflow into the eventual content. */
function PartiesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {[0, 1].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-40" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PartySection({
  title,
  parties,
  onDeleted,
}: {
  title: string;
  parties: WatchParty[];
  onDeleted: () => void;
}) {
  if (parties.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {parties.map((party) => (
          <PartyCard key={party.id} party={party} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}

export default function PartiesPage() {
  const userId = useCurrentUserStore((s) => s.profile?.id ?? null);
  const [myParties, setMyParties] = useState<WatchParty[]>([]);
  const [followedParties, setFollowedParties] = useState<WatchParty[]>([]);
  const [publicParties, setPublicParties] = useState<WatchParty[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [creating, setCreating] = useState(false);

  // Split so the effect below never calls setState synchronously in its own
  // body (React Compiler flags that): load() just fetches and reports the
  // outcome from its .then/.catch callbacks, which is fine. refresh() adds
  // the synchronous reset to "loading" on top, for the real event handlers
  // (a party being deleted, the create sheet closing) where showing that
  // reset immediately is good feedback — status already starts "loading" on
  // mount, so the effect's first run doesn't need it anyway.
  function load() {
    Promise.all([
      userId ? fetchMyParties(userId) : Promise.resolve([]),
      userId ? fetchFollowedParties(userId) : Promise.resolve([]),
      fetchParties(),
    ])
      .then(([mine, followed, everyone]) => {
        setMyParties(mine);
        setFollowedParties(followed);
        setPublicParties(everyone);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  function refresh() {
    setStatus("loading");
    load();
  }

  useEffect(() => {
    load();
    // load (and refresh) are plain functions recreated every render (not
    // memoized) — re-running this effect only on userId change (once
    // AuthListener resolves the signed-in profile) is the actual intent,
    // matching this page's original single-fetch shape before the per-user
    // sections existed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function handleClose() {
    setCreating(false);
    refresh();
  }

  const isEmpty = myParties.length === 0 && followedParties.length === 0 && publicParties.length === 0;

  return (
    <div className="pt-8 pb-24 px-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Frame Parties</h1>
          <p className="text-text-secondary text-sm mt-1">Watch a Frame together, in perfect sync.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          aria-label="New party"
          className="w-11 h-11 rounded-full bg-card flex items-center justify-center shrink-0"
        >
          <Plus size={20} />
        </button>
      </div>

      {status === "loading" ? (
        <PartiesSkeleton />
      ) : status === "error" ? (
        <div className="flex flex-col items-center justify-center pt-12 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
          <ErrorState onRetry={refresh} heading="Couldn't load Parties" />
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center justify-center pt-12 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
          <EmptyState
            icon={Users}
            heading="No parties yet"
            subtext="Start one and watch a Frame together, in perfect sync."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <PartySection title="Your parties" parties={myParties} onDeleted={refresh} />
          <PartySection title="From people you follow" parties={followedParties} onDeleted={refresh} />
          <PartySection title="All public parties" parties={publicParties} onDeleted={refresh} />
        </div>
      )}

      <CreatePartySheet open={creating} onClose={handleClose} />
    </div>
  );
}
