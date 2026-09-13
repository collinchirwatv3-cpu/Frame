import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ParticipantsPanel } from "./ParticipantsPanel";
import type { Participant } from "@/lib/use-watch-room";

// Regression coverage: the Host crown badge used to be computed from
// participants[0] — the sync-authority participant (whoever's presence has
// been tracked longest), not the party's real database host_id. Those can
// legitimately be different people (e.g. after the real host reconnects
// and is no longer the earliest-tracked presence), which would move the
// crown onto the wrong participant. This now takes the real host id as an
// explicit prop and matches on profileId (the stable, real user id) rather
// than participant.id (an ephemeral per-connection presence key).
const REAL_HOST: Participant = {
  id: "presence-key-1",
  profileId: "profile-host",
  username: "director",
  displayName: "The Director",
  avatarUrl: "",
  joinedAt: 2000, // joined LATER than the other participant below
};

const EARLIEST_JOINER: Participant = {
  id: "presence-key-2",
  profileId: "profile-guest",
  username: "guest_watcher",
  displayName: "Guest Watcher",
  avatarUrl: "",
  joinedAt: 1000, // joined FIRST — sync authority, but not the real host
};

function renderPanel(overrides: Partial<Parameters<typeof ParticipantsPanel>[0]> = {}) {
  return render(
    <ParticipantsPanel
      participants={[EARLIEST_JOINER, REAL_HOST]}
      selfId="presence-key-2"
      realHostId="profile-host"
      isHost={false}
      voiceConnectedIds={new Set()}
      mutedParticipants={new Set()}
      speakingIds={new Set()}
      onRequestMute={vi.fn()}
      onRequestMuteAll={vi.fn()}
      {...overrides}
    />
  );
}

describe("ParticipantsPanel host badge", () => {
  it("shows the crown on the real host, not on whoever joined earliest", () => {
    renderPanel();
    const hostRow = screen.getByText("The Director").closest("div");
    const guestRow = screen.getByText("Guest Watcher").closest("div");
    expect(hostRow?.querySelector('[aria-label="Host"]')).toBeInTheDocument();
    expect(guestRow?.querySelector('[aria-label="Host"]')).not.toBeInTheDocument();
  });

  it("shows no crown at all when there is no real host (an ad-hoc room)", () => {
    renderPanel({ realHostId: null });
    expect(screen.queryByLabelText("Host")).not.toBeInTheDocument();
  });

  it("still shows the participant count heading", () => {
    renderPanel();
    expect(screen.getByText("Participants (2)")).toBeInTheDocument();
  });
});
