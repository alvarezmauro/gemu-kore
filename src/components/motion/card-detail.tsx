"use client";

import { useId, type ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { layoutTransition } from "@/lib/motion/tokens";

export function CardDetailScope({ children }: { children: ReactNode }) {
  const scope = useId();
  return <LayoutGroup id={scope}>{children}</LayoutGroup>;
}

export function SharedMedia({
  identity,
  children,
  className,
}: {
  identity: string;
  children: ReactNode;
  className?: string;
}) {
  const allowed = useMotionAllowed();
  return (
    <motion.div
      layoutId={allowed ? identity : undefined}
      initial={false}
      transition={layoutTransition}
      className={className}
      data-motion-shared={allowed ? "enabled" : "disabled"}
    >
      {children}
    </motion.div>
  );
}

// Fixed/portal surfaces need a root that accounts for the page scroll offset.
// Compose with DialogContent asChild; put the close control inside this element.
export function SharedLayoutRoot({
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div {...props} layoutRoot initial={false}>
      {children}
    </motion.div>
  );
}
