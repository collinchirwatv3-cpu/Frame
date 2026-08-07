"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownRight, Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCommentsStore, type Comment } from "@/store/comments-store";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { cn } from "@/lib/utils";
import type { Video } from "@/lib/types";

const EMPTY_COMMENTS: Comment[] = [];

export function CommentDrawer({
  video,
  open,
  onClose,
}: {
  video: Video;
  open: boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const allComments = useCommentsStore((s) => s.byVideoId[video.id] ?? EMPTY_COMMENTS);
  const fetchComments = useCommentsStore((s) => s.fetchComments);
  const addComment = useCommentsStore((s) => s.addComment);

  useEffect(() => {
    if (open) fetchComments(video.id);
  }, [open, video.id, fetchComments]);

  useEscapeToClose(open, onClose);

  // One level deep: top-level comments in order, each with its own replies
  // (also in order) grouped underneath — mirrors how the reply composer
  // only ever attaches to a top-level comment's id (see comments-store.ts).
  const threads = useMemo(() => {
    const repliesByParent = new Map<string, Comment[]>();
    const topLevel: Comment[] = [];
    for (const c of allComments) {
      if (c.parentId) {
        const list = repliesByParent.get(c.parentId) ?? [];
        list.push(c);
        repliesByParent.set(c.parentId, list);
      } else {
        topLevel.push(c);
      }
    }
    return topLevel.map((comment) => ({ comment, replies: repliesByParent.get(comment.id) ?? [] }));
  }, [allComments]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    addComment(video.id, text, replyingTo?.id);
    setDraft("");
    setReplyingTo(null);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-bg/70 backdrop-blur-sm z-[60]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Comments"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[75vh] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-md md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">{allComments.length} comments</h2>
              <button
                onClick={onClose}
                aria-label="Close comments"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-4 min-h-[120px]">
              {allComments.length === 0 && (
                <p className="text-sm text-text-secondary text-center py-6">
                  No comments yet — be the first.
                </p>
              )}
              {threads.map(({ comment, replies }) => (
                <div key={comment.id} className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar src={comment.avatarUrl} alt={comment.author} size={32} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text-secondary">
                        @{comment.author} · {comment.timestamp}
                      </p>
                      <p className="text-sm mt-0.5">{comment.text}</p>
                      <button
                        onClick={() => setReplyingTo(comment)}
                        className="text-xs text-text-secondary hover:text-accent transition-colors mt-1"
                      >
                        Reply
                      </button>
                    </div>
                  </div>

                  {replies.length > 0 && (
                    <div className="flex flex-col gap-3 pl-9">
                      {replies.map((reply) => (
                        <div key={reply.id} className="flex items-start gap-2.5">
                          <CornerDownRight size={12} className="text-text-secondary shrink-0 mt-1.5" />
                          <Avatar src={reply.avatarUrl} alt={reply.author} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-text-secondary">
                              @{reply.author} · {reply.timestamp}
                            </p>
                            <p className="text-sm mt-0.5">{reply.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <AnimatePresence>
              {replyingTo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between px-5 py-2 border-t border-border bg-bg/50 overflow-hidden"
                >
                  <p className="text-xs text-text-secondary truncate">
                    Replying to <span className="text-accent">@{replyingTo.author}</span>
                  </p>
                  <button
                    onClick={() => setReplyingTo(null)}
                    aria-label="Cancel reply"
                    className="text-xs text-text-secondary hover:text-accent transition-colors shrink-0 ml-2"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form
              onSubmit={submit}
              className={cn(
                "flex items-center gap-2 px-4 py-3",
                // The "Replying to" bar right above already draws this same
                // border — skip a doubled-up line when it's showing.
                !replyingTo && "border-t border-border"
              )}
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={replyingTo ? `Reply to @${replyingTo.author}…` : "Add a comment…"}
                className="flex-1 bg-bg border border-border rounded-full px-4 py-2 text-sm outline-none focus:border-primary transition-colors"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Post comment"
                className="w-9 h-9 rounded-full bg-primary text-bg flex items-center justify-center disabled:opacity-40 shrink-0"
              >
                <Send size={15} />
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
