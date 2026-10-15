"use client";
import type { ReactNode } from "react";
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
}: {
  request?: (q: string, signal: AbortSignal) => Promise<SearchResult>;
  mode?: { key: string; browse: boolean };
  controls?: ReactNode;
} = {}) {
  const { q, state, update, retry } = usePrivateSearch(request, mode);
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
            onChange={(event) => update(event.target.value)}
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
        <p role="status" className="text-sm text-muted-foreground">
          {state.status === "pending"
            ? "Searching your collection…"
            : state.status === "ready"
              ? `${state.result.items.length} ${state.result.items.length === 1 ? "physical copy" : "physical copies"} on this page${state.result.hasMore ? " · More matches available" : ""}`
              : ""}
        </p>
        {state.status === "idle" && (
          <EmptyState
            title="Find a physical copy"
            description="Enter at least two characters. Each copy appears separately, including copies of the same release."
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
            title="No matching copies"
            description="Try another name or adjust your filters. Only items already in your collection appear here."
          />
        )}
        {state.status === "ready" && state.result.items.length > 0 && (
          <>
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
            {state.result.hasMore && (
              <p className="text-sm text-muted-foreground">
                Showing the first {state.result.items.length} matches. Add
                another word or use filters to narrow your search.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
