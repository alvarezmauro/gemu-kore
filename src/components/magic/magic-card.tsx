"use client";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";

const query = "(hover: hover) and (pointer: fine)";
function subscribe(change: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", change);
  return () => media?.removeEventListener("change", change);
}
const finePointer = () => window.matchMedia?.(query).matches ?? false;
const serverPointer = () => false;
// Adapted Magic UI spotlight: https://magicui.design/docs/components/magic-card
// A neutral 5% surface highlight; no movement, hidden content or perpetual loop.
export function MagicCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const allowed = useMotionAllowed();
  const fine = useSyncExternalStore(subscribe, finePointer, serverPointer);
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const background = useMotionTemplate`radial-gradient(160px circle at ${x}px ${y}px, color-mix(in oklch, var(--foreground) 5%, transparent), transparent 70%)`;
  return (
    <div
      className={cn("relative h-full min-w-0 rounded-xl bg-card", className)}
      onPointerMove={
        allowed && fine
          ? (event) => {
              if (event.pointerType !== "mouse") return;
              const rect = event.currentTarget.getBoundingClientRect();
              x.set(event.clientX - rect.left);
              y.set(event.clientY - rect.top);
            }
          : undefined
      }
      onPointerLeave={() => {
        x.set(-1000);
        y.set(-1000);
      }}
    >
      {allowed && fine && (
        <motion.div
          aria-hidden="true"
          data-magic-spotlight
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background }}
        />
      )}
      <div className="relative h-full">{children}</div>
    </div>
  );
}
