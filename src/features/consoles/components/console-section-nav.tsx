"use client";

import { useId, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { layoutTransition } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

const sections = [
  ["my-console-title", "My Console"],
  ["console-catalog-title", "Console Information"],
  ["console-specifications-title", "Technical Specifications"],
  ["console-gallery-title", "Gallery"],
] as const;
function subscribe(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => "";

// Normal anchors work before hydration. Only the selected-section treatment moves.
export function ConsoleSectionNav() {
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const allowed = useMotionAllowed();
  const scope = useId();
  return (
    <nav
      aria-label="Console page sections"
      className="flex flex-wrap gap-2"
      data-section-motion={allowed ? "enabled" : "disabled"}
    >
      {sections.map(([id, name]) => {
        const selected = hash === `#${id}`;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={selected ? "location" : undefined}
            className={cn(
              "relative inline-flex min-h-11 items-center rounded-full px-4 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              !selected && "bg-muted",
            )}
          >
            {selected && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-accent"
                layoutId={allowed ? `${scope}-section` : undefined}
                initial={false}
                transition={layoutTransition}
              />
            )}
            <span className="relative inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block size-1.5 shrink-0 rounded-full bg-current",
                  !selected && "invisible",
                )}
              />
              {name}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
