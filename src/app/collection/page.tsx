import { publicMetadata } from "@/features/public-collection/seo.server";
import { getPublicHome } from "@/features/public-collection/queries.server";
import { PublicHome } from "@/features/public-collection/components/public-home";

export default async function CollectionHomePage() {
  const data = await getPublicHome().catch(() => null);
  if (!data)
    return (
      <section className="mx-auto max-w-lg py-24 text-center">
        <h1 className="font-heading text-3xl tracking-tight">
          The collection is unavailable right now.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Please try again in a moment.
        </p>
        <a
          href="/collection"
          className="mt-6 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Try again
        </a>
      </section>
    );
  return <PublicHome data={data} />;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return publicMetadata({ kind: "home", params: await searchParams });
}
