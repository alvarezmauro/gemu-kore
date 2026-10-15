"use client";
import { useState, useSyncExternalStore } from "react";
import type { CollectionView } from "./browsing";

export const viewPreferenceKey = "gemukore.collection-view.v1";
const changeEvent = "gemukore:collection-view";
function subscribe(change: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === viewPreferenceKey || event.key === null) change();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changeEvent, change);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changeEvent, change);
  };
}
function snapshot(): CollectionView | null {
  try {
    const value = localStorage.getItem(viewPreferenceKey);
    return value === "grid" || value === "list" ? value : null;
  } catch {
    return null;
  }
}
const serverSnapshot = () => null;
export function useCollectionView(defaultView: CollectionView) {
  const saved = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [temporary, setTemporary] = useState<CollectionView | null>(null);
  function choose(view: CollectionView) {
    try {
      localStorage.setItem(viewPreferenceKey, view);
      setTemporary(null);
      window.dispatchEvent(new Event(changeEvent));
    } catch {
      setTemporary(view);
    }
  }
  return { view: temporary ?? saved ?? defaultView, choose };
}
