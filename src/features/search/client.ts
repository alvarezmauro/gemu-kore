import type { CollectionControls } from "./controls";
import { paletteResult } from "./palette-validation";
import type { PaletteResult } from "./palette-contracts";
import { searchResult } from "./validation";
import type { SearchResult } from "./contracts";
export async function requestCollectionSearch(
  q: string,
  signal: AbortSignal,
): Promise<SearchResult> {
  const data = await requestSearch("/api/search/private", q, signal);
  const parsed = searchResult.safeParse(data);
  if (!parsed.success)
    throw new Error("We couldn't load these search results. Please try again.");
  return parsed.data;
}
export async function requestPaletteSearch(
  q: string,
  signal: AbortSignal,
): Promise<PaletteResult> {
  const data = await requestSearch("/api/search/palette", q, signal);
  const parsed = paletteResult.safeParse(data);
  if (!parsed.success)
    throw new Error("We couldn't load these search results. Please try again.");
  return parsed.data;
}
export async function requestFilteredSearch(
  q: string,
  signal: AbortSignal,
  controls: CollectionControls,
): Promise<SearchResult> {
  const data = await requestSearch("/api/search/filtered", q, signal, controls);
  const parsed = searchResult.safeParse(data);
  if (!parsed.success)
    throw new Error("We couldn't load these search results. Please try again.");
  return parsed.data;
}
async function requestSearch(
  path: "/api/search/private" | "/api/search/palette" | "/api/search/filtered",
  q: string,
  signal: AbortSignal,
  controls?: CollectionControls,
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(controls ? { q, controls } : { q }),
    cache: "no-store",
    signal,
  }).catch(() => {
    throw new Error("Search is unavailable right now. Please try again.");
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Your access has changed. Sign in again before searching."
        : response.status === 400
          ? "Use up to 160 characters, eight words and sixteen searchable terms."
          : "Search is unavailable right now. Please try again.",
    );
  const data: unknown = await response.json().catch(() => {
    throw new Error("We couldn't load these search results. Please try again.");
  });
  return data;
}
