"use client";

import { motion, useReducedMotion } from "framer-motion";

export function PausedWatermark({ visible }: { visible: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      data-paused-watermark={visible}
      initial={false}
      animate={{ opacity: visible ? 0.15 : 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      className="pointer-events-none absolute select-none pl-[0.14em] text-[clamp(2.5rem,10vw,7.5rem)] font-semibold leading-none tracking-[0.14em] text-white"
    >
      FRAMES
    </motion.span>
  );
}
