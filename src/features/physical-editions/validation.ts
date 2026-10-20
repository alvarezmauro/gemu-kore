import { z } from "zod";
import {
  boxDimensions,
  boxFamily,
  clamshellSlots,
  textureTransform,
} from "@/lib/three/packaging-contracts";
const revision = z.number().int().positive().max(2147483646);
export const packagingPage = z.strictObject({ releaseId: z.uuid() });
const templateFields = {
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  revisionNumber: revision,
  dimensions: boxDimensions,
  synthetic: z.boolean(),
  measurementNote: z.string().trim().min(1).max(1000),
};
export const createBoxTemplate = z.discriminatedUnion("familyKey", [
  z.strictObject({ ...templateFields, familyKey: boxFamily }),
  z.strictObject({
    ...templateFields,
    familyKey: z.literal("genesis-clamshell"),
    slots: clamshellSlots,
  }),
]);
export const templateCommand = z.strictObject({
  id: z.uuid(),
  expectedRevision: revision,
  operation: z.enum(["ready", "archive", "restore"]),
  reviewedGeometry: z.literal(true).optional(),
});
export const assignBox = z
  .strictObject({
    releaseId: z.uuid(),
    componentId: z.uuid(),
    expectedRevision: revision,
    templateId: z.uuid().nullable(),
    expectedTemplateRevision: revision.nullable(),
    bindings: z
      .array(
        z.strictObject({
          slotId: z.uuid(),
          assetId: z.uuid(),
          transform: textureTransform,
        }),
      )
      .max(6)
      .refine(
        (v) => new Set(v.map((b) => b.slotId)).size === v.length,
        "Choose one image per slot.",
      ),
  })
  .refine(
    (v) =>
      v.templateId !== null ||
      (v.bindings.length === 0 && v.expectedTemplateRevision === null),
  );
export const boxViewRequest = z.strictObject({
  collectionItemId: z.uuid(),
  componentId: z.uuid(),
  expectedCopyRevision: revision,
  expectedReleaseRevision: revision,
});
