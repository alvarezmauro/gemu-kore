import Link from "next/link";
import { MetadataSource } from "@/features/provenance/components/metadata-source";
import { notFound, redirect } from "next/navigation";
import { ApplicationShell } from "@/components/layout/application-shell";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { getGameCatalogPageData } from "@/features/games/queries.server";
import { GameCatalogEditor } from "@/features/games/components/game-catalog-editor";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Game catalog | GemuKore",
  referrer: "same-origin",
};
export default async function GameCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const data = await getGameCatalogPageData({
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
        title="Game catalog unavailable"
        description="We couldn't load the game catalog. Please try again."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  const href = (page: number) =>
    `/app/catalog/games?kind=${data.kind}&archived=${data.archived}&page=${page}`;
  return (
    <ApplicationShell
      context="Catalog administration"
      items={[
        { label: "Your collection", href: "/app", icon: "overview" },
        { label: "Console catalog", href: "/app/catalog", icon: "forms" },
        {
          label: "Game catalog",
          href: "/app/catalog/games",
          icon: "forms",
          current: true,
        },
        {
          label: "Accessory catalog",
          href: "/app/catalog/accessories",
          icon: "forms",
        },
      ]}
    >
      <PageContainer>
        <PageHeader
          title="Game catalog"
          description="Curate titles, their physical releases and expected edition contents. Personal copies are separate from these shared facts."
        />
        <nav
          aria-label="Game catalog sections"
          className="flex flex-wrap gap-2"
        >
          {(["game", "release"] as const).map((kind) => (
            <Button
              asChild
              key={kind}
              variant={kind === data.kind ? "default" : "outline"}
            >
              <Link
                href={`/app/catalog/games?kind=${kind}`}
                aria-current={kind === data.kind ? "page" : undefined}
              >
                {kind === "game" ? "Games" : "Game releases"}
              </Link>
            </Button>
          ))}
        </nav>
        {params.saved === "1" && <p role="status">Catalog record saved.</p>}
        {data.selected || params.new === "1" ? (
          <>
            <GameCatalogEditor
              key={`${data.kind}-${data.selected?.id ?? "new"}-${data.selected?.revision ?? 0}`}
              kind={data.kind}
              record={data.selected}
            />
            {data.selected?.kind === "release" && (
              <Button asChild variant="outline">
                <Link
                  href={`/app/catalog/games/screenshots?releaseId=${data.selected.id}`}
                >
                  Manage release screenshots
                </Link>
              </Button>
            )}
            {data.selected?.kind === "release" && (
              <Button asChild variant="outline">
                <Link
                  href={`/app/catalog/games/packaging?releaseId=${data.selected.id}`}
                >
                  Manage release packaging
                </Link>
              </Button>
            )}
            {data.selected?.kind === "release" && (
              <Button asChild variant="outline">
                <Link
                  href={`/app/catalog/games/cartridges?releaseId=${data.selected.id}`}
                >
                  Manage release cartridges
                </Link>
              </Button>
            )}
            {data.selected && (
              <Button asChild variant="outline">
                <Link
                  href={`/app/catalog/games/trailer?kind=${data.kind}&id=${data.selected.id}`}
                >
                  Manage trailer
                </Link>
              </Button>
            )}
            {data.selected && (
              <Button asChild variant="outline">
                <Link
                  href={`/app/catalog/games/playtime?kind=${data.kind}&id=${data.selected.id}`}
                >
                  Manage playtime
                </Link>
              </Button>
            )}
            {data.selected && (
              <section
                className="max-w-3xl space-y-4"
                aria-labelledby="game-history-title"
              >
                <h2 id="game-history-title" className="font-heading text-xl">
                  Change history
                </h2>
                <p className="text-sm text-muted-foreground">
                  Latest 50 field changes. All changes remain stored.
                </p>
                <ol className="space-y-3">
                  {data.history.map((h) => (
                    <li key={h.id} className="rounded-xl bg-card p-4">
                      <p>
                        {h.fieldPath} · Revision {h.revision}
                      </p>
                      <MetadataSource attribution={h.attribution} />
                      <time className="text-sm" dateTime={h.createdAt}>
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
                action="/app/catalog/games"
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
                <Link href={`/app/catalog/games?kind=${data.kind}&new=1`}>
                  {data.kind === "game" ? "Add game" : "Add game release"}
                </Link>
              </Button>
            </div>
            {data.records.length ? (
              <ul
                aria-label={data.kind === "game" ? "Games" : "Game releases"}
                className="space-y-3"
              >
                {data.records.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4"
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
                    <Button variant="outline" asChild>
                      <Link
                        href={`/app/catalog/games?kind=${data.kind}&id=${r.id}`}
                      >
                        Edit {r.name}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No catalog records yet.</p>
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
