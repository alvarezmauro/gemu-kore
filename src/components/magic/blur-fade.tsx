"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useAnimate, useInView, type UseInViewOptions } from "motion/react";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { motionEase, motionTiming } from "@/lib/motion/tokens";

// Adapted from Magic UI Blur Fade. Server HTML is fully visible; animation is
// an optional enhancement, never the condition for revealing content.
export function BlurFade({
  children,
  className,
  inView = false,
  inViewMargin = "0px",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  inView?: boolean;
  inViewMargin?: UseInViewOptions["margin"];
  delay?: number;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const inactiveRef = useRef<HTMLDivElement>(null);
  const visible = useInView(
    inView && typeof IntersectionObserver !== "undefined" ? scope : inactiveRef,
    { once: true, margin: inViewMargin },
  );
  const allowed = useMotionAllowed();
  const played = useRef(false);
  const ready = !inView || visible;
  useEffect(() => {
    if (!allowed || !ready || played.current || !scope.current) return;
    played.current = true;
    const element = scope.current;
    const playback = animate(
      element,
      { opacity: [0.96, 1], y: [4, 0], filter: ["blur(2px)", "blur(0px)"] },
      {
        duration: motionTiming.enter / 1000,
        delay: Math.min(0.08, Math.max(0, Number.isFinite(delay) ? delay : 0)),
        ease: motionEase,
      },
    );
    return () => {
      playback.cancel();
      element.style.opacity = "1";
      element.style.filter = "none";
      element.style.transform = "none";
    };
  }, [allowed, ready, delay, scope, animate]);
  return (
    <div ref={scope} className={className} data-motion-blur>
      {children}
    </div>
  );
}
