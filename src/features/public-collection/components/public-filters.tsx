import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicCollection } from "../contracts";
import type { PublicCollectionInput } from "../validation";
import { publicSortLabels, type PublicCategory } from "../browsing";

const selectStyle =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const facetLabels = {
  platform: "Platform",
  company: "Company",
  region: "Region",
  year: "Release year",
  location: "Location",
} as const;
export function PublicFilters({
  category,
  input,
  data,
}: {
  category: PublicCategory;
  input: PublicCollectionInput;
  data: PublicCollection;
}) {
  const expanded =
    [
      input.platform,
      input.region,
      input.company,
      input.year,
      input.location,
      input.hasBox,
      input.hasDefects,
    ].some((v) => v !== undefined) ||
    (category === "search" && !!input.type);
  return (
    <form
      action={`/collection/${category}`}
      method="get"
      aria-label="Search and filter objects"
      className="space-y-5 rounded-xl bg-card p-5 sm:p-6"
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)]">
        <div>
          <label
            htmlFor="public-search"
            className="mb-2 block text-sm font-medium"
          >
            Search the collection
          </label>
          <Input
            id="public-search"
            type="search"
            name="q"
            defaultValue={input.q}
            maxLength={160}
            placeholder="Titles, models, platforms…"
          />
        </div>
        <div>
          <label
            htmlFor="public-sort"
            className="mb-2 block text-sm font-medium"
          >
            Sort by
          </label>
          <select
            id="public-sort"
            name="sort"
            defaultValue={input.sort}
            className={selectStyle}
          >
            {Object.entries(publicSortLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <details open={expanded} className="group">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">
          Filter objects
        </summary>
        <div className="grid min-w-0 gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          {category === "search" && (
            <div>
              <label
                htmlFor="public-type"
                className="mb-2 block text-sm font-medium"
              >
                Category
              </label>
              <select
                id="public-type"
                name="type"
                defaultValue={input.type?.toLowerCase() ?? ""}
                className={selectStyle}
              >
                <option value="">All categories</option>
                <option value="console">Consoles</option>
                <option value="game">Games</option>
                <option value="accessory">Accessories</option>
              </select>
            </div>
          )}
          {(
            Object.entries(facetLabels) as [keyof typeof facetLabels, string][]
          ).map(([field, label]) => {
            if (field === "location" && !data.filters.location) return null;
            const options = data.facets.filter((f) => f.field === field);
            const selected =
              input[field] === undefined ? "" : String(input[field]);
            return (
              <div key={field}>
                <label
                  htmlFor={`public-${field}`}
                  className="mb-2 block text-sm font-medium"
                >
                  {label}
                </label>
                <select
                  id={`public-${field}`}
                  name={field}
                  defaultValue={selected}
                  className={selectStyle}
                >
                  <option value="">All</option>
                  {selected && !options.some((f) => f.value === selected) && (
                    <option value={selected}>Selected option</option>
                  )}
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({option.count})
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
          <div>
            <label
              htmlFor="public-box"
              className="mb-2 block text-sm font-medium"
            >
              Box
            </label>
            <select
              id="public-box"
              name="hasBox"
              defaultValue={input.hasBox ?? ""}
              className={selectStyle}
            >
              <option value="">Any box status</option>
              <option value="true">Box included</option>
              <option value="false">Without box</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          {data.filters.hasDefects && (
            <div>
              <label
                htmlFor="public-defects"
                className="mb-2 block text-sm font-medium"
              >
                Unresolved defects
              </label>
              <select
                id="public-defects"
                name="hasDefects"
                defaultValue={
                  input.hasDefects === undefined ? "" : String(input.hasDefects)
                }
                className={selectStyle}
              >
                <option value="">Any status</option>
                <option value="true">With unresolved defects</option>
                <option value="false">Without unresolved defects</option>
              </select>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Options and their counts come from the objects matching your current
          search and filters.
        </p>
        {data.facetsTruncated && (
          <p className="mt-2 text-sm text-muted-foreground">
            Some filter options are omitted. Narrow your search to see more
            specific options.
          </p>
        )}
      </details>
      <Button type="submit">Apply search and filters</Button>
    </form>
  );
}
