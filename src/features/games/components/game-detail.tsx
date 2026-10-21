import Link from "next/link";
import { GamePackaging } from "@/features/physical-editions/components/game-packaging";
import type { MediaComponent } from "@/features/physical-media/contracts";
import type { PackagingComponent } from "@/features/physical-editions/contracts";
import { GameSources } from "@/features/provenance/components/game-sources";
import { AssetSource } from "@/features/provenance/components/asset-source";
import type { GameProvenance } from "@/features/provenance/contracts";
import { EnrichmentLinks } from "@/features/enrichment/components/enrichment-links";
import { PlaytimeSummary } from "./playtime-summary";
import type { Playtime } from "../playtime-validation";
import { TrailerPlayer } from "./trailer-player";
import type { TrailerReference } from "../trailer-validation";
import { ScreenshotGallery } from "./screenshot-gallery";
import type { ScreenshotGalleryData } from "../screenshot-contracts";
import { Button } from "@/components/ui/button";
import { ConsoleImage } from "@/features/consoles/components/console-image";
import { severityLabels, statusLabels } from "@/features/defects/contracts";
import type { GameCopyDetail } from "../management-contracts";
import type { CopyLocation } from "../creation-contracts";
import { GameReleaseSummary } from "./game-release-summary";
import { GameControls } from "./game-controls";
import { GameDetailHero } from "./game-detail-hero";
import { GameSectionNav } from "./game-section-nav";
import { gameDetailPresentation } from "../detail-presentation";
const identifierLabels: Record<string, string> = {
  PRODUCT_CODE: "Product code",
  UPC: "UPC",
  EAN: "EAN",
  OTHER: "Other identifier",
};
export function GameDetail({
  detail: d,
  provenance,
  canManage,
  locations,
  screenshots,
  trailer,
  playtime,
  packaging,
  media = [],
}: {
  detail: GameCopyDetail;
  provenance: GameProvenance;
  canManage: boolean;
  locations: CopyLocation[];
  screenshots: ScreenshotGalleryData;
  packaging: PackagingComponent[];
  media?: MediaComponent[];
  playtime: {
    estimates: Playtime | null;
    scope: "game" | "release";
    canManage: boolean;
  };
  trailer: { reference: TrailerReference | null; scope: "game" | "release" };
}) {
  const presentation = gameDetailPresentation(d);
  return (
    <div className="min-w-0 space-y-8">
      <GameDetailHero
        detail={d}
        presentation={presentation}
        actions={
          canManage ? (
            <GameControls
              key={d.id}
              detail={{
                id: d.id,
                revision: d.revision,
                fields: d.fields,
                game: d.game,
                platform: d.platform,
                release: d.release,
              }}
              locations={locations}
            />
          ) : undefined
        }
      />
      <GameSectionNav />
      <section
        id="my-copy"
        className="scroll-mt-24 space-y-5 rounded-xl bg-card p-5 sm:p-6"
        aria-labelledby="my-copy-title"
      >
        <h2 id="my-copy-title" className="font-heading text-2xl">
          My copy
        </h2>
        <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
          {[
            ["Edition", presentation.edition],
            ["Release markets", presentation.markets],
            ["Serial number", d.fields.serialNumber || "Not recorded"],
            ["Observed markings", d.fields.observedMarkings || "Not recorded"],
            ["Location", d.location || "Unassigned"],
            [
              "Has box",
              d.fields.hasBox === "unknown"
                ? "Unknown"
                : d.fields.hasBox === "yes"
                  ? "Yes"
                  : "No",
            ],
            ["Private notes", d.fields.notes || "None"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Box possession does not imply completeness. Market and edition come
          from the selected release.
        </p>
        <h3 className="font-heading text-xl">Defects ({d.defectCount})</h3>
        {d.defects.length ? (
          <ul className="space-y-4">
            {d.defects.map((f) => (
              <li key={f.id} className="space-y-1 [overflow-wrap:anywhere]">
                <p className="font-medium">{f.title}</p>
                <p className="text-sm text-muted-foreground">
                  {severityLabels[f.severity]} · {statusLabels[f.status]}
                </p>
                {f.description && (
                  <p className="whitespace-pre-wrap text-sm">{f.description}</p>
                )}
                {f.repairNote && (
                  <p className="whitespace-pre-wrap text-sm">
                    Repair note: {f.repairNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No defects recorded.</p>
        )}
        {d.defectCount > d.defects.length && (
          <p className="text-sm">
            Showing the first {d.defects.length} defects. Open Defects to view
            all records.
          </p>
        )}
        <Button asChild variant="outline">
          <Link href={`/app/defects?itemId=${d.id}`}>
            {canManage ? "Manage defects" : "View defects"}
          </Link>
        </Button>
        <section
          id="game-photos"
          className="scroll-mt-24 space-y-4 border-t border-border pt-6"
          aria-labelledby="game-photos-title"
        >
          <h3 id="game-photos-title" className="font-heading text-2xl">
            Personal photos
          </h3>
          {d.photos.length ? (
            <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.photos.map((photo, i) => (
                <li key={`${photo.url}:${i}`} className="min-w-0">
                  <ConsoleImage
                    url={photo.url}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                  />
                  <details className="mt-3 rounded-lg bg-muted p-3">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm">
                      Photo {i + 1} source details
                    </summary>
                    <AssetSource source={photo.source} />
                  </details>
                  {photo.caption && (
                    <p className="mt-2 text-sm [overflow-wrap:anywhere]">
                      {photo.caption}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No personal photos recorded.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Showing up to 12 personal photos.
          </p>
          <Button asChild variant="outline">
            <Link href={`/app/media?itemId=${d.id}`}>
              {canManage ? "Manage photos" : "View photos"}
            </Link>
          </Button>
        </section>
      </section>
      <section
        id="about-game"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="about-game-title"
      >
        <h2 id="about-game-title" className="font-heading text-2xl">
          About
        </h2>
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {presentation.description}
        </p>
        <p className="[overflow-wrap:anywhere]">
          Game developers: {presentation.developers}
        </p>
        <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">Publisher</dt>
            <dd className="mt-1 [overflow-wrap:anywhere]">
              {presentation.publishers}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Rating</dt>
            <dd className="mt-1">Not recorded</dd>
          </div>
        </dl>
        <div className="space-y-3">
          <h3 className="font-heading text-xl">Release dates</h3>
          {presentation.dates.length ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              {presentation.dates.map((date) => (
                <div key={date.id}>
                  <dt className="text-sm text-muted-foreground">
                    {date.label}
                  </dt>
                  <dd className="mt-1">{date.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              No market dates recorded.
            </p>
          )}
          {presentation.yearLabel === "First release year (market unknown)" && (
            <p className="text-sm">
              {presentation.yearLabel}: {presentation.year}
            </p>
          )}
        </div>
        <div className="space-y-3">
          <h3 className="font-heading text-xl">Catalog product identifiers</h3>
          <p className="text-sm text-muted-foreground">
            Identifiers for the selected release. Your copy’s serial number and
            observed markings are recorded under My copy.
          </p>
          {d.productIdentifiers.length ? (
            <ul className="space-y-2 text-sm [overflow-wrap:anywhere]">
              {d.productIdentifiers.map((identifier, i) => (
                <li key={i}>
                  <span className="font-medium">
                    {identifierLabels[identifier.scheme] ?? "Identifier"}:{" "}
                    {identifier.value}
                  </span>
                  {identifier.issuer && ` · ${identifier.issuer}`}
                  {identifier.marketNote && ` · ${identifier.marketNote}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No product identifiers recorded.
            </p>
          )}
          {d.moreProductIdentifiers && (
            <p className="text-sm text-muted-foreground">
              Showing the first 20 catalog identifiers.
            </p>
          )}
        </div>
        <h3 className="font-heading text-xl">Release company credits</h3>
        {d.credits.length ? (
          <ul className="space-y-2 text-sm [overflow-wrap:anywhere]">
            {d.credits.map((c, i) => (
              <li key={i}>
                {c.company} · {c.role.toLowerCase().replaceAll("_", " ")}
                {c.label ? ` · ${c.label}` : ""} ·{" "}
                {c.market ?? "All release markets"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No company credits recorded.
          </p>
        )}
        <section
          id="game-playtime"
          className="scroll-mt-24 space-y-4"
          aria-labelledby="game-playtime-title"
        >
          <h3 id="game-playtime-title" className="font-heading text-2xl">
            Playtime
          </h3>
          {playtime.estimates && (
            <p className="text-sm text-muted-foreground">
              {playtime.scope === "release"
                ? "Estimates for this release."
                : "Game default estimates; this release has no playtime override."}{" "}
              Blank durations are unknown.
            </p>
          )}
          <PlaytimeSummary estimates={playtime.estimates} />
          {playtime.canManage && (
            <Button asChild variant="outline">
              <Link
                href={`/app/catalog/games/playtime?kind=release&id=${d.release.id}`}
              >
                Manage release playtime
              </Link>
            </Button>
          )}
        </section>
      </section>
      <section
        id="screenshots"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="screenshots-title"
      >
        <h2 id="screenshots-title" className="font-heading text-2xl">
          Screenshots
        </h2>
        <ScreenshotGallery
          gallery={screenshots}
          previous={
            screenshots.page > 1
              ? `/app/games/${d.id}?screenshotsPage=${screenshots.page - 1}#screenshots`
              : undefined
          }
          next={
            screenshots.hasNext
              ? `/app/games/${d.id}?screenshotsPage=${screenshots.page + 1}#screenshots`
              : undefined
          }
        />
        {screenshots.canManage && (
          <Button asChild variant="outline">
            <Link
              href={`/app/catalog/games/screenshots?releaseId=${d.release.id}`}
            >
              Manage release screenshots
            </Link>
          </Button>
        )}
      </section>
      <section
        id="game-packaging"
        aria-labelledby="game-packaging-title"
        className="scroll-mt-24 space-y-4"
      >
        <h2 id="game-packaging-title" className="font-heading text-2xl">
          Physical edition
        </h2>
        <GamePackaging
          key={`${d.id}:${d.release.revision}`}
          id={d.id}
          copyRevision={d.revision}
          releaseRevision={d.release.revision}
          components={[...packaging, ...media]}
        />
        {screenshots.canManage && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link
                href={`/app/catalog/games/packaging?releaseId=${d.release.id}`}
              >
                Manage release packaging
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link
                href={`/app/catalog/games/cartridges?releaseId=${d.release.id}`}
              >
                Manage release cartridges
              </Link>
            </Button>
          </div>
        )}
      </section>
      <section
        id="game-release"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="game-release-title"
      >
        <h2 id="game-release-title" className="font-heading text-2xl">
          Edition contents
        </h2>
        <GameReleaseSummary release={d.release} />
      </section>
      <section
        id="game-trailer"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="game-trailer-title"
      >
        <h2 id="game-trailer-title" className="font-heading text-2xl">
          Trailer
        </h2>
        {trailer.reference && (
          <p className="text-sm text-muted-foreground">
            {trailer.scope === "release"
              ? "Trailer for this release."
              : "Game-level trailer; this release has no trailer override."}
          </p>
        )}
        <TrailerPlayer
          key={JSON.stringify(trailer.reference)}
          trailer={trailer.reference}
          title={`Trailer for ${d.game.name}`}
        />
        {screenshots.canManage && (
          <Button asChild variant="outline">
            <Link
              href={`/app/catalog/games/trailer?kind=release&id=${d.release.id}`}
            >
              Manage release trailer
            </Link>
          </Button>
        )}
      </section>
      <GameSources provenance={provenance} />
      {canManage &&
        !d.game.archived &&
        !d.release.archived &&
        !d.platform.archived && (
          <EnrichmentLinks gameId={d.game.id} releaseId={d.release.id} />
        )}
    </div>
  );
}
