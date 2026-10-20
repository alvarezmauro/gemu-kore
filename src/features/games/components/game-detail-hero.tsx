import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magic/magic-card";
import { BlurFade } from "@/components/magic/blur-fade";
import { AssetSource } from "@/features/provenance/components/asset-source";
import type { GameCopyDetail } from "../management-contracts";
import type { GameDetailPresentation } from "../detail-presentation";
import { GameCover } from "./game-cover";

export function GameDetailHero({
  detail: d,
  presentation: p,
  actions,
}: {
  detail: GameCopyDetail;
  presentation: GameDetailPresentation;
  actions?: ReactNode;
}) {
  return (
    <section
      aria-label="Game identity"
      className="grid min-w-0 items-start gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:grid-rows-[max-content_1fr] lg:gap-8"
    >
      <div className="min-w-0 space-y-4 [overflow-wrap:anywhere] md:col-start-2 md:row-start-1">
        <BlurFade>
          <p className="text-sm text-muted-foreground">{d.platform.name}</p>
          <h1 className="mt-2 font-heading text-[28px] leading-9 tracking-[-0.035em] sm:text-[32px] sm:leading-10">
            {d.game.name}
          </h1>
          <p className="mt-3 text-lg text-body">{p.edition}</p>
          {d.release.printingLabel && (
            <p className="mt-1 text-sm text-muted-foreground">
              {d.release.printingLabel}
            </p>
          )}
        </BlurFade>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {d.publicationStatus === "PRIVATE"
              ? "Private copy"
              : "Published copy"}
          </Badge>
          {(d.game.archived || d.release.archived || d.platform.archived) && (
            <Badge variant="outline">Catalog identity archived</Badge>
          )}
          {d.release.identificationStatus === "INCOMPLETE" && (
            <Badge variant="outline">Identity incomplete</Badge>
          )}
          <span className="text-sm text-muted-foreground">
            Copy {d.id.slice(0, 8)}
          </span>
        </div>
        {actions}
      </div>
      <div className="mx-auto w-full max-w-80 min-w-0 md:col-start-1 md:row-span-2 md:row-start-1 md:max-w-none">
        <GameCover
          cover={
            d.cover
              ? {
                  url: d.cover.url,
                  alt: d.cover.alt,
                  width: d.cover.width,
                  height: d.cover.height,
                }
              : null
          }
        />
        {d.cover && (
          <>
            <p className="mt-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
              Catalog cover ·{" "}
              {d.cover.scope === "release"
                ? "Release cover"
                : "Game default; no release cover recorded"}
              {d.cover.caption ? ` · ${d.cover.caption}` : ""}
            </p>
            <details className="mt-2 rounded-lg bg-muted px-3">
              <summary className="min-h-11 cursor-pointer py-3 text-sm">
                Cover source details
              </summary>
              <AssetSource source={d.cover.source} />
            </details>
          </>
        )}
      </div>
      <MagicCard className="h-auto p-5 sm:p-6 md:col-start-2 md:row-start-2">
        <div className="space-y-6 [overflow-wrap:anywhere]">
          <dl className="grid min-w-0 gap-x-6 gap-y-5 sm:grid-cols-2">
            {[
              ["Publisher", p.publishers],
              [p.yearLabel, p.year],
              ["Release markets", p.markets],
              ["Rating", "Not recorded"],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 whitespace-pre-wrap">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </MagicCard>
    </section>
  );
}
