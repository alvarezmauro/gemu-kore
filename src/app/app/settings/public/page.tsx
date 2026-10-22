import Link from "next/link";
import { redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { AuthCard } from "@/features/auth/components/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPublicationPageData } from "@/features/public-collection/admin-queries.server";
import { PublicationSettingsForm } from "@/features/public-collection/components/publication-settings";
import { MediaPublication } from "@/features/public-collection/components/media-publication";
import { ItemPublication } from "@/features/public-collection/components/item-publication";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Public collection settings | GemuKore",
  referrer: "same-origin",
};
export default async function PublicSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const result = await getPublicationPageData(await searchParams);
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    return (
      <AuthCard
        title="Publication settings unavailable"
        description={
          result.status === "INVALID_INPUT"
            ? "Check the search or copy selection and try again."
            : "We couldn't load publication settings. Please try again."
        }
      >
        <Button asChild variant="outline">
          <Link href="/app/settings/public">Reload settings</Link>
        </Button>
      </AuthCard>
    );
  }
  const pageLink = (offset: number) =>
    `/app/settings/public?${new URLSearchParams({ q: result.q, offset: String(offset) })}`;
  return (
    <ApplicationShell
      context="Public collection"
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Browse collection", href: "/app/collection", icon: "cards" },
        {
          label: "Public collection",
          href: "/app/settings/public",
          icon: "public",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <div className="space-y-10 [overflow-wrap:anywhere] [&_button]:h-auto [&_button]:min-h-11 [&_button]:whitespace-normal">
          <PageHeader
            title="Public collection"
            description="Choose what visitors can see. Only reviewed, approved copies appear when the collection is open."
            action={
              <Button asChild variant="outline">
                <Link href="/collection" prefetch={false}>
                  View public collection
                </Link>
              </Button>
            }
          />
          <PublicationSettingsForm
            key={result.settings.revision}
            initial={result.settings}
          />
          <section
            aria-labelledby="find-copy"
            className="space-y-5 border-t pt-8"
          >
            <h2 id="find-copy" className="font-heading text-2xl">
              Choose a copy to review
            </h2>
            <form
              action="/app/settings/public"
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="publication-search"
                  className="mb-2 block text-sm font-medium"
                >
                  Find a physical copy
                </label>
                <Input
                  id="publication-search"
                  name="q"
                  defaultValue={result.q}
                  maxLength={160}
                  placeholder="Search by name or platform"
                  aria-describedby="publication-search-help"
                />
              </div>
              <Button type="submit">Find copies</Button>
            </form>
            <p
              id="publication-search-help"
              className="text-sm text-muted-foreground"
            >
              Enter at least two characters. Each result is an owned copy;
              matching catalog entries alone cannot be published.
            </p>
            {result.copies.state === "ready" &&
              result.copies.items.length === 0 && <p>No matching copies.</p>}
            <ul aria-label="Copies to review" className="divide-y">
              {result.copies.items.map((copy) => (
                <li
                  key={copy.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{copy.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {copy.context}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      Copy {copy.id}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link
                      prefetch={false}
                      href={`/app/settings/public?${new URLSearchParams({ q: result.q, item: copy.id })}#copy-review`}
                    >
                      Review copy<span className="sr-only"> {copy.id}</span>
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
            <nav aria-label="Copy results" className="flex flex-wrap gap-4">
              {result.copies.offset > 0 && (
                <Link
                  href={pageLink(Math.max(0, result.copies.offset - 20))}
                  className="py-3 underline"
                >
                  Previous copies
                </Link>
              )}
              {result.copies.hasMore && result.copies.offset < 5000 && (
                <Link
                  href={pageLink(result.copies.offset + 20)}
                  className="py-3 underline"
                >
                  More copies
                </Link>
              )}
            </nav>
          </section>
          {result.selected && (
            <ItemPublication
              key={`${result.selected.item.id}-${result.selected.revision}-${result.selected.settingsRevision}`}
              initial={result.selected}
            />
          )}
          {result.media && (
            <MediaPublication
              key={result.selected?.reviewToken}
              choices={result.media}
            />
          )}
          <noscript>
            <p>
              JavaScript is needed to review and save publication changes. Your
              collection remains unchanged.
            </p>
          </noscript>
        </div>
      </PageContainer>
    </ApplicationShell>
  );
}
