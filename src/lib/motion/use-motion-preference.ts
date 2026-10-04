"use client";

import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: no-preference)";
function subscribe(onChange: () => void) {
  if (!window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function getSnapshot() {
  return window.matchMedia?.(query).matches ?? false;
}
function getServerSnapshot() {
  return false;
}

// Unknown/SSR preferences are static. Changes to the OS preference are live.
export function useMotionAllowed() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
