import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magic/magic-card";
import { BlurFade } from "@/components/magic/blur-fade";
import { ConsoleImage } from "@/features/consoles/components/console-image";
import { TrailerPlayer } from "@/features/games/components/trailer-player";
import {
  severityLabels,
  statusLabels,
  type DefectSeverity,
  type DefectStatus,
} from "@/features/defects/contracts";
import type {
  AccessoryCopyDetail,
  CopyLocation,
  AccessoryModel,
  Choices,
} from "../copy-contracts";
import type {
  AccessoryPresentation,
  AccessoryScope,
} from "../detail-contracts";
import { AccessoryEnrichmentLinks } from "@/features/enrichment/components/accessory-enrichment-links";
import { AccessoryControls } from "./accessory-controls";
import { AccessoryModelFiles } from "./accessory-model-files";
import { AccessoryModelViewer } from "./accessory-model-viewer";
import { AccessoryGallery } from "./accessory-gallery";
import { AccessorySectionNav } from "./accessory-section-nav";
import { AssetSource } from "@/features/provenance/components/asset-source";
const scope = (value: AccessoryScope) =>
  value === "family"
    ? "Accessory family default"
    : value === "variant"
      ? "Selected variant"
      : "Not recorded";
function Facts({
  entries,
}: {
  entries: { label: string; value: string | number | null }[];
}) {
  return (
    <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
      {entries.map((e) => (
        <div key={e.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{e.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap">{e.value ?? "Unknown"}</dd>
        </div>
      ))}
    </dl>
  );
}
const sectionClass =
  "min-w-0 scroll-mt-24 space-y-5 rounded-xl bg-card p-5 sm:p-6";
export function AccessoryCopy({
  detail: d,
  presentation: p,
  locations,
  canManage,
  models,
}: {
  detail: AccessoryCopyDetail;
  presentation: AccessoryPresentation;
  locations: CopyLocation[];
  canManage: boolean;
  models: Choices<AccessoryModel> & { selected: AccessoryModel | null };
}) {
  return (
    <div className="min-w-0 space-y-8 [overflow-wrap:anywhere] [&_a]:max-w-full [&_a]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal">
      <PageHeader
        title={`${d.accessory.name} · ${d.variant.name}`}
        description="Your physical accessory copy."
        action={
          <Button asChild variant="outline">
            <Link href="/app/collection">Browse collection</Link>
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {d.publicationStatus === "PRIVATE"
            ? "Private copy"
            : "Published copy"}
        </Badge>
        {d.variant.identificationStatus === "INCOMPLETE" && (
          <Badge variant="outline">Identity incomplete</Badge>
        )}
        {(d.accessory.archived || d.variant.archived) && (
          <Badge variant="outline">Catalog identity archived</Badge>
        )}
      </div>
      {canManage && <AccessoryControls detail={d} locations={locations} />}
      <section
        aria-label="Accessory identity preview"
        className="grid min-w-0 gap-6 lg:grid-cols-2"
      >
        <div className="min-w-0 space-y-3">
          {p.model ? (
            <AccessoryModelViewer
              key={`${d.id}:${d.revision}:${p.model.selectionKey}`}
              id={d.id}
              revision={d.revision}
              selectionKey={p.model.selectionKey}
              title={`${d.accessory.name} · ${d.variant.name}`}
              source={p.model.source}
              poster={p.poster}
            />
          ) : p.poster ? (
            <ConsoleImage {...p.poster} />
          ) : (
            <div className="flex aspect-[3/2] items-center justify-center rounded-xl bg-stone p-6 text-center text-muted-foreground">
              No accessory preview available
            </div>
          )}
          {p.model ? (
            <p className="text-sm">
              <a
                className="inline-flex min-h-11 items-center text-link underline underline-offset-4"
                href={p.model.url}
                download
              >
                Download 3D file
              </a>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No 3D file available.
            </p>
          )}
        </div>
        <MagicCard className="p-5 sm:p-6">
          <div className="space-y-6">
            <BlurFade>
              <p className="text-sm text-muted-foreground">Accessory family</p>
              <p className="mt-1 font-heading text-2xl">{d.accessory.name}</p>
              <p className="mt-2 text-body">{d.variant.name}</p>
            </BlurFade>
            <Facts
              entries={[
                { label: "Producer", value: d.variant.producer },
                { label: "Release year", value: d.variant.year },
                { label: "Color", value: d.variant.color },
                { label: "Edition", value: d.variant.edition },
              ]}
            />
            <div>
              <p className="text-sm text-muted-foreground">
                Platform compatibility
              </p>
              <p className="mt-1">
                {d.variant.platforms.map((v) => v.name).join(" · ") ||
                  "Not recorded"}
              </p>
              <a
                className="inline-flex min-h-11 items-center text-sm text-link underline underline-offset-4"
                href="#accessory-compatibility"
              >
                View compatibility notes
              </a>
            </div>
          </div>
        </MagicCard>
      </section>
      {p.model && (
        <details className="rounded-lg bg-muted p-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm">
            3D file source details
          </summary>
          <AssetSource source={p.model.attribution} kind="model" />
        </details>
      )}
      <AccessorySectionNav />
      <section
        id="my-accessory"
        aria-labelledby="copy-details-heading"
        className={sectionClass}
      >
        <h2 id="copy-details-heading" className="font-heading text-2xl">
          My copy
        </h2>
        <Facts
          entries={[
            { label: "Copy reference", value: d.id },
            {
              label: "Serial number",
              value: d.fields.serialNumber || "Not recorded",
            },
            {
              label: "Has box",
              value: { yes: "Yes", no: "No", unknown: "Unknown" }[
                d.fields.hasBox
              ],
            },
            { label: "Location", value: d.location || "Unassigned" },
            {
              label: "Observed markings",
              value: d.fields.observedMarkings || "Not recorded",
            },
            { label: "Private notes", value: d.fields.notes || "None" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Has box records only whether its box is present. It does not establish
          completeness.
        </p>
        <h3 id="copy-defects-heading" className="font-heading text-xl">
          Defects ({d.defectCount})
        </h3>
        {d.defects.length ? (
          <ul className="space-y-3">
            {d.defects.map((f) => (
              <li key={f.id} className="space-y-2 rounded-xl bg-muted p-4">
                <h4 className="font-medium">{f.title}</h4>
                <p className="text-sm text-muted-foreground">
                  {severityLabels[f.severity as DefectSeverity]} ·{" "}
                  {statusLabels[f.status as DefectStatus]}
                </p>
                {f.description && (
                  <p className="whitespace-pre-wrap text-sm">{f.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No defects recorded. This does not establish that the copy is
            defect-free.
          </p>
        )}
        {d.defectCount > d.defects.length && (
          <p className="text-sm text-muted-foreground">
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
        id="accessory-information"
        aria-labelledby="accessory-information-heading"
        className={sectionClass}
      >
        <h2
          id="accessory-information-heading"
          className="font-heading text-2xl"
        >
          Product information
        </h2>
        <p className="whitespace-pre-wrap">
          {p.description.value ?? "No product description recorded."}
        </p>
        {p.description.value && (
          <p className="text-sm text-muted-foreground">
            Description: {scope(p.description.scope)}.
          </p>
        )}
        <Facts
          entries={[
            { label: "Model number", value: d.variant.modelNumber },
            {
              label: "Commercial markets",
              value:
                d.variant.markets.map((m) => m.name).join(", ") || "Unknown",
            },
            { label: "Producer source", value: scope(p.producerScope) },
            { label: "Year source", value: scope(p.yearScope) },
            {
              label: "Region locking",
              value: p.regionLock?.replaceAll("_", " ").toLowerCase() ?? null,
            },
            { label: "Region lock notes", value: p.regionLockNote },
            { label: "Rating", value: "Not recorded" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Shared facts describe the selected catalog variant. Personal
          observations belong to My copy. Commercial markets do not establish
          platform compatibility.
        </p>
        {(d.accessory.archived || d.variant.archived) && (
          <p className="text-sm">
            Archived catalog identity. This existing copy remains available.
          </p>
        )}
      </section>
      <section
        id="accessory-compatibility"
        aria-labelledby="accessory-compatibility-heading"
        className={sectionClass}
      >
        <h2
          id="accessory-compatibility-heading"
          className="font-heading text-2xl"
        >
          Compatibility
        </h2>
        <p className="text-sm text-muted-foreground">
          Explicit compatibility for {d.variant.name}. Other variants may
          differ.
        </p>
        {d.variant.platforms.length ? (
          <ul className="space-y-4">
            {d.variant.platforms.map((v) => (
              <li key={v.id}>
                <h3 className="font-medium">
                  {v.name}
                  {v.archived ? " (archived)" : ""}
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {v.note ?? "No additional compatibility notes recorded."}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No platform compatibility recorded for this variant.</p>
        )}
      </section>
      <section
        id="accessory-gallery"
        aria-labelledby="accessory-gallery-heading"
        className={sectionClass}
      >
        <h2 id="accessory-gallery-heading" className="font-heading text-2xl">
          Gallery
        </h2>
        <div className="space-y-4">
          <h3 className="font-heading text-xl">Variant catalog images</h3>
          <AccessoryGallery
            images={p.catalog.variant}
            empty="No variant catalog images on this page."
          />
        </div>
        <div className="space-y-4">
          <h3 className="font-heading text-xl">Accessory family images</h3>
          <p className="text-sm text-muted-foreground">
            Family images may show a different color or edition.
          </p>
          <AccessoryGallery
            images={p.catalog.family}
            empty="No accessory family images on this page."
          />
        </div>
        <nav aria-label="Catalog image pages" className="flex flex-wrap gap-3">
          {p.catalog.page > 1 && (
            <Button asChild variant="outline">
              <Link
                href={`/app/accessories/${d.id}?modelPage=${models.page}&galleryPage=${p.catalog.page - 1}#accessory-gallery`}
              >
                Previous catalog images
              </Link>
            </Button>
          )}
          {p.catalog.hasNext && (
            <Button asChild variant="outline">
              <Link
                href={`/app/accessories/${d.id}?modelPage=${models.page}&galleryPage=${p.catalog.page + 1}#accessory-gallery`}
              >
                More catalog images
              </Link>
            </Button>
          )}
        </nav>
        <div className="space-y-4">
          <h3 className="font-heading text-xl">Personal photos</h3>
          <AccessoryGallery
            images={p.photos}
            empty="No personal photos recorded."
          />
          {p.morePhotos && (
            <p className="text-sm text-muted-foreground">
              Showing the first 12 photos. Open Photos to view all files.
            </p>
          )}
          <Button asChild variant="outline">
            <Link href={`/app/media?itemId=${d.id}`}>
              {canManage ? "Manage photos" : "View photos"}
            </Link>
          </Button>
        </div>
      </section>
      <section
        id="accessory-specifications"
        aria-labelledby="accessory-specifications-heading"
        className={sectionClass}
      >
        <h2
          id="accessory-specifications-heading"
          className="font-heading text-2xl"
        >
          Specifications
        </h2>
        <p className="text-sm text-muted-foreground">
          {scope(p.specifications.scope)}. Variant specifications replace the
          family specification group in full.
        </p>
        {p.specifications.facts.length ? (
          <Facts entries={p.specifications.facts} />
        ) : (
          <p>No technical specifications recorded.</p>
        )}
      </section>
      <section
        id="accessory-video"
        aria-labelledby="accessory-video-heading"
        className={sectionClass}
      >
        <h2 id="accessory-video-heading" className="font-heading text-2xl">
          Video
        </h2>
        {p.video.value && (
          <p className="text-sm text-muted-foreground">
            {scope(p.video.scope)}.
          </p>
        )}
        <TrailerPlayer
          key={JSON.stringify(p.video.value)}
          trailer={p.video.value}
          title={`Video for ${d.accessory.name}`}
          kind="video"
        />
      </section>
      <AccessoryModelFiles
        id={d.id}
        revision={d.revision}
        models={models}
        canManage={canManage}
      />
      {canManage && !d.accessory.archived && !d.variant.archived && (
        <AccessoryEnrichmentLinks
          accessoryId={d.accessory.id}
          variantId={d.variant.id}
        />
      )}
    </div>
  );
}
