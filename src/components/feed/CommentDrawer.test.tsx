import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
// No global setupFiles entry exists in vitest.config.mts (no other test in
// this repo renders a component) — importing jest-dom's matchers here
// directly rather than touching the shared config for one new test file.
import "@testing-library/jest-dom/vitest";
import { CommentDrawer } from "./CommentDrawer";
import { useCommentsStore } from "@/store/comments-store";
import type { Video } from "@/lib/types";

// First component test in this repo — no existing .test.tsx pattern to
// follow. Rather than mocking @/lib/supabase/client (comments-store.test.ts's
// approach, needed there because it's testing the store's own Supabase
// calls), this replaces the store's action functions directly with spies
// via setState — comments-store.test.ts already establishes that a zustand
// store's actions are just state fields, safely overridable the same way
// its data is. Sidesteps needing a working Supabase mock entirely, since
// what's under test here is CommentDrawer's rendering/grouping logic, not
// the store's fetch/insert behavior (already covered separately).

const video: Video = {
  id: "v1",
  creator: {
    id: "c1",
    username: "milo_aerial",
    displayName: "Milo",
    avatarUrl: "",
    bannerUrl: "",
    bio: "",
    followers: 0,
    following: 0,
    totalViews: 0,
  },
  playbackUrl: "",
  posterUrl: "",
  title: "Iceland, from 400ft",
  description: "",
  category: "Travel",
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  durationSeconds: 34,
  width: 1920,
  height: 1080,
};

const topLevel = {
  id: "cmt-1",
  author: "reddrift",
  avatarUrl: "",
  text: "The color grade on this is insane",
  timestamp: "2h",
  parentId: null,
};
const reply = {
  id: "reply-1",
  author: "auroraok",
  avatarUrl: "",
  text: "Which drone did you fly this on?",
  timestamp: "1h",
  parentId: "cmt-1",
};

let addCommentSpy: (videoId: string, text: string, parentId?: string) => Promise<void>;

beforeEach(() => {
  addCommentSpy = vi.fn().mockResolvedValue(undefined);
  useCommentsStore.setState({
    byVideoId: { v1: [topLevel, reply] },
    loadingVideoId: null,
    fetchComments: vi.fn(),
    addComment: addCommentSpy,
  });
});

describe("CommentDrawer — threading", () => {
  it("groups a reply under its top-level comment, indented", () => {
    render(<CommentDrawer video={video} open onClose={() => {}} />);

    expect(screen.getByText("The color grade on this is insane")).toBeInTheDocument();
    const replyText = screen.getByText("Which drone did you fly this on?");
    expect(replyText).toBeInTheDocument();
    // Replies render inside the pl-9 indented wrapper, not as siblings of
    // top-level comments — walk up to confirm the grouping container.
    expect(replyText.closest(".pl-9")).not.toBeNull();
  });

  it("gives a top-level comment a Reply button but never a reply its own", () => {
    render(<CommentDrawer video={video} open onClose={() => {}} />);
    // Exactly one "Reply" action exists — for the top-level comment. If
    // single-level nesting were ever violated (a reply rendering its own
    // Reply button), this count would be 2.
    expect(screen.getAllByText("Reply")).toHaveLength(1);
  });

  it("clicking Reply shows a 'Replying to' bar naming the right author", () => {
    render(<CommentDrawer video={video} open onClose={() => {}} />);
    fireEvent.click(screen.getByText("Reply"));
    expect(screen.getByText("@reddrift")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Reply to @reddrift…")).toBeInTheDocument();
  });

  it("Cancel clears the reply target back to a normal top-level composer", () => {
    render(<CommentDrawer video={video} open onClose={() => {}} />);
    fireEvent.click(screen.getByText("Reply"));
    fireEvent.click(screen.getByLabelText("Cancel reply"));
    expect(screen.getByPlaceholderText("Add a comment…")).toBeInTheDocument();
  });

  it("submitting while replying calls addComment with the parent's id", () => {
    render(<CommentDrawer video={video} open onClose={() => {}} />);
    fireEvent.click(screen.getByText("Reply"));

    const input = screen.getByPlaceholderText("Reply to @reddrift…");
    fireEvent.change(input, { target: { value: "Mavic 3, I think" } });
    fireEvent.click(screen.getByLabelText("Post comment"));

    expect(addCommentSpy).toHaveBeenCalledWith("v1", "Mavic 3, I think", "cmt-1");
  });

  it("submitting a normal (non-reply) comment passes no parentId", () => {
    render(<CommentDrawer video={video} open onClose={() => {}} />);

    const input = screen.getByPlaceholderText("Add a comment…");
    fireEvent.change(input, { target: { value: "Nice edit" } });
    fireEvent.click(screen.getByLabelText("Post comment"));

    expect(addCommentSpy).toHaveBeenCalledWith("v1", "Nice edit", undefined);
  });

  it("shows the empty state when there are no comments at all", () => {
    useCommentsStore.setState({ byVideoId: { v1: [] } });
    render(<CommentDrawer video={video} open onClose={() => {}} />);
    expect(screen.getByText("No comments yet — be the first.")).toBeInTheDocument();
  });
});
