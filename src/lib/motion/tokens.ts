import type { CSSProperties } from "react";

// Milliseconds in CSS; seconds at the Motion boundary.
export const motionTiming = {
  feedback: 120,
  enter: 180,
  exit: 150,
  layout: 200,
} as const;
export const motionEase = [0.19, 1, 0.22, 1] as const;
export const layoutTransition = {
  duration: motionTiming.layout / 1000,
  ease: motionEase,
};
export const motionCssVariables = {
  "--motion-feedback": `${motionTiming.feedback}ms`,
  "--motion-enter": `${motionTiming.enter}ms`,
  "--motion-exit": `${motionTiming.exit}ms`,
  "--motion-layout": `${motionTiming.layout}ms`,
  "--motion-ease": `cubic-bezier(${motionEase.join(",")})`,
} as CSSProperties;
