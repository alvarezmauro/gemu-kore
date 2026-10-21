import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { PublicCollection } from "../contracts";
import type { PublicCollectionInput } from "../validation";
import {
  publicCategories,
  publicBrowseHref,
  publicLastPage,
  type PublicCategory,
} from "../browsing";
import { activePublicFilters } from "../browse-presentation";
import { PublicNavigation } from "./public-navigation";
import { PublicFilters } from "./public-filters";
import { PublicObjectGrid } from "./public-object-grid";

export function PublicBrowse({
  category,
  input,
  page,
  data,
}: {
  category: PublicCategory;
  input: PublicCollectionInput;
  page: number;
  data: PublicCollection;
}) {
  const config = publicCategories[category];
  const active = activePublicFilters(category, input, data.facets);
  return (
    <div className="space-y-8 py-10 sm:py-16">
      <Link
        href="/collection"
        prefetch={false}
        className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
      >
        Back to the collection
      </Link>
      <div>
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">
          {config.title}
        </h1>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
          {config.description}
        </p>
      </div>
      <PublicNavigation current={category} />
      <PublicFilters
        key={publicBrowseHref(category, input, page)}
        category={category}
        input={input}
        data={data}
      />
      {active.length > 0 && (
        <section aria-label="Active filters" className="space-y-3">
          <h2 className="text-sm font-medium">Active filters</h2>
          <ul className="flex flex-wrap gap-2">
            {active.map((filter) => (
              <li key={filter.key} className="min-w-0 max-w-full">
                <Link
                  prefetch={false}
                  href={filter.href}
                  aria-label={`Remove ${filter.label}`}
                  className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-full border px-4 py-2 text-sm"
                >
                  {filter.label}
                  <span aria-hidden="true">×</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link
            prefetch={false}
            href={`/collection/${category}`}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Clear all filters
          </Link>
        </section>
      )}
      <section
        id="objects"
        aria-labelledby="objects-title"
        className="scroll-mt-8 space-y-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="objects-title" className="font-heading text-2xl">
            On the shelves
          </h2>
          <p role="status" className="text-sm text-muted-foreground">
            {data.items.length > 0
              ? `Showing ${data.offset + 1}–${data.offset + data.items.length} of ${data.counts.total.toLocaleString("en-US")} objects`
              : `${data.counts.total.toLocaleString("en-US")} matching objects`}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Every entry is one physical copy.
        </p>
        {data.items.length > 0 ? (
          <PublicObjectGrid items={data.items} offset={data.offset} />
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center sm:py-14">
            <h3 className="font-heading text-2xl">
              {data.counts.total > 0
                ? "There are no objects on this page"
                : active.length
                  ? "No objects match these filters"
                  : "No objects on display yet"}
            </h3>
            <p className="mt-3 text-muted-foreground">
              {data.counts.total > 0
                ? "The collection may have changed. Return to the first page of these results."
                : active.length
                  ? "Try another search or clear your filters to explore the shelves."
                  : "Come back for another look around."}
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link
                prefetch={false}
                href={
                  data.counts.total > 0
                    ? publicBrowseHref(category, input)
                    : active.length
                      ? `/collection/${category}`
                      : "/collection"
                }
              >
                {data.counts.total > 0
                  ? "First page"
                  : active.length
                    ? "Reset search and filters"
                    : "Back to the collection"}
              </Link>
            </Button>
          </div>
        )}
        <nav
          aria-label="Result pages"
          className="flex flex-wrap items-center gap-4 pt-4"
        >
          {page > 1 && (
            <Button asChild variant="outline">
              <Link
                prefetch={false}
                href={`${publicBrowseHref(category, input, page - 1)}#objects`}
              >
                Previous page
              </Link>
            </Button>
          )}
          <span className="text-sm text-muted-foreground">Page {page}</span>
          {data.hasMore && page < publicLastPage && (
            <Button asChild variant="outline">
              <Link
                prefetch={false}
                href={`${publicBrowseHref(category, input, page + 1)}#objects`}
              >
                Next page
              </Link>
            </Button>
          )}
        </nav>
        {data.hasMore && page === publicLastPage && (
          <p className="text-sm text-muted-foreground">
            Narrow your search or filters to explore the remaining objects.
          </p>
        )}
      </section>
    </div>
  );
}
