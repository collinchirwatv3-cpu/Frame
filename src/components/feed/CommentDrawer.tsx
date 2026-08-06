"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCommentsStore, type Comment } from "@/store/comments-store";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
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
  const allComments = useCommentsStore((s) => s.byVideoId[video.id] ?? EMPTY_COMMENTS);
  const fetchComments = useCommentsStore((s) => s.fetchComments);
  const addComment = useCommentsStore((s) => s.addComment);

  useEffect(() => {
    if (open) fetchComments(video.id);
  }, [open, video.id, fetchComments]);

  useEscapeToClose(open, onClose);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    addComment(video.id, text);
    setDraft("");
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
              {allComments.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <Avatar src={c.avatarUrl} alt={c.author} size={32} />
                  <div>
                    <p className="text-xs text-text-secondary">
                      @{c.author} · {c.timestamp}
                    </p>
                    <p className="text-sm mt-0.5">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={submit}
              className="flex items-center gap-2 px-4 py-3 border-t border-border"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
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
