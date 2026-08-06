"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useEscapeToClose } from "@/lib/use-escape-to-close";

const CONFIRM_PHRASE = "DELETE";

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    if (deleting) return;
    setConfirmText("");
    setError("");
    onClose();
  }

  useEscapeToClose(open, handleClose);

  async function handleDelete() {
    setDeleting(true);
    setError("");

    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || "Could not delete your account. Try again.");
      }

      // The account (and its session) is already gone server-side — this
      // just clears the client's local copy of it before leaving.
      const supabase = createClient();
      await supabase.auth.signOut().catch(() => {});
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
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
            onClick={handleClose}
            className="fixed inset-0 bg-bg/70 backdrop-blur-sm z-[60]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Delete your account"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-x-0 bottom-0 z-[61] flex flex-col bg-card border-t border-border rounded-t-2xl md:max-w-sm md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)" }}
          >
            <div className="flex flex-col items-center text-center gap-2 px-6 pt-6 pb-2">
              <span className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <AlertTriangle size={20} />
              </span>
              <h2 className="text-base font-semibold">Delete your account?</h2>
              <p className="text-sm text-text-secondary">
                This permanently deletes your profile, videos, likes, comments, and follows.
                This can&apos;t be undone.
              </p>
            </div>

            <div className="px-6 pt-4 flex flex-col gap-2">
              <label htmlFor="delete-confirm" className="text-xs text-text-secondary">
                Type <span className="font-semibold text-accent">{CONFIRM_PHRASE}</span> to
                confirm
              </label>
              <input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={deleting}
                autoComplete="off"
                className="bg-bg border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary transition-colors disabled:opacity-50"
              />
              {error && (
                <p role="alert" className="text-xs text-primary">
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3 px-6 pt-5">
              <button
                type="button"
                onClick={handleClose}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-bg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || confirmText !== CONFIRM_PHRASE}
                className="flex-1 py-2.5 rounded-full bg-primary text-bg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {deleting && <Loader2 size={16} className="animate-spin" />}
                {deleting ? "Deleting…" : "Delete account"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
