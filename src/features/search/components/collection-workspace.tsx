"use client";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CollectionSearch } from "./collection-search";
import { requestCollectionSearch, requestFilteredSearch } from "../client";
import {
  collectionControls,
  controlsActive,
  controlsQuery,
  parseControls,
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
export function CollectionWorkspace({ options }: { options: FilterOptions }) {
  const params = useSearchParams();
  const parsed = parseControls(new URLSearchParams(params.toString()));
  const controls = parsed.success ? parsed.data : null;
  const key = String(controls ? controlsQuery(controls) : "invalid");
  const request = useCallback(
    (q: string, signal: AbortSignal) =>
      key === ""
        ? requestCollectionSearch(q, signal)
        : requestFilteredSearch(
            q,
            signal,
            collectionControls.parse(
              Object.fromEntries(new URLSearchParams(key)),
            ),
          ),
    [key],
  );
  function navigate(next: CollectionControls) {
    const query = controlsQuery(next);
    window.history.pushState(
      null,
      "",
      query ? `/app/search?${query}` : "/app/search",
    );
  }
  if (!controls)
    return (
      <section aria-label="Collection filters" className="space-y-4">
        <p role="alert">
          These filters are invalid or unsupported. Clear them to choose new
          filters.
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
          {name !== "sort" && <option value="">Any</option>}
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
      mode={{ key, browse: controlsActive(controls) }}
      controls={panel}
    />
  );
}
