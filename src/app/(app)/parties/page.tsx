"use client";

import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { fetchParties, type WatchParty } from "@/lib/watch-parties";
import { PartyCard } from "@/components/parties/PartyCard";
import { CreatePartySheet } from "@/components/parties/CreatePartySheet";
import { EmptyState } from "@/components/ui/EmptyState";

export default function PartiesPage() {
  const [parties, setParties] = useState<WatchParty[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  function refresh() {
    fetchParties().then((p) => {
      setParties(p);
      setLoading(false);
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleClose() {
    setCreating(false);
    refresh();
  }

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

      {!loading && parties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <EmptyState
            icon={Users}
            heading="No parties yet"
            subtext="Start one and watch a film together, in perfect sync."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parties.map((party) => (
            <PartyCard key={party.id} party={party} onDeleted={refresh} />
          ))}
        </div>
      )}

      <CreatePartySheet open={creating} onClose={handleClose} />
    </div>
  );
}
