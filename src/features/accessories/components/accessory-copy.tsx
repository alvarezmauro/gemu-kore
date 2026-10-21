import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  AccessoryCopyDetail,
  CopyLocation,
  AccessoryModel,
  Choices,
} from "../copy-contracts";
import { AccessoryEnrichmentLinks } from "@/features/enrichment/components/accessory-enrichment-links";
import { AccessoryChoiceSummary } from "./accessory-choice-summary";
import { AccessoryControls } from "./accessory-controls";
import { AccessoryModelFiles } from "./accessory-model-files";
export function AccessoryCopy({
  detail,
  locations,
  canManage,
  models,
}: {
  detail: AccessoryCopyDetail;
  locations: CopyLocation[];
  canManage: boolean;
  models: Choices<AccessoryModel> & { selected: AccessoryModel | null };
}) {
  return (
    <div className="min-w-0 space-y-8 [overflow-wrap:anywhere] [&_a]:max-w-full [&_a]:whitespace-normal [&_button]:max-w-full [&_button]:whitespace-normal">
      <PageHeader
        title={`${detail.accessory.name} · ${detail.variant.name}`}
        description="Your physical accessory copy."
        action={
          <Button asChild variant="outline">
            <Link href="/app/collection">Browse collection</Link>
          </Button>
        }
      />
      <Badge variant="secondary">
        {detail.publicationStatus === "PRIVATE"
          ? "Private copy"
          : "Published copy"}
      </Badge>
      {canManage && <AccessoryControls detail={detail} locations={locations} />}
      {canManage && !detail.accessory.archived && !detail.variant.archived && (
        <AccessoryEnrichmentLinks
          accessoryId={detail.accessory.id}
          variantId={detail.variant.id}
        />
      )}
      <AccessoryChoiceSummary
        accessory={detail.accessory}
        variant={detail.variant}
      />
      <section
        aria-labelledby="copy-details-heading"
        className="space-y-5 rounded-2xl border border-border p-5"
      >
        <h2 id="copy-details-heading" className="font-display text-xl">
          My copy
        </h2>
        <dl className="grid gap-5 sm:grid-cols-2">
          {[
            ["Serial number", detail.fields.serialNumber || "Not recorded"],
            [
              "Has box",
              detail.fields.hasBox === "yes"
                ? "Yes"
                : detail.fields.hasBox === "no"
                  ? "No"
                  : "Unknown",
            ],
            ["Location", detail.location || "Unassigned"],
            ["Observed markings", detail.fields.observedMarkings || "None"],
            ["Private notes", detail.fields.notes || "None"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          Has box records only whether its box is present.
        </p>
      </section>
      <section aria-labelledby="copy-defects-heading" className="space-y-4">
        <h2 id="copy-defects-heading" className="font-display text-xl">
          Defects ({detail.defectCount})
        </h2>
        {detail.defects.length ? (
          <ul className="space-y-3">
            {detail.defects.map((d) => (
              <li key={d.id} className="rounded-xl bg-muted p-4">
                <p className="font-medium">{d.title}</p>
                <p className="text-sm text-muted-foreground">
                  {d.severity.toLowerCase()} · {d.status.toLowerCase()}
                </p>
                {d.description && (
                  <p className="whitespace-pre-wrap text-sm">{d.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No defects recorded.</p>
        )}
        <Button asChild variant="outline">
          <Link href={`/app/defects?itemId=${detail.id}`}>
            {canManage ? "Manage defects" : "View defects"}
          </Link>
        </Button>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-xl">Personal photos</h2>
        <Button asChild variant="outline">
          <Link href={`/app/media?itemId=${detail.id}`}>
            {canManage ? "Manage photos" : "View photos"}
          </Link>
        </Button>
      </section>
      <AccessoryModelFiles
        id={detail.id}
        revision={detail.revision}
        models={models}
        canManage={canManage}
      />
    </div>
  );
}
