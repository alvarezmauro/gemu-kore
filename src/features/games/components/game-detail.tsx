import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magic/magic-card";
import { BlurFade } from "@/components/magic/blur-fade";
import { ConsoleImage } from "@/features/consoles/components/console-image";
import { severityLabels, statusLabels } from "@/features/defects/contracts";
import type { GameCopyDetail } from "../management-contracts";
import type { CopyLocation } from "../creation-contracts";
import { GameReleaseSummary } from "./game-release-summary";
import { GameControls } from "./game-controls";
export function GameDetail({
  detail: d,
  provenance,
  canManage,
  locations,
  screenshots,
  trailer,
  playtime,
}: {
  detail: GameCopyDetail;
  provenance: GameProvenance;
  canManage: boolean;
  locations: CopyLocation[];
  screenshots: ScreenshotGalleryData;
  playtime: {
    estimates: Playtime | null;
    scope: "game" | "release";
    canManage: boolean;
  };
  trailer: { reference: TrailerReference | null; scope: "game" | "release" };
}) {
  return (
    <div className="min-w-0 space-y-8">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {d.publicationStatus === "PRIVATE"
            ? "Private copy"
            : "Published copy"}
        </Badge>
        {(d.game.archived || d.release.archived || d.platform.archived) && (
          <Badge variant="outline">Catalog identity archived</Badge>
        )}
      </div>
      {canManage && (
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
      )}
      {canManage &&
        !d.game.archived &&
        !d.release.archived &&
        !d.platform.archived && (
          <EnrichmentLinks gameId={d.game.id} releaseId={d.release.id} />
        )}
      <section
        aria-label="Game identity"
        className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
      >
        <div className="min-w-0">
          {d.cover ? (
            <>
              <ConsoleImage
                url={d.cover.url}
                alt={d.cover.alt}
                width={d.cover.width}
                height={d.cover.height}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                Catalog cover ·{" "}
                {d.cover.scope === "release"
                  ? "Release cover"
                  : "Game default; no release cover recorded"}
                {d.cover.caption ? ` · ${d.cover.caption}` : ""}
              </p>
              <details className="mt-3 rounded-lg bg-muted p-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm">
                  Cover source details
                </summary>
                <AssetSource source={d.cover.source} />
              </details>
            </>
          ) : (
            <div className="flex aspect-[3/2] items-center justify-center rounded-xl bg-stone p-6 text-center text-muted-foreground">
              No catalog cover available
            </div>
          )}
        </div>
        <MagicCard className="space-y-4 p-5 [overflow-wrap:anywhere]">
          <BlurFade>
            <p className="text-sm text-muted-foreground">{d.platform.name}</p>
            <h2 className="mt-1 font-heading text-2xl">{d.game.name}</h2>
            <p className="mt-2">{d.release.name}</p>
          </BlurFade>
          <p className="text-sm">
            Markets:{" "}
            {d.release.markets.map((m) => m.name).join(", ") || "Unknown"}
          </p>
          <p className="text-sm">
            Publisher:{" "}
            {d.credits
              .filter((c) => c.role === "PUBLISHER")
              .map((c) => `${c.company}${c.market ? ` (${c.market})` : ""}`)
              .join(", ") || "Unknown"}
          </p>
          <p className="text-sm">
            First release year (market unknown):{" "}
            {d.firstReleaseYear ?? "Unknown"}
          </p>
        </MagicCard>
      </section>
      <nav aria-label="Game sections" className="flex flex-wrap gap-3 text-sm">
        {[
          ["My copy", "my-copy"],
          ["About", "about-game"],
          ["Screenshots", "screenshots"],
          ["Trailer", "game-trailer"],
          ["Playtime", "game-playtime"],
          ["Release and contents", "game-release"],
          ["Personal photos", "game-photos"],
          ["Metadata sources", "game-sources"],
        ].map(([label, id]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-secondary-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            {label}
          </a>
        ))}
      </nav>
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
          {d.release.description ??
            d.game.description ??
            "No description recorded."}
        </p>
        <p className="[overflow-wrap:anywhere]">
          Developer: {d.developers.join(", ") || "Unknown"}
        </p>
        <h3 className="font-medium">Release company credits</h3>
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
      </section>
      <section
        id="game-release"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="game-release-title"
      >
        <h2 id="game-release-title" className="font-heading text-2xl">
          Release and expected contents
        </h2>
        <GameReleaseSummary release={d.release} />
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
      <section
        id="game-playtime"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="game-playtime-title"
      >
        <h2 id="game-playtime-title" className="font-heading text-2xl">
          Playtime
        </h2>
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
      <section
        id="game-photos"
        className="scroll-mt-24 space-y-4"
        aria-labelledby="game-photos-title"
      >
        <h2 id="game-photos-title" className="font-heading text-2xl">
          Personal photos
        </h2>
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
      <GameSources provenance={provenance} />
    </div>
  );
}
