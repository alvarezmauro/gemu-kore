"use client";
import { useEffect, useRef } from "react";
import { animate } from "motion/react";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { motionEase, motionTiming } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";
const format = (value: number) => Math.round(value).toLocaleString("en-US");
// Adapted Magic UI Number Ticker: https://magicui.design/docs/components/number-ticker
// Actual values are readable in server HTML and by assistive technology throughout.
// A finite tween replaces the registry spring/delay and never gates the value.
export function NumberTicker({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    previous = useRef(0);
  const allowed = useMotionAllowed();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const final = format(value);
    if (!allowed) {
      node.textContent = final;
      return;
    }
    let active = true;
    const playback = animate(previous.current, value, {
      duration: motionTiming.enter / 1000,
      ease: motionEase,
      onUpdate: (latest) => {
        if (active) node.textContent = format(latest);
      },
    });
    previous.current = value;
    return () => {
      active = false;
      playback.stop();
      node.textContent = final;
    };
  }, [value, allowed]);
  return (
    <span
      className={cn("tabular-nums", className)}
      data-number-ticker
      data-ticker-motion={allowed ? "enabled" : "disabled"}
    >
      <span className="sr-only">{format(value)}</span>
      <span ref={ref} aria-hidden="true">
        {format(value)}
      </span>
    </span>
  );
}
