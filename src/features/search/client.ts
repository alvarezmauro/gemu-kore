import { searchResult } from "./validation";
import type { SearchResult } from "./contracts";
export async function requestCollectionSearch(
  q: string,
  signal: AbortSignal,
): Promise<SearchResult> {
  const response = await fetch("/api/search/private", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q }),
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
  const parsed = searchResult.safeParse(data);
  if (!parsed.success)
    throw new Error("We couldn't load these search results. Please try again.");
  return parsed.data;
}
