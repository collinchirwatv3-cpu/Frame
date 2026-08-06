"use client";

import { useEffect } from "react";

/** Every full-screen sheet/modal in the app shared the same gap: no
 * keyboard way to close, no role="dialog"/aria-modal for screen readers.
 * This covers the keyboard half — Escape closes whichever one is open,
 * matching standard dialog behavior. */
export function useEscapeToClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
}
