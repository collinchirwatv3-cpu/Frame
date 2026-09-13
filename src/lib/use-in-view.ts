"use client";

import { useEffect, useRef, useState } from "react";

/** Whether the ref'd element is currently visible in the viewport — a live
 * boolean (not a one-time "has been seen" flag). Built for
 * use-party-presence-count.ts, which opens an actual realtime subscription
 * while a party card is in view and tears it down once it scrolls away —
 * a "has this ever been seen" flag would leave every card's subscription
 * open forever on a long list, defeating the point. rootMargin starts the
 * subscription slightly before the card is fully on-screen so the count
 * isn't visibly still loading the moment it appears. */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false), {
      rootMargin: "200px",
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}
