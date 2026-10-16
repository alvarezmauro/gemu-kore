"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { CollectionResults } from "@/features/collection/components/collection-results";
import { useCollectionView } from "@/features/collection/use-collection-view";
import { lastPage } from "@/features/collection/browsing";
import type { SearchResult } from "../contracts";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { searchInput } from "../validation";
import { requestCollectionSearch } from "../client";
import { usePrivateSearch } from "../use-private-search";
const labels = { CONSOLE: "Console", GAME: "Game", ACCESSORY: "Accessory" };
export function CollectionSearch({
  request = requestCollectionSearch,
  mode,
  controls,
  collectionHome = false,
  filtered = false,
  page = 1,
  onPageChange,
  onQueryChange,
}: {
  request?: (q: string, signal: AbortSignal) => Promise<SearchResult>;
  mode?: { key: string; browse: boolean };
  controls?: ReactNode;
  collectionHome?: boolean;
  filtered?: boolean;
  page?: number;
  onPageChange?: (page: number) => void;
  onQueryChange?: () => void;
} = {}) {
  const { q, state, update, retry } = usePrivateSearch(request, mode);
  const { view, choose } = useCollectionView("grid");
  const emptyCollection = collectionHome && q.trim() === "" && !filtered;
  const heading = useRef<HTMLHeadingElement>(null);
  const focusPage = useRef<number | null>(null);
  useEffect(() => {
    if (focusPage.current !== null && focusPage.current !== page)
      focusPage.current = null;
    if (
      focusPage.current !== null &&
      (state.status === "ready" || state.status === "error")
    ) {
      focusPage.current = null;
      // The page button disappeared during loading. Restore orientation only
      // if the user has not moved focus elsewhere (for example, the palette).
      if (document.activeElement === document.body) heading.current?.focus();
    }
  }, [state, page]);
  function go(next: number) {
    focusPage.current = next;
    onPageChange?.(next);
  }
  return (
    <section aria-label="Collection search" className="space-y-6">
      <div className="max-w-2xl space-y-2">
        <Label htmlFor="collection-query">Search your collection</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-3.5 left-3 size-5 text-muted-foreground"
          />
          <Input
            id="collection-query"
            type="search"
            className="min-h-12 pl-10"
            maxLength={640}
            value={q}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={!searchInput.safeParse({ q }).success}
            aria-describedby={
              state.status === "error"
                ? "search-help search-error"
                : "search-help"
            }
            onChange={(event) => {
              focusPage.current = null;
              update(event.target.value);
              onQueryChange?.();
            }}
          />
        </div>
        <p id="search-help" className="text-sm text-muted-foreground">
          Find physical copies by name, platform, company, edition, region,
          serial number, notes or defects. Add another word to narrow your
          search.
        </p>
      </div>
      {controls}
      <noscript>
        Enable JavaScript to search without placing private search terms in the
        URL.
      </noscript>
      <div aria-busy={state.status === "pending"} className="space-y-4">
        {onPageChange && (
          <h2
            ref={heading}
            tabIndex={-1}
            className="scroll-mt-28 font-heading text-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collectionHome ? "Collection copies" : "Results"}
          </h2>
        )}
        <p role="status" className="text-sm text-muted-foreground">
          {state.status === "pending"
            ? "Searching your collection…"
            : state.status === "ready"
              ? `${state.result.items.length} ${state.result.items.length === 1 ? "physical copy" : "physical copies"} on this page${onPageChange ? ` · Page ${page}` : ""}${state.result.hasMore ? " · More matches available" : ""}`
              : ""}
        </p>
        {state.status === "pending" && (
          <div
            aria-hidden="true"
            className={
              collectionHome && view === "grid"
                ? "grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
                : "space-y-3"
            }
          >
            {Array.from({ length: collectionHome ? 6 : 3 }, (_, index) => (
              <div key={index} className="space-y-4 rounded-xl bg-card p-5">
                {collectionHome && (
                  <div
                    className={
                      view === "grid"
                        ? "aspect-[4/3] rounded-lg bg-muted"
                        : "h-16 w-20 rounded-lg bg-muted"
                    }
                  />
                )}
                <div className="h-5 w-3/4 rounded bg-muted" />
                <div className="h-4 rounded bg-muted" />
                <div className="h-4 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}
        {state.status === "idle" && (
          <EmptyState
            title="Find a physical copy"
            description={
              controls
                ? "Enter at least two characters, or choose a filter to browse. Each physical copy appears separately."
                : "Enter at least two characters. Each copy appears separately, including copies of the same release."
            }
          />
        )}
        {state.status === "error" && (
          <div className="space-y-3">
            <p
              id="search-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {state.message}
            </p>
            <Button
              disabled={!searchInput.safeParse({ q }).success}
              variant="outline"
              onClick={retry}
            >
              Try search again
            </Button>
          </div>
        )}
        {state.status === "ready" && state.result.items.length === 0 && (
          <EmptyState
            title={
              page > 1
                ? "No copies on this page"
                : emptyCollection
                  ? "No collection items yet"
                  : "No matching copies"
            }
            description={
              page > 1
                ? "The collection may have changed. Return to the first page or adjust your filters."
                : emptyCollection
                  ? "Your owned consoles, games and accessories will appear here once added to the collection."
                  : "Try another name or adjust your filters. Only items already in your collection appear here."
            }
          />
        )}
        {state.status === "ready" && state.result.items.length > 0 && (
          <>
            {collectionHome ? (
              <CollectionResults
                items={state.result.items}
                view={view}
                choose={choose}
              />
            ) : (
              <ol aria-label="Search results" className="space-y-3">
                {state.result.items.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 space-y-3 rounded-xl bg-card p-5"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{labels[item.type]}</Badge>
                      {item.identificationStatus === "INCOMPLETE" && (
                        <Badge variant="outline">Identity incomplete</Badge>
                      )}
                    </div>
                    <div>
                      <h2 className="break-words font-heading text-lg">
                        {item.title}
                      </h2>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {item.context} · Copy {item.id.slice(0, 8)}
                      </p>
                    </div>
                    {item.details && (
                      <p className="break-words text-sm text-muted-foreground">
                        {item.details.releaseYear === null
                          ? "Year unknown"
                          : `Year ${item.details.releaseYear}`}{" "}
                        · {item.details.location ?? "Unassigned location"}
                        {item.details.platform
                          ? ` · Platform ${item.details.platform}`
                          : ""}
                        {item.details.publisher
                          ? ` · Publisher ${item.details.publisher}`
                          : ""}
                      </p>
                    )}
                    {item.matchSources.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Matched: {item.matchSources.join(", ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {item.type === "CONSOLE" && (
                        <Button asChild>
                          <Link
                            href={`/app/consoles/${item.id}`}
                            aria-label={`View console ${item.title}, copy ${item.id.slice(0, 8)}`}
                          >
                            View console
                          </Link>
                        </Button>
                      )}
                      <Button asChild variant="outline">
                        <Link
                          href={`/app/media?itemId=${item.id}`}
                          aria-label={`Photos for ${item.title}, copy ${item.id.slice(0, 8)}`}
                        >
                          Photos
                        </Link>
                      </Button>
                      <Button asChild variant="ghost">
                        <Link
                          href={`/app/defects?itemId=${item.id}`}
                          aria-label={`Defects for ${item.title}, copy ${item.id.slice(0, 8)}`}
                        >
                          Defects
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {state.result.hasMore && !onPageChange && (
              <p className="text-sm text-muted-foreground">
                Showing the first {state.result.items.length} matches. Add
                another word or use filters to narrow your search.
              </p>
            )}
          </>
        )}
        {state.status === "ready" &&
          onPageChange &&
          (state.result.items.length > 0 || page > 1) && (
            <nav
              aria-label="Collection pagination"
              className="flex flex-wrap items-center gap-3"
            >
              {page > 1 && (
                <Button variant="ghost" onClick={() => go(1)}>
                  First page
                </Button>
              )}
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => go(page - 1)}
              >
                Previous page
              </Button>
              <span aria-current="page" className="text-sm">
                Page {page}
                {state.result.items.length > 0
                  ? ` · Copies ${state.result.offset + 1}–${state.result.offset + state.result.items.length}`
                  : ""}
              </span>
              <Button
                variant="outline"
                disabled={!state.result.hasMore || page >= lastPage}
                onClick={() => go(page + 1)}
              >
                Next page
              </Button>
              {state.result.hasMore && page >= lastPage && (
                <p className="w-full text-sm text-muted-foreground">
                  Use search or filters to narrow the collection before browsing
                  further.
                </p>
              )}
            </nav>
          )}
      </div>
    </section>
  );
}
