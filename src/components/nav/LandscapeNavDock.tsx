"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems } from "./nav-items";
import { CHROME_FADE_TRANSITION, SHEET_SPRING } from "@/lib/motion";
import { usePlayerStore } from "@/store/player-store";

// Minimum upward drag (px) on the bottom-edge gesture zone before it counts
// as a swipe rather than an incidental touch.
const SWIPE_OPEN_THRESHOLD_PX = 30;
// How long the expanded dock stays up before collapsing back to just the
// handle, if nothing else closes it first.
const DOCK_AUTO_CLOSE_MS = 2500;

// Replaces the old always-visible rail/dropdown: landscape gets a subtle
// bottom-center handle instead of any permanent nav chrome, so a rotated
// phone stays focused on the video. Tapping the handle, swiping up from the
// bottom edge, or Director Mode revealing the UI all open a floating dock
// with the same four destinations as everywhere else (Home/Discover/
// Shorts/Upload — Profile stays reached via the avatar bubble, same as
// SideRail/BottomNav, not added here despite being landscape-specific).
export function LandscapeNavDock() {
  const pathname = usePathname();
  const directorMode = usePlayerStore((s) => s.directorMode);
  const exitDirectorMode = usePlayerStore((s) => s.exitDirectorMode);
  // Sync'd by SwipeFeed/ShortsFeed whenever the active video changes — the
  // dock lives in the app shell, outside either feed, so this is its only
  // window into "the user just swiped to another video."
  const activeId = usePlayerStore((s) => s.activeId);

  const [dockOpen, setDockOpen] = useState(false);
  const dragStartYRef = useRef<number | null>(null);

  // Adjusting state when a store value changes, done as a render-time
  // comparison against a previous value held in state — not a ref, which
  // this project's stricter (React Compiler-aligned) lint rules refuse to
  // let render read or write at all. This is React's own documented
  // pattern for exactly this shape ("Adjusting state when a prop changes"):
  // two setState calls in the same render pass, no extra effect, no
  // synchronous-setState-in-effect violation either since nothing runs
  // inside an effect body.
  const [prevDirectorMode, setPrevDirectorMode] = useState(directorMode);
  if (prevDirectorMode !== directorMode) {
    setPrevDirectorMode(directorMode);
    if (!directorMode) setDockOpen(true); // "Director Mode reveals the UI" opens the dock too
  }
  const [prevActiveId, setPrevActiveId] = useState(activeId);
  if (prevActiveId !== activeId) {
    setPrevActiveId(activeId);
    setDockOpen(false); // swiping to another video closes it immediately
  }

  useEffect(() => {
    if (!dockOpen) return;
    const timer = window.setTimeout(() => setDockOpen(false), DOCK_AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [dockOpen]);

  function onHandlePointerDown(e: React.PointerEvent) {
    dragStartYRef.current = e.clientY;
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    if (dragStartYRef.current === null) return;
    if (dragStartYRef.current - e.clientY > SWIPE_OPEN_THRESHOLD_PX) {
      dragStartYRef.current = null;
      exitDirectorMode();
      setDockOpen(true);
    }
  }
  function onHandlePointerUp() {
    dragStartYRef.current = null;
  }

  return (
    <>
      {/* Oversized invisible hit target for the swipe-up gesture — the
          visible handle below is small (~24px), too thin to reliably catch
          a real thumb swipe, same reasoning as the scrub bar's inflated hit
          area in VideoCard. */}
      <div
        className="hidden landscape:max-md:block fixed inset-x-0 bottom-0 h-10 z-30 touch-none"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      />

      <motion.button
        onClick={() => {
          if (directorMode) exitDirectorMode();
          setDockOpen((v) => !v);
        }}
        animate={{ opacity: directorMode || dockOpen ? 0 : 0.45 }}
        transition={CHROME_FADE_TRANSITION}
        aria-label={dockOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={dockOpen}
        className="hidden landscape:max-md:flex fixed inset-x-0 bottom-1 z-40 mx-auto w-11 h-11 items-center justify-center"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <ChevronUp size={24} className="w-6" />
      </motion.button>

      <AnimatePresence>
        {dockOpen && !directorMode && (
          <motion.div
            role="navigation"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={SHEET_SPRING}
            className="hidden landscape:max-md:flex fixed inset-x-0 bottom-0 z-40 h-[88px] items-center justify-center gap-8 rounded-t-2xl border-t border-white/10 bg-black/70 backdrop-blur-xl shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setDockOpen(false)}
                  aria-label={label}
                  className="flex items-center justify-center w-11 h-11"
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.75}
                    className={cn("transition-colors", active ? "text-accent" : "text-white/70")}
                  />
                </Link>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
