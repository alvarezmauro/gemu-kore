import Link from "next/link";
import { notFound } from "next/navigation";
import type { PublicItemType } from "../contracts";
import { getPublicDetailPage } from "../detail-queries.server";
import { PublicDetail } from "./public-detail";
export async function PublicDetailPage({
  type,
  id,
}: {
  type: PublicItemType;
  id: string;
}) {
  const result = await getPublicDetailPage(type, id);
  if (result.status === "NOT_FOUND") notFound();
  if (result.status !== "ready")
    return (
      <section className="mx-auto max-w-lg space-y-5 py-20 text-center">
        <h1 className="font-heading text-3xl">
          The collection is unavailable right now.
        </h1>
        <p className="text-muted-foreground">Please try again in a moment.</p>
        <Link
          href={`/collection/${{ CONSOLE: "consoles", GAME: "games", ACCESSORY: "accessories" }[type]}/${encodeURIComponent(id)}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center underline"
        >
          Try again
        </Link>
      </section>
    );
  return <PublicDetail item={result.item} />;
}
