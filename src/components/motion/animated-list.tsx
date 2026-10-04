"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { layoutTransition } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export function AnimatedList({
  items,
  label,
  className,
}: {
  items: readonly { id: string; content: ReactNode }[];
  label: string;
  className?: string;
}) {
  const allowed = useMotionAllowed();
  return (
    <ul aria-label={label} className={cn("space-y-3", className)}>
      {items.map(({ id, content }) => (
        <motion.li
          key={id}
          layout={allowed ? "position" : false}
          initial={false}
          transition={layoutTransition}
          className="motion-list-entry"
          data-motion-layout={allowed ? "enabled" : "disabled"}
        >
          {content}
        </motion.li>
      ))}
    </ul>
  );
}
