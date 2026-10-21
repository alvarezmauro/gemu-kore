import Link from "next/link";
import {
  Layers,
  Gamepad2,
  Disc3,
  Cable,
  Package,
  Wrench,
  ArrowUpRight,
} from "lucide-react";
import { BentoGrid, BentoCard } from "@/components/magic/bento-grid";
import { NumberTicker } from "@/components/magic/number-ticker";
import { AnimatedList } from "@/components/motion/animated-list";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RecentImage } from "./recent-image";
import { RefreshOverview } from "./refresh-overview";
import type { DashboardData } from "../contracts";
const categoryLabels = {
  CONSOLE: "Console",
  GAME: "Game",
  ACCESSORY: "Accessory",
};
export function Dashboard({ data: d }: { data: DashboardData }) {
  const categories = [
    { key: "consoles", label: "Consoles", type: "console", Icon: Gamepad2 },
    { key: "games", label: "Games", type: "game", Icon: Disc3 },
    {
      key: "accessories",
      label: "Accessories",
      type: "accessory",
      Icon: Cable,
    },
  ] as const;
  return (
    <div className="min-w-0 space-y-8 [overflow-wrap:anywhere] [&_a]:max-w-full [&_a]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal">
      <PageHeader
        title="Your collection"
        description="A little overview of the physical games, consoles and accessories you keep."
        action={
          <Button asChild variant="outline">
            <Link href="/app/collection">Browse collection</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary">
          {d.role === "ADMIN"
            ? "Administrator"
            : d.role === "EDITOR"
              ? "Editor"
              : "Viewer"}
        </Badge>
        <p className="text-sm text-muted-foreground">
          Private collection overview
        </p>
        <RefreshOverview />
      </div>
      <BentoGrid aria-label="Collection overview">
        <BentoCard
          aria-labelledby="dashboard-total"
          className="sm:col-span-2 xl:col-span-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <h2
                id="dashboard-total"
                className="flex items-center gap-2 text-base font-medium"
              >
                <Layers className="size-5" aria-hidden="true" />
                Total items
              </h2>
              <p className="mt-3 font-heading text-5xl tracking-tight sm:text-6xl">
                <NumberTicker value={d.counts.total} />
              </p>
              <p className="mt-3 max-w-prose text-sm text-muted-foreground">
                Each owned copy counts once, including copies of the same
                catalog item.
              </p>
            </div>
            <div className="max-w-sm space-y-2">
              <p className="font-heading text-xl">
                Room for every part of your collection.
              </p>
              <p className="text-sm text-muted-foreground">
                Explore what you own, revisit recent additions, or record your
                next find.
              </p>
            </div>
          </div>
        </BentoCard>
        {categories.map(({ key, label, type, Icon }) => (
          <BentoCard key={key} aria-labelledby={`dashboard-${key}`}>
            <h2
              id={`dashboard-${key}`}
              className="flex items-center gap-2 font-medium"
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </h2>
            <p className="font-heading text-4xl">
              <NumberTicker value={d.counts[key]} />
            </p>
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-sm text-link underline underline-offset-4"
              href={`/app/collection?type=${type}`}
            >
              Browse {label.toLowerCase()}
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          </BentoCard>
        ))}
        <BentoCard aria-labelledby="dashboard-boxed">
          <h2
            id="dashboard-boxed"
            className="flex items-center gap-2 font-medium"
          >
            <Package className="size-5" aria-hidden="true" />
            Boxed items
          </h2>
          <p className="font-heading text-4xl">
            <NumberTicker value={d.counts.boxed} />
          </p>
          <p className="text-sm text-muted-foreground">
            Copies confirmed to have a box. This does not establish
            completeness.
          </p>
          <Link
            className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4"
            href="/app/collection?hasBox=true"
          >
            Browse boxed items
          </Link>
        </BentoCard>
        <BentoCard
          aria-labelledby="dashboard-defects"
          className="xl:col-span-2"
        >
          <h2
            id="dashboard-defects"
            className="flex items-center gap-2 font-medium"
          >
            <Wrench className="size-5" aria-hidden="true" />
            Items with active defects
          </h2>
          <p className="font-heading text-4xl">
            <NumberTicker value={d.counts.activeDefects} />
          </p>
          <p className="text-sm text-muted-foreground">
            Copies with at least one active defect, counted once per copy.
            Accepted and repaired defects are excluded.
          </p>
          <Link
            className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4"
            href="/app/defects"
          >
            Review defect records
          </Link>
        </BentoCard>
      </BentoGrid>
      <section aria-labelledby="dashboard-recent" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dashboard-recent" className="font-heading text-2xl">
            Recently added
          </h2>
          <Button asChild variant="outline">
            <Link href="/app/collection?sort=newest">
              View all recent additions
            </Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Your newest physical copies. Dates are shown in UTC.
          {d.moreRecent ? " Showing the latest eight copies." : ""}
        </p>
        {d.recent.length ? (
          <AnimatedList
            label="Recently added copies"
            items={d.recent.map((item) => ({
              id: item.id,
              content: (
                <Link
                  href={item.href}
                  className="flex min-w-0 items-start gap-4 rounded-xl bg-card p-4 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <RecentImage photo={item.photo} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-heading">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.context}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{categoryLabels[item.type]}</span>
                      <span>
                        Added{" "}
                        <time dateTime={item.addedAt}>{item.addedLabel}</time>
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight
                    className="mt-1 size-4 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              ),
            }))}
          />
        ) : (
          <EmptyState
            title="Your collection starts here"
            description={
              d.canManage
                ? "Add your first physical copy to see your collection take shape."
                : "No physical copies have been added yet. An editor can add the first item."
            }
            action={
              d.canManage ? (
                <Button asChild>
                  <Link href="/app/games/new">Add your first game</Link>
                </Button>
              ) : undefined
            }
          />
        )}
      </section>
      <section
        aria-labelledby="dashboard-workspace"
        className="space-y-4 rounded-xl bg-card p-5 sm:p-6"
      >
        <h2 id="dashboard-workspace" className="font-heading text-2xl">
          Collection workspace
        </h2>
        <div className="flex flex-wrap gap-3">
          {d.canManage && (
            <>
              <Button asChild>
                <Link href="/app/consoles/new">Add console</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/games/new">Add game</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/accessories/new">Add accessory</Link>
              </Button>
            </>
          )}
          <Button asChild variant="outline">
            <Link href="/app/search">Search collection</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/locations">
              {d.canManage ? "Manage locations" : "View locations"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/defects">
              {d.canManage ? "Manage defects" : "View defects"}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/media">
              {d.canManage ? "Manage photos" : "View photos"}
            </Link>
          </Button>
          {d.role === "ADMIN" && (
            <Button asChild variant="outline">
              <Link href="/app/catalog">Manage console catalog</Link>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
