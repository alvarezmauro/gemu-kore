import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { PaletteTrigger } from "@/features/search/components/command-palette";
import { catalogKinds, catalogLabels } from "@/features/catalog/contracts";
import { CatalogEditor } from "@/features/catalog/components/catalog-editor";
import { getCatalogPageData } from "@/features/catalog/queries.server";
export const dynamic = "force-dynamic";
export const metadata = { title: "Console catalog | GemuKore" };
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const result = await getCatalogPageData({
    kind: params.kind,
    page: params.page,
    archived: params.archived,
    id: params.id,
  });
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED" || result.status === "FORBIDDEN")
      redirect("/access-denied");
    if (result.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Catalog unavailable"
        description="We couldn't load the catalog. Please try again in a moment."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  const { kind, page, archived, selected } = result;
  const href = (next: number) =>
    `/app/catalog?kind=${kind}&archived=${archived}&page=${next}`;
  return (
    <ApplicationShell
      context="Catalog administration"
      headerActions={<PaletteTrigger compact />}
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Browse collection", href: "/app/collection", icon: "cards" },
        {
          label: "Console catalog",
          href: "/app/catalog",
          icon: "forms",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Console catalog"
          description="Shared identities for the systems in your collection. Start with companies and markets, then add platforms and hardware models."
        />
        <Button asChild variant="outline">
          <Link href="/app/catalog/games">Manage game catalog</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/catalog/accessories">Manage accessory catalog</Link>
        </Button>
        <nav aria-label="Catalog sections" className="flex flex-wrap gap-2">
          {catalogKinds.map((k) => (
            <Button
              asChild
              variant={kind === k ? "default" : "outline"}
              key={k}
            >
              <Link
                href={`/app/catalog?kind=${k}`}
                aria-current={kind === k ? "page" : undefined}
              >
                {catalogLabels[k]}
              </Link>
            </Button>
          ))}
        </nav>
        {selected || params.new === "1" ? (
          <>
            {params.saved === "1" ? (
              <p role="status">Catalog record saved.</p>
            ) : null}
            <CatalogEditor
              key={`${kind}-${selected?.id ?? "new"}-${selected?.revision ?? 0}`}
              kind={kind}
              record={selected}
            />
            {selected ? (
              <section
                className="max-w-3xl space-y-4"
                aria-labelledby="catalog-history-title"
              >
                <h2 id="catalog-history-title" className="text-xl font-medium">
                  Change history
                </h2>
                <p className="text-sm text-muted-foreground">
                  Latest 50 field changes, newest revision first. All changes
                  remain stored.
                </p>
                {result.history.length ? (
                  <ol className="space-y-3">
                    {result.history.map((change) => (
                      <li
                        key={change.id}
                        className="min-w-0 rounded-xl bg-card p-4"
                      >
                        <p className="font-medium break-words">
                          {change.fieldPath} · Revision {change.revision}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {change.origin} ·{" "}
                          <time dateTime={change.createdAt}>
                            {new Date(change.createdAt)
                              .toISOString()
                              .replace("T", " ")
                              .slice(0, 19)}{" "}
                            UTC
                          </time>
                        </p>
                        <details className="mt-2">
                          <summary className="min-h-11 cursor-pointer py-3">
                            View change
                          </summary>
                          <p className="font-medium">Before</p>
                          <pre className="whitespace-pre-wrap break-all text-sm">
                            {change.before}
                          </pre>
                          <p className="mt-3 font-medium">After</p>
                          <pre className="whitespace-pre-wrap break-all text-sm">
                            {change.after}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No recorded changes yet.</p>
                )}
              </section>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <form action="/app/catalog" className="space-y-2">
                <input type="hidden" name="kind" value={kind} />
                <Label htmlFor="catalog-status">Record status</Label>
                <div className="flex flex-wrap gap-2">
                  <select
                    id="catalog-status"
                    name="archived"
                    defaultValue={archived}
                    className="min-h-12 rounded-lg border border-input bg-background px-3 py-2"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">All records</option>
                  </select>
                  <Button type="submit" variant="outline">
                    Apply status
                  </Button>
                </div>
              </form>
              <Button asChild>
                <Link href={`/app/catalog?kind=${kind}&new=1`}>
                  Add{" "}
                  {kind === "company"
                    ? "company"
                    : kind === "region"
                      ? "market"
                      : kind === "model"
                        ? "hardware model"
                        : "platform"}
                </Link>
              </Button>
            </div>
            {result.records.length ? (
              <ul aria-label={catalogLabels[kind]} className="space-y-3">
                {result.records.map((record) => (
                  <li
                    key={record.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4"
                  >
                    <div className="min-w-0">
                      <h2 className="text-lg font-medium break-words">
                        {record.name}
                      </h2>
                      <p className="text-sm text-muted-foreground break-all">
                        {record.slug}
                        {record.archived ? " · Archived" : ""}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="h-auto min-h-11 max-w-full whitespace-normal break-words"
                    >
                      <Link href={`/app/catalog?kind=${kind}&id=${record.id}`}>
                        Edit {record.name}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                headingLevel={2}
                title={
                  page > 1
                    ? "No records on this page"
                    : archived === "all"
                      ? "No catalog records yet"
                      : `No ${archived} records`
                }
                description={
                  page > 1
                    ? "Return to an earlier page to continue browsing."
                    : archived === "archived"
                      ? "No archived records match this section. Choose All records to see the rest of the catalog."
                      : "Add a shared catalog record to get started. Archived records can be found with the status filter."
                }
              />
            )}
            <nav
              aria-label="Catalog pages"
              className="flex flex-wrap items-center gap-3"
            >
              {page > 1 ? (
                <Button asChild variant="outline">
                  <Link href={href(page - 1)}>Previous page</Link>
                </Button>
              ) : null}
              <span>Page {page}</span>
              {result.hasNext ? (
                <Button asChild variant="outline">
                  <Link href={href(page + 1)}>Next page</Link>
                </Button>
              ) : null}
            </nav>
          </>
        )}
      </PageContainer>
    </ApplicationShell>
  );
}
