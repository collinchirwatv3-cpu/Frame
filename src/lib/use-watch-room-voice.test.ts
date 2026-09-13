import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_VOICE_PARTICIPANTS, useWatchRoomVoice } from "./use-watch-room-voice";
import type { Participant } from "./use-watch-room";

// jsdom has no real WebRTC/Web Audio implementation — these fakes cover
// exactly the surface use-watch-room-voice.ts touches, same "mock the
// module, not the network" spirit as use-watch-room.test.ts's fake
// Realtime channel (which this file re-creates locally rather than
// importing, since that file doesn't export it).
let lastPeerConnections: FakePeerConnection[] = [];

// A plain class, not vi.fn(() => ...) — vi.fn() wrapping an arrow function
// can't be invoked with `new` ("is not a constructor"), and
// use-watch-room-voice.ts calls `new RTCPeerConnection(...)` directly.
class FakePeerConnection {
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;
  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  closed = false;
  tracksAdded: unknown[] = [];

  constructor() {
    lastPeerConnections.push(this);
  }

  addTrack = vi.fn((track: unknown) => {
    this.tracksAdded.push(track);
  });
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "fake-offer-sdp" }));
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "fake-answer-sdp" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn(() => {
    this.closed = true;
  });
}

class FakeAudioContext {
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
  createAnalyser() {
    return { fftSize: 512, getByteTimeDomainData: vi.fn() };
  }
  close = vi.fn(async () => {});
}

type Handler = (arg: { payload: unknown }) => void;

function createFakeChannel() {
  const handlers = new Map<string, Handler>();
  const sent: { event: string; payload: unknown }[] = [];
  return {
    on(type: string, filter: { event: string }, cb: Handler) {
      handlers.set(`${type}:${filter.event}`, cb);
      return this;
    },
    send: vi.fn((msg: { event: string; payload: unknown }) => {
      sent.push({ event: msg.event, payload: msg.payload });
    }),
    _fire(type: string, event: string, payload: unknown) {
      handlers.get(`${type}:${event}`)?.({ payload });
    },
    _sent: sent,
  };
}

function participant(id: string, joinedAt: number): Participant {
  return { id, joinedAt, profileId: id, username: id, displayName: id, avatarUrl: "" };
}

let getUserMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  lastPeerConnections = [];
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());

  getUserMediaMock = vi.fn(async () => ({
    getTracks: () => [{ stop: vi.fn() }],
    getAudioTracks: () => [{ enabled: true }],
  }));
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: getUserMediaMock } });
});

describe("useWatchRoomVoice — joining", () => {
  it("requests the microphone and transitions idle -> requesting -> live", async () => {
    const channel = createFakeChannel();
    const { result } = renderHook(() =>
      useWatchRoomVoice(channel as never, "self-id", [participant("self-id", 100)], false)
    );
    expect(result.current.phase).toBe("idle");

    act(() => result.current.join());
    expect(result.current.phase).toBe("requesting");

    await waitFor(() => expect(result.current.phase).toBe("live"));
  });

  it("reports denied when getUserMedia rejects", async () => {
    getUserMediaMock.mockRejectedValueOnce(new Error("Permission denied"));
    const channel = createFakeChannel();
    const { result } = renderHook(() =>
      useWatchRoomVoice(channel as never, "self-id", [participant("self-id", 100)], false)
    );

    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("denied"));
    expect(result.current.errorMessage).toContain("Permission denied");
  });

  it("blocks joining past the soft participant cap instead of degrading silently", () => {
    const many = Array.from({ length: MAX_VOICE_PARTICIPANTS + 2 }, (_, i) => participant(`p${i}`, i));
    const channel = createFakeChannel();
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "p0", many, false));

    act(() => result.current.join());
    expect(result.current.phase).toBe("full");
    expect(getUserMediaMock).not.toHaveBeenCalled();
  });
});

describe("useWatchRoomVoice — initiator direction and signaling", () => {
  it("the earlier-joined peer initiates an offer, the later one waits", async () => {
    const channel = createFakeChannel();
    const early = participant("early", 100);
    const late = participant("late", 200);

    const { result, rerender } = renderHook(
      ({ participants }: { participants: Participant[] }) => useWatchRoomVoice(channel as never, "early", participants, false),
      { initialProps: { participants: [early] } }
    );
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    // Now "late" appears in the room — early should initiate to them.
    rerender({ participants: [early, late] });

    await waitFor(() =>
      expect(channel._sent.some((m) => m.event === "voice-offer" && (m.payload as { to: string }).to === "late")).toBe(
        true
      )
    );
  });

  it("discards a voice-offer not addressed to this client", async () => {
    const channel = createFakeChannel();
    const { result } = renderHook(() =>
      useWatchRoomVoice(channel as never, "self-id", [participant("self-id", 100), participant("other", 50)], false)
    );
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    act(() => {
      channel._fire("broadcast", "voice-offer", { from: "other", to: "someone-else", sdp: "x" });
    });

    expect(channel._sent.some((m) => m.event === "voice-answer")).toBe(false);
  });

  it("answers a voice-offer addressed to this client", async () => {
    const channel = createFakeChannel();
    const { result } = renderHook(() =>
      useWatchRoomVoice(channel as never, "self-id", [participant("self-id", 100), participant("other", 50)], false)
    );
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    await act(async () => {
      channel._fire("broadcast", "voice-offer", { from: "other", to: "self-id", sdp: "fake-remote-offer" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      channel._sent.some((m) => m.event === "voice-answer" && (m.payload as { to: string }).to === "other")
    ).toBe(true);
  });
});

describe("useWatchRoomVoice — mute enforcement", () => {
  it("complies with a mute-request from the current host", async () => {
    const channel = createFakeChannel();
    // joinedAt 50 is earliest -> "host-id" is host.
    const participants = [participant("host-id", 50), participant("self-id", 100)];
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "self-id", participants, false));
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    act(() => {
      channel._fire("broadcast", "mute-request", { from: "host-id", to: "self-id" });
    });

    expect(result.current.localMuted).toBe(true);
    expect(
      channel._sent.some(
        (m) => m.event === "mute-state" && (m.payload as { participantId: string; muted: boolean }).muted === true
      )
    ).toBe(true);
  });

  it("ignores a mute-request from a non-host participant", async () => {
    const channel = createFakeChannel();
    const participants = [participant("host-id", 50), participant("self-id", 100), participant("impostor", 150)];
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "self-id", participants, false));
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    act(() => {
      channel._fire("broadcast", "mute-request", { from: "impostor", to: "self-id" });
    });

    expect(result.current.localMuted).toBe(false);
  });

  it("ignores a mute-request addressed to someone else", async () => {
    const channel = createFakeChannel();
    const participants = [participant("host-id", 50), participant("self-id", 100)];
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "self-id", participants, false));
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    act(() => {
      channel._fire("broadcast", "mute-request", { from: "host-id", to: "someone-else" });
    });

    expect(result.current.localMuted).toBe(false);
  });

  it("requestMute is a no-op for a non-host caller", () => {
    const channel = createFakeChannel();
    const participants = [participant("self-id", 50), participant("target", 100)];
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "self-id", participants, false));

    act(() => result.current.requestMute("target"));

    expect(channel._sent.some((m) => m.event === "mute-request")).toBe(false);
  });

  it("requestMute sends a targeted mute-request when called by the host", () => {
    const channel = createFakeChannel();
    const participants = [participant("self-id", 50), participant("target", 100)];
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "self-id", participants, true));

    act(() => result.current.requestMute("target"));

    expect(
      channel._sent.some(
        (m) =>
          m.event === "mute-request" &&
          (m.payload as { from: string; to: string }).from === "self-id" &&
          (m.payload as { from: string; to: string }).to === "target"
      )
    ).toBe(true);
  });

  it("requestMuteAll is a no-op for a non-host caller", () => {
    const channel = createFakeChannel();
    const { result } = renderHook(() =>
      useWatchRoomVoice(channel as never, "self-id", [participant("self-id", 50)], false)
    );

    act(() => result.current.requestMuteAll());

    expect(channel._sent.some((m) => m.event === "mute-request")).toBe(false);
  });

  it("requestMuteAll sends one mute-request per currently voice-connected peer", async () => {
    const channel = createFakeChannel();
    // self joins latest -> p1/p2 (earlier) each initiate an offer to self.
    const participants = [participant("p1", 50), participant("p2", 100), participant("self-id", 200)];
    const { result } = renderHook(() => useWatchRoomVoice(channel as never, "self-id", participants, true));
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    await act(async () => {
      channel._fire("broadcast", "voice-offer", { from: "p1", to: "self-id", sdp: "offer-1" });
      channel._fire("broadcast", "voice-offer", { from: "p2", to: "self-id", sdp: "offer-2" });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Simulate both remote tracks actually arriving — requestMuteAll only
    // targets peers this hook considers voice-connected (remoteStreams).
    const fakeStream = { getAudioTracks: () => [] } as unknown as MediaStream;
    act(() => {
      for (const pc of lastPeerConnections) pc.ontrack?.({ streams: [fakeStream] });
    });

    act(() => result.current.requestMuteAll());

    const muteTargets = channel._sent
      .filter((m) => m.event === "mute-request")
      .map((m) => (m.payload as { to: string }).to)
      .sort();
    expect(muteTargets).toEqual(["p1", "p2"]);
  });

  it("tracks mute-state broadcasts from other participants for the UI", async () => {
    const channel = createFakeChannel();
    const { result } = renderHook(() =>
      useWatchRoomVoice(channel as never, "self-id", [participant("self-id", 100)], false)
    );
    act(() => result.current.join());
    await waitFor(() => expect(result.current.phase).toBe("live"));

    act(() => {
      channel._fire("broadcast", "mute-state", { participantId: "other", muted: true });
    });
    expect(result.current.mutedParticipants.has("other")).toBe(true);

    act(() => {
      channel._fire("broadcast", "mute-state", { participantId: "other", muted: false });
    });
    expect(result.current.mutedParticipants.has("other")).toBe(false);
  });
});
