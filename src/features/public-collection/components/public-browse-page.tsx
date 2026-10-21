import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicBrowsePage } from "../browse-queries.server";
import {
  publicBrowseHref,
  type PublicCategory,
  type PublicBrowseParams,
} from "../browsing";
import { PublicBrowse } from "./public-browse";

export async function PublicBrowsePage({
  category,
  searchParams,
}: {
  category: PublicCategory;
  searchParams: Promise<PublicBrowseParams>;
}) {
  const result = await getPublicBrowsePage(await searchParams, category);
  if (result.status === "NOT_FOUND") notFound();
  if (result.status !== "ready")
    return (
      <section className="mx-auto max-w-lg space-y-5 py-20 text-center">
        <h1 className="font-heading text-3xl">
          {result.status === "INVALID_INPUT"
            ? "Check your search or filters"
            : "The collection is unavailable right now."}
        </h1>
        <p className="text-muted-foreground">
          {result.status === "INVALID_INPUT"
            ? "We couldn't use that combination. Check the address or start again."
            : "Please try again in a moment."}
        </p>
        <Link
          prefetch={false}
          href={
            result.status === "UNAVAILABLE" && result.location
              ? publicBrowseHref(
                  category,
                  result.location.input,
                  result.location.page,
                )
              : `/collection/${category}`
          }
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {result.status === "INVALID_INPUT"
            ? "Reset search and filters"
            : "Try again"}
        </Link>
      </section>
    );
  return <PublicBrowse category={category} {...result} />;
}
