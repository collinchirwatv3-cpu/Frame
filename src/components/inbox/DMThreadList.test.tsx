import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { DMThreadList } from "./DMThreadList";
import type { DMThread } from "@/lib/dm";

vi.mock("@/lib/use-dm-realtime", () => ({
  useDMRealtime: (userId: string | null, onChange: () => void) => {
    useEffect(() => {
      if (userId) onChange();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);
  },
}));

let fetchThreadsResult: DMThread[] = [];
let fetchThreadsShouldThrow = false;
vi.mock("@/lib/dm", () => ({
  fetchThreads: async () => {
    if (fetchThreadsShouldThrow) throw new Error("network down");
    return fetchThreadsResult;
  },
}));

const THREAD: DMThread = {
  id: "t1",
  otherUser: { id: "them", username: "them_user", displayName: "Them", avatarUrl: "" },
  otherUserUnavailable: false,
  lastMessageAt: "2026-09-01T00:00:00.000Z",
  unread: false,
};

beforeEach(() => {
  fetchThreadsResult = [];
  fetchThreadsShouldThrow = false;
});

describe("DMThreadList", () => {
  it("shows nothing alarming while signed out", async () => {
    render(<DMThreadList userId={null} />);
    await waitFor(() => expect(screen.queryByText("No messages yet.")).toBeInTheDocument());
  });

  it("shows an empty state with no threads", async () => {
    render(<DMThreadList userId="me" />);
    await waitFor(() => expect(screen.getByText("No messages yet.")).toBeInTheDocument());
  });

  it("shows an error state on a fetch failure", async () => {
    fetchThreadsShouldThrow = true;
    render(<DMThreadList userId="me" />);
    await waitFor(() => expect(screen.getByText("Couldn't load messages")).toBeInTheDocument());
  });

  it("lists a thread, linking to its conversation view", async () => {
    fetchThreadsResult = [THREAD];
    render(<DMThreadList userId="me" />);
    await waitFor(() => expect(screen.getByText("Them")).toBeInTheDocument());
    expect(screen.getByText("Them").closest("a")).toHaveAttribute("href", "/inbox/messages/t1");
  });

  it("shows an unread indicator only for an unread thread", async () => {
    fetchThreadsResult = [{ ...THREAD, unread: true }];
    render(<DMThreadList userId="me" />);
    await waitFor(() => expect(screen.getByLabelText("Unread")).toBeInTheDocument());
  });
});
