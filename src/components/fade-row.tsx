"use client";

import { motion, useReducedMotion } from "framer-motion";

const STEP = 0.03;
const MAX_STAGGERED = 20; // later rows share the last delay so a long page doesn't crawl in

/** Table row that fades in, each a beat after the one above it. */
export function FadeRow({ index, className, children }: { index: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.tr
      className={className}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index, MAX_STAGGERED) * STEP }}
    >
      {children}
    </motion.tr>
  );
}
