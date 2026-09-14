"use client";

import { useEffect, useRef } from "react";

/** Follow the visible viewport when the software keyboard resizes or pans it. */
export function ConversationViewport({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      if (!ref.current || viewport.scale !== 1) return;
      ref.current.style.height = `${viewport.height}px`;
      ref.current.style.transform = `translateY(${viewport.offsetTop}px)`;
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="h-dvh flex flex-col overflow-hidden"
      data-testid="conversation-viewport"
      style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
    >
      {children}
    </div>
  );
}
