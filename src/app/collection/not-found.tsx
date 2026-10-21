import Link from "next/link";
export default function CollectionNotFound() {
  return (
    <section className="mx-auto max-w-lg space-y-5 py-24 text-center">
      <h1 className="font-heading text-3xl">This page is unavailable.</h1>
      <p className="text-muted-foreground">
        Return to the collection for a look around.
      </p>
      <Link
        prefetch={false}
        href="/collection"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Back to the collection
      </Link>
    </section>
  );
}
