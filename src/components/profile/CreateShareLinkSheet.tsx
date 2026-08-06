"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Eye, Link2, X } from "lucide-react";
import { cn, shareContent } from "@/lib/utils";
import { formatRelativeExpiry, getShareLinkStatus, TTL_LABEL } from "@/lib/share-links";
import { useShareLinksStore } from "@/store/share-links-store";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import type { ShareLinkTTL, Video } from "@/lib/types";

const TTL_OPTIONS: ShareLinkTTL[] = ["1h", "24h", "7d"];

function statusColor(status: "active" | "expired" | "revoked") {
  if (status === "active") return "text-primary";
  return "text-text-secondary";
}

export function CreateShareLinkSheet({
  video,
  open,
  onClose,
}: {
  video: Video;
  open: boolean;
  onClose: () => void;
}) {
  const [ttl, setTtl] = useState<ShareLinkTTL>("24h");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const createLink = useShareLinksStore((s) => s.createLink);
  const revokeLink = useShareLinksStore((s) => s.revokeLink);
  const allLinks = useShareLinksStore((s) => s.links);
  const links = useMemo(
    () => allLinks.filter((l) => l.videoId === video.id),
    [allLinks, video.id]
  );

  useEscapeToClose(open, onClose);

  async function handleCreate() {
    const link = createLink(video.id, ttl);
    const url = `${window.location.origin}/s/${link.token}`;
    const result = await shareContent({ title: video.title, url });
    if (result === "copied" || result === "shared") {
      setCopiedToken(link.token);
      window.setTimeout(() => setCopiedToken((t) => (t === link.token ? null : t)), 1600);
    }
  }

  async function handleCopy(token: string) {
    const url = `${window.location.origin}/s/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      window.setTimeout(() => setCopiedToken((t) => (t === token ? null : t)), 1600);
    } catch {
      // clipboard denied — silently ignore, the link is still visible on screen to copy manually
    }
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
            aria-label="Create a private share link"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-md md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border overflow-y-auto"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold truncate pr-4">Share “{video.title}”</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-bg transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium text-text-secondary mb-2">Link expires after</p>
                <div className="flex gap-2">
                  {TTL_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => setTtl(option)}
                      className={cn(
                        "flex-1 py-2 rounded-full text-xs font-semibold border transition-colors",
                        ttl === option
                          ? "bg-primary text-bg border-primary"
                          : "border-border text-text-secondary hover:text-accent"
                      )}
                    >
                      {TTL_LABEL[option]}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCreate}
                className="w-full py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Link2 size={15} /> Create link
              </button>

              {links.length > 0 && (
                <div className="pt-2 border-t border-border flex flex-col gap-2.5">
                  <p className="text-xs font-medium text-text-secondary">Links for this video</p>
                  {links.map((link) => {
                    const status = getShareLinkStatus(link);
                    return (
                      <div
                        key={link.token}
                        className="flex items-center justify-between gap-2 bg-bg border border-border rounded-xl px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono truncate">/s/{link.token}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-secondary">
                            <span className={cn("font-semibold capitalize", statusColor(status))}>
                              {status}
                            </span>
                            <span>·</span>
                            <span>
                              {status === "active" ? formatRelativeExpiry(link.expiresAt) : ""}
                              {status !== "active" &&
                                new Date(link.expiresAt).toLocaleDateString()}
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Eye size={11} /> {link.viewCount}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {status === "active" && (
                            <>
                              <button
                                onClick={() => handleCopy(link.token)}
                                aria-label="Copy link"
                                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-card transition-colors"
                              >
                                {copiedToken === link.token ? (
                                  <Check size={14} className="text-primary" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                              <button
                                onClick={() => revokeLink(link.token)}
                                className="text-xs font-medium text-primary px-2 py-1.5 rounded-full hover:bg-card transition-colors"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
