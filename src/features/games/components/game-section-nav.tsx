"use client";

import { useId, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { layoutTransition } from "@/lib/motion/tokens";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { cn } from "@/lib/utils";

const sections = [
  ["My copy", "my-copy"],
  ["About", "about-game"],
  ["Screenshots", "screenshots"],
  ["Physical edition", "game-packaging"],
  ["Edition contents", "game-release"],
  ["Trailer", "game-trailer"],
] as const;
const supporting = [
  ["Playtime", "game-playtime"],
  ["Personal photos", "game-photos"],
  ["Metadata sources", "game-sources"],
] as const;
function subscribe(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => "";

// Native anchors own navigation/history. Motion only connects selected pills.
export function GameSectionNav() {
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const allowed = useMotionAllowed();
  const scope = useId();
  return (
    <nav
      aria-label="Game sections"
      className="space-y-2"
      data-section-motion={allowed ? "enabled" : "disabled"}
    >
      <div className="flex flex-wrap gap-2 text-sm">
        {sections.map(([label, id]) => {
          const selected = hash === `#${id}`;
          return (
            <a
              key={id}
              href={`#${id}`}
              aria-current={selected ? "location" : undefined}
              className={cn(
                "relative inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-secondary-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected && "underline decoration-2",
              )}
            >
              {selected &&
                (allowed ? (
                  <motion.span
                    key="moving"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-accent"
                    layoutId={`${scope}-section`}
                    initial={false}
                    transition={layoutTransition}
                  />
                ) : (
                  <span
                    key="static"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-accent"
                  />
                ))}
              <span className="relative">{label}</span>
            </a>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-5 text-sm">
        {supporting.map(([label, id]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={hash === `#${id}` ? "location" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center text-link underline underline-offset-4",
              hash === `#${id}` && "decoration-2",
            )}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
