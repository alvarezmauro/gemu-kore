"use client";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CollectionSearch } from "./collection-search";
import {
  requestCollectionSearch,
  requestFilteredSearch,
  requestCollectionPage,
} from "../client";
import {
  parseBrowseLocation,
  browseQuery,
  pageSize,
} from "@/features/collection/browsing";
import {
  collectionControls,
  controlsActive,
  controlsQuery,
  sortLabels,
  editionTypes,
  type CollectionControls,
  type FilterOptions,
  type FilterOption,
} from "../controls";

const selectStyle =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-ring";
const labels = {
  type: "Item type",
  platform: "Platform",
  manufacturer: "Console manufacturer",
  publisher: "Game publisher",
  producer: "Accessory producer",
  model: "Console model",
  region: "Region",
  year: "Release year",
  location: "Location",
  hasBox: "Box",
  hasDefects: "Unresolved defects",
  edition: "Game edition",
  sort: "Sort by",
};
export function CollectionWorkspace({
  options,
  collectionHome = false,
}: {
  options: FilterOptions;
  collectionHome?: boolean;
}) {
  const params = useSearchParams();
  const parsed = parseBrowseLocation(new URLSearchParams(params.toString()));
  const controls = parsed?.controls ?? null;
  const page = Number(parsed?.page ?? 1);
  const path = collectionHome ? "/app/collection" : "/app/search";
  const key = String(controls ? controlsQuery(controls) : "invalid");
  const request = useCallback(
    (q: string, signal: AbortSignal) => {
      const paging = page > 1 ? { offset: (page - 1) * pageSize } : undefined;
      if (collectionHome)
        return requestCollectionPage(
          q,
          signal,
          collectionControls.parse(
            Object.fromEntries(new URLSearchParams(key)),
          ),
          paging ?? { offset: 0 },
        );
      return key === ""
        ? paging
          ? requestCollectionSearch(q, signal, paging)
          : requestCollectionSearch(q, signal)
        : paging
          ? requestFilteredSearch(
              q,
              signal,
              collectionControls.parse(
                Object.fromEntries(new URLSearchParams(key)),
              ),
              paging,
            )
          : requestFilteredSearch(
              q,
              signal,
              collectionControls.parse(
                Object.fromEntries(new URLSearchParams(key)),
              ),
            );
    },
    [key, page, collectionHome],
  );
  function navigate(next: CollectionControls, nextPage = 1, replace = false) {
    const query = browseQuery(next, nextPage);
    window.history[replace ? "replaceState" : "pushState"](
      null,
      "",
      query ? `${path}?${query}` : path,
    );
  }
  if (!controls)
    return (
      <section aria-label="Collection filters" className="space-y-4">
        <p role="alert">
          These filters or page settings are invalid or unsupported. Clear them
          to choose new filters.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate({ sort: "relevance" })}
        >
          Clear filters
        </Button>
      </section>
    );
  const choices: Record<keyof CollectionControls, FilterOption[]> = {
    type: [
      { value: "console", label: "Consoles" },
      { value: "game", label: "Games" },
      { value: "accessory", label: "Accessories" },
    ],
    ...options,
    year: [...options.year, { value: "unknown", label: "Unknown year" }],
    location: [
      ...options.location,
      { value: "unassigned", label: "Unassigned" },
    ],
    hasBox: [
      { value: "true", label: "With box" },
      { value: "false", label: "Without box" },
      { value: "unknown", label: "Box status unknown" },
    ],
    hasDefects: [
      { value: "true", label: "With unresolved defects" },
      { value: "false", label: "No unresolved defects recorded" },
    ],
    edition: editionTypes.map((value) => ({
      value,
      label: value.replaceAll("_", " ").toLowerCase(),
    })),
    sort: Object.entries(sortLabels).map(([value, label]) => ({
      value,
      label,
    })),
  };
  function field(name: keyof CollectionControls) {
    const value = controls?.[name] ?? "";
    return (
      <div key={name} className="min-w-0 space-y-2">
        <Label htmlFor={`filter-${name}`}>{labels[name]}</Label>
        <select
          id={`filter-${name}`}
          className={selectStyle}
          value={value}
          onChange={(event) => {
            const next = {
              ...controls,
              [name]: event.target.value || undefined,
            };
            navigate(collectionControls.parse(next));
          }}
        >
          {name !== "sort" && (
            <option value="">
              {name === "type" && collectionHome ? "All items" : "Any"}
            </option>
          )}
          {value && !choices[name].some((option) => option.value === value) && (
            <option value={value}>Selected value unavailable</option>
          )}
          {choices[name].map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  const active = Object.entries(controls).filter(
    ([name, value]) =>
      value !== undefined && !(name === "sort" && value === "relevance"),
  );
  const panel = (
    <section
      aria-label="Collection filters"
      className="space-y-4 rounded-xl bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg">Filters and sorting</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ sort: "name-asc" })}
          >
            Browse all copies
          </Button>
          <Button
            variant="ghost"
            disabled={!controlsActive(controls)}
            onClick={() => navigate({ sort: "relevance" })}
          >
            Clear filters
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            "type",
            "platform",
            "region",
            "hasBox",
            "hasDefects",
            "sort",
          ] as const
        ).map(field)}
      </div>
      <details>
        <summary className="cursor-pointer py-3 text-sm font-medium">
          More filters
        </summary>
        <div className="grid min-w-0 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              "manufacturer",
              "publisher",
              "producer",
              "model",
              "year",
              "location",
              "edition",
            ] as const
          ).map(field)}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Locations include nested places. Manufacturers match console models;
          producers match accessory families or variants. Repaired defects
          remain in history.
        </p>
      </details>
      {active.length > 0 && (
        <ul aria-label="Active filters" className="flex flex-wrap gap-2">
          {active.map(([name, value]) => (
            <li key={name} className="min-w-0 max-w-full">
              <Button
                variant="secondary"
                className="max-w-full whitespace-normal text-left"
                aria-label={`Remove ${labels[name as keyof CollectionControls]}`}
                onClick={() =>
                  navigate(
                    collectionControls.parse({
                      ...controls,
                      [name]: name === "sort" ? "relevance" : undefined,
                    }),
                  )
                }
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {labels[name as keyof CollectionControls]}:{" "}
                  {choices[name as keyof CollectionControls].find(
                    (option) => option.value === value,
                  )?.label ?? "Selected value unavailable"}{" "}
                  ×
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <CollectionSearch
      request={request}
      mode={{
        key: `${key}|${page}`,
        browse: collectionHome || controlsActive(controls),
      }}
      controls={panel}
      collectionHome={collectionHome}
      filtered={Object.entries(controls).some(
        ([name, value]) => name !== "sort" && value !== undefined,
      )}
      page={page}
      onPageChange={(next) => navigate(controls, next)}
      onQueryChange={() => {
        if (page !== 1) navigate(controls, 1, true);
      }}
    />
  );
}
