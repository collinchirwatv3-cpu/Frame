"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { fetchParties, fetchMyParties, fetchFollowedParties, type WatchParty } from "@/lib/watch-parties";
import { PartyCard } from "@/components/parties/PartyCard";
import { CreatePartySheet } from "@/components/parties/CreatePartySheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCurrentUserStore } from "@/store/current-user-store";

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
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function refresh() {
    Promise.all([
      userId ? fetchMyParties(userId) : Promise.resolve([]),
      userId ? fetchFollowedParties(userId) : Promise.resolve([]),
      fetchParties(),
    ]).then(([mine, followed, everyone]) => {
      setMyParties(mine);
      setFollowedParties(followed);
      setPublicParties(everyone);
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
    // refresh is a plain function recreated every render (not memoized) —
    // re-running this effect only on userId change (once AuthListener
    // resolves the signed-in profile) is the actual intent, matching this
    // page's original single-fetch shape before the per-user sections existed.
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
          <p className="text-text-secondary text-sm mt-1">Watch together, in perfect sync.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          aria-label="New party"
          className="w-11 h-11 rounded-full bg-card flex items-center justify-center shrink-0"
        >
          <Plus size={20} />
        </button>
      </div>

      {!loading && isEmpty ? (
        <div className="flex flex-col items-center justify-center pt-12 pb-[calc(env(safe-area-inset-bottom)+6rem)]">
          <EmptyState
            icon={Users}
            heading="No parties yet"
            subtext="Start one and watch a film together, in perfect sync."
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
