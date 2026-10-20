import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";
import { getObjectStorage } from "@/server/storage";
import { inspectCartridge } from "@/lib/three/authored-packaging";
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
import * as repository from "@/server/repositories/catalog/physical-media";
import {
  createCartridgeTemplate,
  templateCommand,
  assignCartridge,
  mediaPage,
} from "@/features/physical-media/validation";
import {
  boxDimensions,
  glbSlotTarget,
  packageModelResource,
  textureTransform,
  artworkLayout,
} from "@/lib/three/packaging-contracts";
import { cartridgeFamily, cartridgeSlots } from "@/lib/three/media-contracts";
import { modelSettings } from "@/lib/three/contracts";
import type {
  CartridgeTemplate,
  MediaManager,
} from "@/features/physical-media/contracts";
import {
  cartridgeTemplateMetadata,
  cartridgeFormatKey,
} from "@/features/physical-media/template-metadata";
import { assetAttribution } from "./provenance";
export class MediaError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "STALE" | "NOT_FOUND" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the template, artwork and crop. Restore archived catalog records before changing cartridge artwork.",
        STALE:
          "The catalog or copy changed. Your entries are still here. Refresh before saving or viewing.",
        NOT_FOUND: "This media component is unavailable.",
        UNAVAILABLE:
          "We couldn't confirm this media action. Refresh to check saved changes before trying again.",
      }[code],
    );
  }
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new MediaError("INVALID_INPUT");
  return p.data;
}
export function cartridgeTemplateDto(
  row: NonNullable<Awaited<ReturnType<typeof repository.template>>>,
): CartridgeTemplate {
  const m = cartridgeTemplateMetadata.parse(row.metadata),
    familyKey = cartridgeFamily.parse(row.familyKey);
  if (row.type !== "CARTRIDGE" || row.geometryType !== "GLB")
    throw new MediaError("UNAVAILABLE");
  const slots = row.slots.map((s) => ({
    id: s.id,
    name: s.name,
    required: s.required,
    face: null,
    target: glbSlotTarget.parse(s.target),
  }));
  cartridgeSlots.parse(slots.map((s) => ({ name: s.name, target: s.target })));
  if (
    slots.some(
      (s) =>
        !s.required ||
        s.target.materialName !==
          row.slots.find((r) => r.id === s.id)?.materialName,
    )
  )
    throw new MediaError("UNAVAILABLE");
  const asset = row.baseModelAsset;
  const model =
    asset &&
    asset.state === "READY" &&
    asset.scope === "CATALOG" &&
    asset.kind === "MODEL_3D" &&
    asset.deliveryClass === "ORIGINAL"
      ? packageModelResource.safeParse({
          id: asset.id,
          url: `/api/media/private/${asset.id}`,
          mimeType: asset.mimeType,
          byteLength: Number(asset.sizeBytes),
        })
      : null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    familyKey,
    format: m.format,
    geometryType: "GLB",
    type: "CARTRIDGE",
    baseModel: model?.success ? model.data : null,
    modelSource: asset ? assetAttribution(asset) : null,
    revision: row.revision,
    revisionNumber: row.revisionNumber,
    status: row.status,
    archived: Boolean(row.archivedAt),
    dimensions: boxDimensions.parse(row.dimensions),
    synthetic: m.synthetic,
    measurementNote: m.measurementNote,
    slots: slots.sort(
      (a, b) => (a.face ?? 0) - (b.face ?? 0) || a.name.localeCompare(b.name),
    ),
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
export async function createPhysicalMediaTemplate(
  context: PrivateAccessContext,
  input: unknown,
) {
  const d = parse(createCartridgeTemplate, input);
  return guarded(context, async (actor, tx) => {
    const existing = await repository.template(d.id, tx);
    if (existing) {
      const dto = cartridgeTemplateDto(existing);
      if (
        dto.name !== d.name ||
        dto.slug !== d.slug ||
        dto.familyKey !== d.familyKey ||
        dto.revisionNumber !== d.revisionNumber ||
        JSON.stringify(dto.dimensions) !== JSON.stringify(d.dimensions) ||
        dto.synthetic !== d.synthetic ||
        dto.measurementNote !== d.measurementNote ||
        JSON.stringify(dto.format) !== JSON.stringify(d.format) ||
        ("slots" in d &&
          JSON.stringify(
            dto.slots
              .map((s) => ({ name: s.name, target: s.target }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          ) !==
            JSON.stringify(
              [...d.slots].sort((a, b) => a.name.localeCompare(b.name)),
            ))
      )
        throw new MediaError("STALE");
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
        geometryType: "GLB",
        type: d.type,
        materialSettings: { schemaVersion: 1, profile: "cartridge-v1" },
        cameraSettings: json(modelSettings.parse({ preset: "cartridge" })),
        metadata: {
          schemaVersion: 1,
          synthetic: d.synthetic,
          measurementNote: d.measurementNote,
          format: json(d.format),
        },
        createdById: actor.userId,
      },
      tx,
    );
    await repository.createSlots(
      d.slots.map((s) => ({
        physicalMediaTemplateId: d.id,
        name: s.name,
        required: true,
        materialName: s.target.materialName,
        target: json(s.target),
      })),
      tx,
    );
    return d.id;
  });
}
export async function changePhysicalMediaTemplate(
  context: PrivateAccessContext,
  input: unknown,
) {
  const d = parse(templateCommand, input);
  let validatedModelId: string | undefined;
  if (d.operation === "ready") {
    const snapshot = await withTransaction(async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const row = await repository.template(d.id, tx);
      if (!row) throw new MediaError("NOT_FOUND");
      const asset = row.baseModelAssetId
        ? await repository.templateGeometryAsset(row.baseModelAssetId, tx)
        : null;
      return { row, asset };
    });
    if (
      snapshot.row.geometryType === "GLB" &&
      snapshot.row.status === "DRAFT"
    ) {
      const dto = cartridgeTemplateDto(snapshot.row),
        asset = snapshot.asset;
      if (
        !d.reviewedGeometry ||
        !dto.baseModel ||
        !asset ||
        snapshot.row.revision !== d.expectedRevision
      )
        throw new MediaError("INVALID_INPUT");
      const object = await getObjectStorage().get(asset, {
        signal: AbortSignal.timeout(10000),
      });
      try {
        if (
          object.contentType !== "model/gltf-binary" ||
          object.sizeBytes !== dto.baseModel.byteLength
        )
          throw new MediaError("INVALID_INPUT");
        const parts: Uint8Array[] = [];
        let size = 0;
        const hash = createHash("sha256");
        for await (const chunk of object.body) {
          size += chunk.length;
          if (size > dto.baseModel.byteLength)
            throw new MediaError("INVALID_INPUT");
          parts.push(chunk);
          hash.update(chunk);
        }
        if (
          size !== dto.baseModel.byteLength ||
          hash.digest("hex") !== asset.sha256
        )
          throw new MediaError("INVALID_INPUT");
        const bytes = Buffer.concat(parts);
        inspectCartridge(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
          dto.dimensions,
          dto.slots.map((s) => ({ name: s.name, target: s.target })),
        );
        validatedModelId = asset.id;
      } catch (error) {
        if (error instanceof MediaError) throw error;
        throw new MediaError("INVALID_INPUT");
      } finally {
        object.body.destroy();
      }
    }
  }
  return guarded(context, async (_actor, tx) => {
    const row = await repository.template(d.id, tx);
    if (!row) throw new MediaError("NOT_FOUND");
    const dto = cartridgeTemplateDto(row);
    if (
      (d.operation === "ready" && row.status === "READY") ||
      (d.operation !== "ready" && dto.archived === (d.operation === "archive"))
    )
      return;
    if (row.revision !== d.expectedRevision) throw new MediaError("STALE");
    if (d.operation === "ready") {
      if (
        row.geometryType === "GLB" &&
        (!validatedModelId || row.baseModelAssetId !== validatedModelId)
      )
        throw new MediaError("STALE");
      if (dto.archived) throw new MediaError("INVALID_INPUT");
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
    Awaited<ReturnType<typeof repository.physicalMediaRelease>>
  >["includedItems"][number],
) {
  return {
    templateId: c.physicalMediaTemplateId,
    bindings: c.physicalMediaBindings
      .map((b) => ({
        slotId: b.physicalMediaTextureSlotId,
        assetId: b.assetId,
        transform: textureTransform.parse(b.transform),
      }))
      .sort((a, b) => a.slotId.localeCompare(b.slotId)),
  };
}
export async function assignPhysicalMedia(
  context: PrivateAccessContext,
  input: unknown,
) {
  const d = parse(assignCartridge, input);
  d.bindings.sort((a, b) => a.slotId.localeCompare(b.slotId));
  return guarded(context, async (actor, tx) => {
    const release = await repository.physicalMediaRelease(d.releaseId, tx);
    if (!release) throw new MediaError("NOT_FOUND");
    const component = release.includedItems.find((c) => c.id === d.componentId);
    if (!component) throw new MediaError("NOT_FOUND");
    if (
      release.archivedAt ||
      release.game.archivedAt ||
      release.platform.archivedAt ||
      component.kind !== "MEDIA"
    )
      throw new MediaError("INVALID_INPUT");
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
    if (release.revision !== d.expectedRevision) throw new MediaError("STALE");
    if (d.templateId) {
      const row = await repository.template(d.templateId, tx);
      if (!row || row.status !== "READY" || row.archivedAt)
        throw new MediaError("INVALID_INPUT");
      if (row.revision !== d.expectedTemplateRevision)
        throw new MediaError("STALE");
      const template = cartridgeTemplateDto(row);
      if (
        d.bindings.some((b) => !template.slots.some((s) => s.id === b.slotId))
      )
        throw new MediaError("INVALID_INPUT");
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
          throw new MediaError("INVALID_INPUT");
        const slot = template.slots.find((s) => s.id === b.slotId)!;
        try {
          artworkLayout(
            a.width,
            a.height,
            slot.target!.artWidthMm,
            slot.target!.artHeightMm,
            b.transform,
          );
        } catch {
          throw new MediaError("INVALID_INPUT");
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
          fieldPath: `physicalMediaPresentation.${d.componentId}`,
          before: json(before),
          after: json(after),
        },
      ],
      tx,
    );
  });
}
export async function getMediaManager(
  context: PrivateAccessContext,
  input: unknown,
): Promise<MediaManager> {
  const { releaseId } = parse(mediaPage, input);
  return withTransaction(
    async (tx) => {
      await requirePermission(context, "catalog.manage", tx);
      const release = await repository.physicalMediaRelease(releaseId, tx);
      if (!release) throw new MediaError("NOT_FOUND");
      const candidates = await repository.templates(
        cartridgeFormatKey.options,
        tx,
      );
      const rows: typeof candidates = [];
      let moreTemplates = false;
      const counts = new Map<string, number>();
      for (const row of candidates) {
        const key = cartridgeTemplateMetadata.parse(row.metadata).format
          .formatKey;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (count <= 50) rows.push(row);
        else moreTemplates = true;
      }
      const selected = await repository.selectedTemplates(
        release.includedItems.flatMap((c) =>
          c.physicalMediaTemplateId ? [c.physicalMediaTemplateId] : [],
        ),
        tx,
      );
      const templates = [
        ...new Map([...rows, ...selected].map((t) => [t.id, t])).values(),
      ].map(cartridgeTemplateDto);
      const choices = await repository.artworkChoices(releaseId, tx);
      const art = [
        ...new Map(
          [
            ...choices
              .slice(0, 50)
              .map((a) => ({ ...a.asset, label: a.caption })),
            ...release.includedItems.flatMap((c) =>
              c.physicalMediaBindings.map((b) => ({
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
          .filter((c) => c.kind === "MEDIA")
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
