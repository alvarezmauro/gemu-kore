import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  severityLabels,
  statusLabels,
  type DefectSeverity,
  type DefectStatus,
} from "@/features/defects/contracts";
import type {
  ConsoleDetail as Detail,
  ConsoleLocation,
  ConsoleImage as ImageEntry,
} from "../contracts";
import { ConsoleModelViewer } from "./console-model-viewer";
import { ConsoleControls } from "./console-controls";
import { ConsoleImage } from "./console-image";
import { ConsoleOverrides } from "./console-overrides";
function Facts({
  entries,
}: {
  entries: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
      {entries.map((e) => (
        <div key={e.label} className="min-w-0">
          <dt className="text-sm text-muted-foreground">{e.label}</dt>
          <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {e.value || "Unknown"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
function Gallery({ images, empty }: { images: ImageEntry[]; empty: string }) {
  return images.length ? (
    <ul className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((i, n) => (
        <li key={`${i.url}-${n}`} className="min-w-0">
          <ConsoleImage {...i} />
          {i.caption && (
            <p className="mt-2 break-words text-sm text-muted-foreground">
              {i.caption}
            </p>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );
}
export function ConsoleDetail({
  detail: d,
  canManage,
  locations,
}: {
  detail: Detail;
  canManage: boolean;
  locations: ConsoleLocation[];
}) {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">
          {d.publicationStatus === "PRIVATE"
            ? "Private copy"
            : "Published copy"}
        </Badge>
        {d.model.identificationStatus === "INCOMPLETE" && (
          <Badge variant="outline">Identity incomplete</Badge>
        )}
        {(d.model.archived || d.platform.archived) && (
          <Badge variant="outline">Catalog identity archived</Badge>
        )}
      </div>
      {canManage && (
        <ConsoleControls
          key={d.id}
          detail={{
            id: d.id,
            revision: d.revision,
            fields: d.fields,
            platform: d.platform,
            model: d.model,
          }}
          locations={locations}
        />
      )}
      <section
        aria-label="Console identity preview"
        className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      >
        <div className="min-w-0">
          {d.modelFile ? (
            <ConsoleModelViewer
              key={`${d.id}:${d.revision}`}
              id={d.id}
              revision={d.revision}
              title={`${d.platform.name} · ${d.model.name}`}
              source={d.modelFile.source}
              poster={
                d.model.imageUrl
                  ? {
                      url: d.model.imageUrl,
                      alt: `${d.model.name} catalog preview`,
                      width: 480,
                      height: 320,
                    }
                  : (d.catalogImages[0] ?? null)
              }
            />
          ) : d.model.imageUrl || d.catalogImages[0] ? (
            <ConsoleImage
              url={d.model.imageUrl ?? d.catalogImages[0].url}
              alt={`${d.model.name} catalog preview`}
            />
          ) : (
            <div className="flex aspect-[3/2] items-center justify-center rounded-xl bg-stone p-6 text-center text-muted-foreground">
              No console preview available
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-6 rounded-xl bg-card p-4 sm:p-6">
          {d.logo ? (
            <div className="max-w-48">
              <ConsoleImage url={d.logo.url} alt={`${d.platform.name} logo`} />
              <p className="mt-2 text-sm text-muted-foreground">
                {d.logo.source}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No logo available</p>
          )}
          <div className="[overflow-wrap:anywhere]">
            <p className="text-sm text-muted-foreground">Console platform</p>
            <p className="mt-1 font-heading text-2xl">{d.platform.name}</p>
            <p className="mt-2 text-body">{d.model.name}</p>
          </div>
          <Facts
            entries={[
              {
                label: "Platform manufacturer",
                value: d.platform.manufacturer,
              },
              { label: "Model manufacturer", value: d.model.manufacturer },
              { label: "Generation", value: d.platform.generation?.toString() },
              {
                label: "Platform release year",
                value: d.platform.releaseYear?.toString(),
              },
              {
                label: "Model release year",
                value: d.model.releaseYear?.toString(),
              },
            ]}
          />
          {d.modelFile ? (
            <>
              <a
                className="inline-flex min-h-11 items-center underline underline-offset-4"
                href={d.modelFile.url}
                download
              >
                Download 3D file
              </a>
              <p className="text-sm text-muted-foreground">
                {d.modelFile.source}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No 3D file available
            </p>
          )}
        </div>
      </section>
      <nav
        aria-label="Console page sections"
        className="flex flex-wrap gap-x-6 gap-y-2"
      >
        {[
          ["my-console-title", "My Console"],
          ["console-catalog-title", "Console Information"],
          ["console-specifications-title", "Technical Specifications"],
          ["console-gallery-title", "Gallery"],
        ].map(([id, name]) => (
          <a
            key={id}
            href={`#${id}`}
            className="inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            {name}
          </a>
        ))}
      </nav>
      <div className="min-w-0">
        <section
          className="min-w-0 space-y-5 rounded-xl bg-card p-4 sm:p-6"
          aria-labelledby="my-console-title"
        >
          <h2
            id="my-console-title"
            className="scroll-mt-6 font-heading text-xl"
          >
            My Console
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
                value: { unknown: "Unknown", yes: "Yes", no: "No" }[
                  d.fields.hasBox
                ],
              },
              { label: "Location", value: d.location ?? "Unassigned" },
              {
                label: "Canonical commercial markets",
                value: d.model.markets.join(", "),
              },
              {
                label: "Observed markings or identification uncertainty",
                value: d.fields.observedMarkings || "Not recorded",
              },
              {
                label: "Private notes",
                value: d.fields.notes || "Not recorded",
              },
            ]}
          />
        </section>
      </div>
      <section
        className="min-w-0 space-y-5 rounded-xl bg-card p-4 sm:p-6"
        aria-labelledby="console-catalog-title"
      >
        <h2
          id="console-catalog-title"
          className="scroll-mt-6 font-heading text-xl"
        >
          Console Information
        </h2>
        <p className="text-sm text-muted-foreground">
          Shared facts for this model. Physical observations and private notes
          belong to My Console.
        </p>
        <Facts
          entries={[
            { label: "Console platform", value: d.platform.name },
            { label: "Hardware model", value: d.model.name },
            { label: "Model number", value: d.model.modelNumber },
            {
              label: "Platform release year",
              value: d.platform.releaseYear?.toString(),
            },
            {
              label: "Model release year",
              value: d.model.releaseYear?.toString(),
            },
            { label: "Region locking", value: d.model.regionLock },
          ]}
        />
        {d.model.description && (
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {d.model.description}
          </p>
        )}
        {d.description && (
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {d.description}
          </p>
        )}
        {d.history && (
          <div>
            <h3 className="font-medium">Platform history</h3>
            <p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {d.history}
            </p>
          </div>
        )}
      </section>
      <section
        className="min-w-0 space-y-5 rounded-xl bg-card p-4 sm:p-6"
        aria-labelledby="console-specifications-title"
      >
        <h2
          id="console-specifications-title"
          className="scroll-mt-6 font-heading text-xl"
        >
          Technical Specifications
        </h2>
        {d.facts.length ? (
          <Facts entries={d.facts} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No technical specifications recorded for this model.
          </p>
        )}
      </section>
      <section
        className="min-w-0 space-y-6 rounded-xl bg-card p-4 sm:p-6"
        aria-labelledby="console-gallery-title"
      >
        <h2
          id="console-gallery-title"
          className="scroll-mt-6 font-heading text-xl"
        >
          Gallery
        </h2>
        <div className="space-y-4">
          <h3 className="font-medium">Catalog images</h3>
          <Gallery
            images={d.catalogImages}
            empty="No catalog images available."
          />
        </div>
        <div className="space-y-4" aria-labelledby="console-photos-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3
              id="console-photos-title"
              className="scroll-mt-6 font-heading text-xl"
            >
              Copy photos
            </h3>
            <Button variant="outline" asChild>
              <Link href={`/app/media?itemId=${d.id}`}>
                {canManage ? "Manage copy photos" : "View all copy photos"}
              </Link>
            </Button>
          </div>
          <Gallery images={d.photos} empty="No copy photos recorded." />
          {d.photos.length === 12 && (
            <p className="text-sm text-muted-foreground">
              Showing the first 12 photos. Open Photos to see all files.
            </p>
          )}
        </div>
      </section>
      <section
        className="space-y-5 rounded-xl bg-card p-4 sm:p-6"
        aria-labelledby="console-defects-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2
            id="console-defects-title"
            className="scroll-mt-6 font-heading text-xl"
          >
            Defects ({d.defectCount})
          </h2>
          <Button variant="outline" asChild>
            <Link href={`/app/defects?itemId=${d.id}`}>
              {canManage ? "Manage copy defects" : "View all copy defects"}
            </Link>
          </Button>
        </div>
        {!d.defects.length && (
          <p className="text-sm text-muted-foreground">
            No defects recorded. This does not mean the copy has been inspected
            or is defect-free.
          </p>
        )}
        <ul className="space-y-4">
          {d.defects.map((defect) => (
            <li
              key={defect.id}
              className="space-y-2 rounded-xl bg-muted p-4 [overflow-wrap:anywhere]"
            >
              <h3 className="font-medium">{defect.title}</h3>
              <p className="text-sm">
                {severityLabels[defect.severity as DefectSeverity]} ·{" "}
                {statusLabels[defect.status as DefectStatus]}
              </p>
              {defect.description && (
                <p className="whitespace-pre-wrap text-sm">
                  {defect.description}
                </p>
              )}
              {defect.repairNote && (
                <p className="whitespace-pre-wrap text-sm">
                  Repair notes: {defect.repairNote}
                </p>
              )}
            </li>
          ))}
        </ul>
        {d.defectCount > 20 && (
          <p className="text-sm text-muted-foreground">
            Showing the first 20 records. Open Defects for all records.
          </p>
        )}
      </section>
      <ConsoleOverrides
        key={d.id}
        detail={{
          id: d.id,
          revision: d.revision,
          overrides: d.overrides,
          primaryOverrides: d.primaryOverrides,
          overridePage: d.overridePage,
          moreOverrides: d.moreOverrides,
        }}
        canManage={canManage}
      />
      <Button variant="outline" asChild>
        <Link href="/app/collection">Browse collection</Link>
      </Button>
    </div>
  );
}
