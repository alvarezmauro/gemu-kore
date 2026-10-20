import "server-only";
import { z } from "zod";
import { Prisma } from "@/server/db/generated/client";
import type { PrivateAccessContext } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import {
  withTransaction,
  type TransactionClient,
} from "@/server/db/transaction";
import {
  lockCatalogWrites,
  appendCatalogHistory,
} from "@/server/repositories/catalog/management";
import { lockAssets } from "@/server/repositories/assets";
import * as repository from "@/server/repositories/catalog/physical-editions";
import {
  createBoxTemplate,
  templateCommand,
  assignBox,
  packagingPage,
} from "@/features/physical-editions/validation";
import {
  boxDimensions,
  boxFamily,
  boxFaces,
  textureTransform,
  artworkLayout,
  faceSize,
} from "@/lib/three/packaging-contracts";
import { modelSettings } from "@/lib/three/contracts";
import type {
  BoxTemplate,
  PackagingManager,
} from "@/features/physical-editions/contracts";
import { assetAttribution } from "./provenance";
export class PackagingError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "STALE" | "NOT_FOUND" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the template, artwork and crop. Restore archived catalog records before changing packaging.",
        STALE:
          "The catalog or copy changed. Your entries are still here. Refresh before saving or viewing.",
        NOT_FOUND: "This packaging component is unavailable.",
        UNAVAILABLE:
          "We couldn't confirm this packaging action. Refresh to check saved changes before trying again.",
      }[code],
    );
  }
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new PackagingError("INVALID_INPUT");
  return p.data;
}
const metadata = z.strictObject({
  schemaVersion: z.literal(1),
  synthetic: z.boolean(),
  measurementNote: z.string().min(1).max(1000),
});
const slotTarget = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("PROCEDURAL_FACE"),
  face: z.number().int().min(0).max(5),
});
export function boxTemplateDto(
  row: NonNullable<Awaited<ReturnType<typeof repository.template>>>,
): BoxTemplate {
  const m = metadata.parse(row.metadata);
  const familyKey = boxFamily.parse(row.familyKey);
  const slots = row.slots.map((s) => ({
    id: s.id,
    name: s.name,
    required: s.required,
    face: slotTarget.parse(s.target).face,
  }));
  if (
    row.geometryType !== "PROCEDURAL_BOX" ||
    slots.length !== 6 ||
    new Set(slots.map((s) => s.face)).size !== 6 ||
    slots.some(
      (s) =>
        s.name !== boxFaces[s.face].name ||
        s.required !== boxFaces[s.face].required,
    )
  )
    throw new PackagingError("UNAVAILABLE");
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    familyKey,
    revision: row.revision,
    revisionNumber: row.revisionNumber,
    status: row.status,
    archived: Boolean(row.archivedAt),
    dimensions: boxDimensions.parse(row.dimensions),
    synthetic: m.synthetic,
    measurementNote: m.measurementNote,
    slots: slots.sort((a, b) => a.face - b.face),
  };
}
async function guarded<T>(
  context: PrivateAccessContext,
  work: (actor: PrivateAccessContext, tx: TransactionClient) => Promise<T>,
) {
  return withTransaction(async (tx) => {
    await requirePermission(context, "catalog.manage", tx);
    await lockCatalogWrites(tx);
    return work(await requirePermission(context, "catalog.manage", tx), tx);
  });
}
export async function createPackagingTemplate(
  context: PrivateAccessContext,
  input: unknown,
) {
  const d = parse(createBoxTemplate, input);
  return guarded(context, async (actor, tx) => {
    const existing = await repository.template(d.id, tx);
    if (existing) {
      const dto = boxTemplateDto(existing);
      if (
        dto.name !== d.name ||
        dto.slug !== d.slug ||
        dto.familyKey !== d.familyKey ||
        dto.revisionNumber !== d.revisionNumber ||
        JSON.stringify(dto.dimensions) !== JSON.stringify(d.dimensions) ||
        dto.synthetic !== d.synthetic ||
        dto.measurementNote !== d.measurementNote
      )
        throw new PackagingError("STALE");
      return d.id;
    }
    await repository.createTemplate(
      {
        id: d.id,
        name: d.name,
        slug: d.slug,
        familyKey: d.familyKey,
        revisionNumber: d.revisionNumber,
        dimensions: json(d.dimensions),
        materialSettings: { schemaVersion: 1, profile: "cardboard-v1" },
        cameraSettings: json(modelSettings.parse({ preset: "package" })),
        metadata: {
          schemaVersion: 1,
          synthetic: d.synthetic,
          measurementNote: d.measurementNote,
        },
        createdById: actor.userId,
      },
      tx,
    );
    await repository.createSlots(
      boxFaces.map((f) => ({
        packagingTemplateId: d.id,
        name: f.name,
        required: f.required,
        materialName: `box:${f.name}`,
        target: { schemaVersion: 1, kind: "PROCEDURAL_FACE", face: f.face },
      })),
      tx,
    );
    return d.id;
  });
}
export async function changePackagingTemplate(
  context: PrivateAccessContext,
  input: unknown,
) {
  const d = parse(templateCommand, input);
  return guarded(context, async (_actor, tx) => {
    const row = await repository.template(d.id, tx);
    if (!row) throw new PackagingError("NOT_FOUND");
    const dto = boxTemplateDto(row);
    if (
      (d.operation === "ready" && row.status === "READY") ||
      (d.operation !== "ready" && dto.archived === (d.operation === "archive"))
    )
      return;
    if (row.revision !== d.expectedRevision) throw new PackagingError("STALE");
    if (d.operation === "ready") {
      if (dto.archived) throw new PackagingError("INVALID_INPUT");
      await repository.updateTemplate(d.id, { status: "READY" }, tx);
    } else
      await repository.updateTemplate(
        d.id,
        { archivedAt: d.operation === "archive" ? new Date() : null },
        tx,
      );
  });
}
function bindingSnapshot(
  c: NonNullable<
    Awaited<ReturnType<typeof repository.packagingRelease>>
  >["includedItems"][number],
) {
  return {
    templateId: c.packagingTemplateId,
    bindings: c.packagingBindings
      .map((b) => ({
        slotId: b.packagingTextureSlotId,
        assetId: b.assetId,
        transform: textureTransform.parse(b.transform),
      }))
      .sort((a, b) => a.slotId.localeCompare(b.slotId)),
  };
}
export async function assignPackaging(
  context: PrivateAccessContext,
  input: unknown,
) {
  const d = parse(assignBox, input);
  d.bindings.sort((a, b) => a.slotId.localeCompare(b.slotId));
  return guarded(context, async (actor, tx) => {
    const release = await repository.packagingRelease(d.releaseId, tx);
    if (!release) throw new PackagingError("NOT_FOUND");
    const component = release.includedItems.find((c) => c.id === d.componentId);
    if (!component) throw new PackagingError("NOT_FOUND");
    if (
      release.archivedAt ||
      release.game.archivedAt ||
      release.platform.archivedAt ||
      component.kind !== "PACKAGING"
    )
      throw new PackagingError("INVALID_INPUT");
    const before = bindingSnapshot(component),
      after = { templateId: d.templateId, bindings: d.bindings };
    // Canonical JSON key order is independent of PostgreSQL JSONB ordering.
    const stable = (v: unknown) =>
      JSON.stringify(v, (_key, value: unknown) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
            )
          : value,
      );
    if (stable(before) === stable(after)) return;
    if (release.revision !== d.expectedRevision)
      throw new PackagingError("STALE");
    if (d.templateId) {
      const row = await repository.template(d.templateId, tx);
      if (!row || row.status !== "READY" || row.archivedAt)
        throw new PackagingError("INVALID_INPUT");
      if (row.revision !== d.expectedTemplateRevision)
        throw new PackagingError("STALE");
      const template = boxTemplateDto(row);
      if (
        d.bindings.some((b) => !template.slots.some((s) => s.id === b.slotId))
      )
        throw new PackagingError("INVALID_INPUT");
      await lockAssets(
        d.bindings.map((b) => b.assetId),
        tx,
      );
      const assets = await repository.assets(
        d.bindings.map((b) => b.assetId),
        tx,
      );
      for (const b of d.bindings) {
        const a = assets.find((a) => a.id === b.assetId);
        if (
          !a ||
          a.state !== "READY" ||
          a.scope !== "CATALOG" ||
          a.kind !== "IMAGE" ||
          a.deliveryClass !== "DISPLAY" ||
          !a.width ||
          !a.height ||
          !["image/png", "image/jpeg", "image/webp"].includes(a.mimeType ?? "")
        )
          throw new PackagingError("INVALID_INPUT");
        const slot = template.slots.find((s) => s.id === b.slotId)!;
        try {
          artworkLayout(
            a.width,
            a.height,
            ...faceSize(slot.face, template.dimensions),
            b.transform,
          );
        } catch {
          throw new PackagingError("INVALID_INPUT");
        }
      }
    }
    await repository.replaceBindings(
      d.componentId,
      d.templateId,
      d.bindings.map((b) => ({ ...b, transform: json(b.transform) })),
      tx,
    );
    const saved = await repository.bumpRelease(d.releaseId, tx);
    await appendCatalogHistory(
      "release",
      d.releaseId,
      saved.revision,
      actor.userId,
      [
        {
          fieldPath: `physicalPresentation.${d.componentId}`,
          before: json(before),
          after: json(after),
        },
      ],
      tx,
    );
  });
}
export async function getPackagingManager(
  context: PrivateAccessContext,
  input: unknown,
): Promise<PackagingManager> {
  const { releaseId } = parse(packagingPage, input);
  return withTransaction(
    async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const release = await repository.packagingRelease(releaseId, tx);
      if (!release) throw new PackagingError("NOT_FOUND");
      const rows: Awaited<ReturnType<typeof repository.templates>> = [];
      let moreTemplates = false;
      for (const familyKey of boxFamily.options) {
        const familyRows = await repository.templates(familyKey, tx);
        rows.push(...familyRows.slice(0, 50));
        moreTemplates ||= familyRows.length > 50;
      }
      const selected = await repository.selectedTemplates(
        release.includedItems.flatMap((c) =>
          c.packagingTemplateId ? [c.packagingTemplateId] : [],
        ),
        tx,
      );
      const templates = [
        ...new Map([...rows, ...selected].map((t) => [t.id, t])).values(),
      ].map(boxTemplateDto);
      const choices = await repository.artworkChoices(releaseId, tx);
      const art = [
        ...new Map(
          [
            ...choices
              .slice(0, 50)
              .map((a) => ({ ...a.asset, label: a.caption })),
            ...release.includedItems.flatMap((c) =>
              c.packagingBindings.map((b) => ({
                ...b.asset,
                label:
                  choices.find((a) => a.asset.id === b.assetId)?.caption ??
                  null,
              })),
            ),
          ].map((a) => [a.id, a]),
        ).values(),
      ];
      return {
        release: {
          id: release.id,
          name: `${release.game.name} · ${release.platform.name} · ${release.slug}`,
          revision: release.revision,
          archived: Boolean(
            release.archivedAt ||
            release.game.archivedAt ||
            release.platform.archivedAt,
          ),
        },
        templates,
        moreTemplates,
        moreArtwork: choices.length > 50,
        components: release.includedItems
          .filter((c) => c.kind === "PACKAGING")
          .map((c) => ({ id: c.id, name: c.name, ...bindingSnapshot(c) })),
        artwork: art
          .filter(
            (a) =>
              a.state === "READY" &&
              a.scope === "CATALOG" &&
              a.deliveryClass === "DISPLAY",
          )
          .map((a) => ({
            id: a.id,
            label: a.label ?? `Catalog artwork ${a.id.slice(0, 8)}`,
            url: `/api/media/private/${a.id}`,
            width: a.width ?? 1,
            height: a.height ?? 1,
            source: assetAttribution(a),
          })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
