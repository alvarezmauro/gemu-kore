import { z } from "zod";
import { copyPhysical } from "@/features/collection/copy-validation";
const revision = z.number().int().min(1).max(2147483646);
const search = {
  query: z.string().trim().max(200).default(""),
  page: z.number().int().min(0).max(1000).default(0),
};
export const accessorySearch = z.strictObject(search);
export const variantSearch = z.strictObject({
  ...search,
  accessoryId: z.uuid(),
});
export const accessorySelection = z.strictObject({
  accessoryId: z.uuid(),
  variantId: z.uuid(),
});
export const accessoryCopyCreate = copyPhysical
  .extend({
    id: z.uuid(),
    accessoryId: z.uuid(),
    accessoryRevision: revision,
    variantId: z.uuid(),
    variantRevision: revision,
  })
  .strict();
const scope = { id: z.uuid(), expectedRevision: revision };
export const accessoryCopyUpdate = accessoryCopyCreate
  .omit({ defects: true })
  .extend({ ...scope, operation: z.literal("update") })
  .strict();
export const accessoryCopyMutation = z.discriminatedUnion("operation", [
  accessoryCopyUpdate,
  z.strictObject({ ...scope, operation: z.literal("delete") }),
  z.strictObject({
    ...scope,
    operation: z.literal("model"),
    useId: z.uuid().nullable(),
  }),
  z.strictObject({
    ...scope,
    operation: z.literal("removeModel"),
    useId: z.uuid(),
  }),
]);
export const accessoryCopyDetail = z.strictObject({
  id: z.uuid(),
  modelPage: z.number().int().min(1).max(1000).default(1),
  galleryPage: z.number().int().min(1).max(1000).default(1),
});
