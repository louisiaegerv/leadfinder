"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** A bar that grows from zero to `pct` percent of its track on mount. Put it inside a `h-1.5` track. */
export function AnimatedBar({ pct, className, delay = 0 }: { pct: number; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const width = `${Math.max(0, Math.min(100, pct))}%`;
  return (
    <motion.div
      className={cn("h-full rounded-full bg-primary", className)}
      initial={reduce ? false : { width: 0 }}
      animate={{ width }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    />
  );
}
