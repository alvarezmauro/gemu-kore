import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { MetadataSource } from "@/features/provenance/components/metadata-source";
import { AccessoryCatalogEditor } from "@/features/accessories/components/accessory-catalog-editor";
import { getAccessoryCatalogPageData } from "@/features/accessories/queries.server";
import { accessoryFieldLabels } from "@/features/accessories/contracts";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Accessory catalog | GemuKore",
  referrer: "same-origin",
};
export default async function AccessoryCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const data = await getAccessoryCatalogPageData({
    kind: params.kind,
    id: params.id,
    page: params.page,
    archived: params.archived,
  });
  if (data.status !== "authorized") {
    if (data.status === "UNAUTHENTICATED") redirect("/login");
    if (data.status === "DENIED" || data.status === "FORBIDDEN")
      redirect("/access-denied");
    if (data.status === "NOT_FOUND") notFound();
    return (
      <AuthCard
        title="Accessory catalog unavailable"
        description="We couldn't load the accessory catalog. Please try again."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  const href = (page: number) =>
    `/app/catalog/accessories?kind=${data.kind}&archived=${data.archived}&page=${page}`;
  return (
    <ApplicationShell
      context="Catalog administration"
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Console catalog", href: "/app/catalog", icon: "forms" },
        { label: "Game catalog", href: "/app/catalog/games", icon: "forms" },
        {
          label: "Accessory catalog",
          href: "/app/catalog/accessories",
          icon: "forms",
          current: true,
        },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Accessory catalog"
          description="Curate accessory families, their variants and confirmed platform compatibility. Personal copies are separate from these shared facts."
        />
        <nav
          aria-label="Accessory catalog sections"
          className="flex flex-wrap gap-2"
        >
          {(["accessory", "variant"] as const).map((kind) => (
            <Button
              asChild
              key={kind}
              variant={kind === data.kind ? "default" : "outline"}
            >
              <Link
                href={`/app/catalog/accessories?kind=${kind}`}
                aria-current={kind === data.kind ? "page" : undefined}
              >
                {kind === "accessory"
                  ? "Accessory families"
                  : "Accessory variants"}
              </Link>
            </Button>
          ))}
        </nav>
        {params.saved === "1" && <p role="status">Catalog record saved.</p>}
        {data.selected || params.new === "1" ? (
          <>
            <AccessoryCatalogEditor
              key={`${data.kind}-${data.selected?.id ?? "new"}-${data.selected?.revision ?? 0}`}
              kind={data.kind}
              record={data.selected}
            />
            {data.selected?.kind === "accessory" && (
              <section
                aria-labelledby="family-compatibility-title"
                className="max-w-3xl space-y-3"
              >
                <h2
                  id="family-compatibility-title"
                  className="font-heading text-xl"
                >
                  Compatibility across active variants
                </h2>
                <p className="text-sm text-muted-foreground">
                  This is the union of explicitly recorded variant
                  compatibility. Check a specific variant and its notes before
                  choosing it.
                </p>
                {data.familyCompatibility.length ? (
                  <ul className="space-y-2">
                    {data.familyCompatibility.map((p) => (
                      <li key={p.id}>
                        {p.name}
                        {p.archived ? " (archived platform)" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No confirmed variant compatibility recorded.</p>
                )}
                {data.moreFamilyCompatibility && (
                  <p>Showing the first 30 platforms.</p>
                )}
              </section>
            )}
            {data.selected && (
              <section
                aria-labelledby="accessory-history-title"
                className="max-w-3xl space-y-4"
              >
                <h2
                  id="accessory-history-title"
                  className="font-heading text-xl"
                >
                  Change history
                </h2>
                <p className="text-sm text-muted-foreground">
                  Latest 50 field changes. All changes remain stored.
                </p>
                <ol className="space-y-3">
                  {data.history.map((h) => (
                    <li key={h.id} className="min-w-0 rounded-xl bg-card p-4">
                      <p className="break-words">
                        {accessoryFieldLabels[h.fieldPath] ?? "Catalog details"}{" "}
                        · Revision {h.revision}
                      </p>
                      <MetadataSource attribution={h.attribution} />
                      <time dateTime={h.createdAt} className="text-sm">
                        {h.createdAt}
                      </time>
                      <details>
                        <summary className="min-h-11 cursor-pointer py-3">
                          View change
                        </summary>
                        <p>Before</p>
                        <pre className="whitespace-pre-wrap break-all text-sm">
                          {h.before}
                        </pre>
                        <p>After</p>
                        <pre className="whitespace-pre-wrap break-all text-sm">
                          {h.after}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form
                action="/app/catalog/accessories"
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="kind" value={data.kind} />
                <label className="space-y-2">
                  <span className="block text-sm">Record status</span>
                  <select
                    name="archived"
                    defaultValue={data.archived}
                    className="min-h-12 rounded-lg border border-input bg-background px-3"
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="all">All records</option>
                  </select>
                </label>
                <Button type="submit" variant="outline">
                  Apply status
                </Button>
              </form>
              <Button asChild>
                <Link href={`/app/catalog/accessories?kind=${data.kind}&new=1`}>
                  {data.kind === "accessory"
                    ? "Add accessory family"
                    : "Add accessory variant"}
                </Link>
              </Button>
            </div>
            {data.records.length ? (
              <ul
                aria-label={
                  data.kind === "accessory"
                    ? "Accessory families"
                    : "Accessory variants"
                }
                className="space-y-3"
              >
                {data.records.map((r) => (
                  <li
                    key={r.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4"
                  >
                    <div className="min-w-0">
                      <h2 className="font-medium [overflow-wrap:anywhere]">
                        {r.name}
                      </h2>
                      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                        {r.slug}
                        {r.archived ? " · Archived" : ""}
                      </p>
                    </div>
                    <Button asChild variant="outline">
                      <Link
                        href={`/app/catalog/accessories?kind=${data.kind}&id=${r.id}`}
                        aria-label={`Edit ${r.name}`}
                      >
                        Edit
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No accessory catalog records yet.</p>
            )}
            <nav aria-label="Catalog pages" className="flex gap-3">
              {data.page > 1 && (
                <Button asChild variant="outline">
                  <Link href={href(data.page - 1)}>Previous page</Link>
                </Button>
              )}
              {data.hasNext && (
                <Button asChild variant="outline">
                  <Link href={href(data.page + 1)}>Next page</Link>
                </Button>
              )}
            </nav>
          </>
        )}
      </PageContainer>
    </ApplicationShell>
  );
}
