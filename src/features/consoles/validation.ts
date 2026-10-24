import { z } from "zod";
import {
  copyPhysical as consolePhysical,
  newCopyDefect as newConsoleDefect,
} from "@/features/collection/copy-validation";
export { consolePhysical, newConsoleDefect };

export const consoleCreate = consolePhysical
  .extend({
    id: z.uuid(),
    platformId: z.uuid(),
    platformRevision: z.number().int().min(1).max(2147483646),
    modelId: z.uuid(),
    modelRevision: z.number().int().min(1).max(2147483646),
  })
  .strict();
export type ConsolePhysicalDraft = z.input<typeof consolePhysical>;
export const emptyConsolePhysical: ConsolePhysicalDraft = {
  serialNumber: "",
  observedMarkings: "",
  hasBox: "unknown",
  locationId: "",
  notes: "",
  defects: [],
};
export const consoleLookup = z
  .object({
    query: z.string().trim().max(200).default(""),
    page: z.number().int().min(0).max(1000).default(0),
    platformId: z.uuid().optional(),
  })
  .strict();
export const consoleOverride = z
  .object({
    collectionItemId: z.uuid(),
    useId: z.uuid(),
    type: z.enum(["CUSTOM_LOGO", "CUSTOM_MODEL"]),
  })
  .strict();
const copyScope = {
  id: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
};
export const consoleUpdate = consolePhysical
  .omit({ defects: true })
  .extend({
    operation: z.literal("update"),
    ...copyScope,
    platformId: z.uuid(),
    platformRevision: z.number().int().min(1).max(2147483646),
    modelId: z.uuid(),
    modelRevision: z.number().int().min(1).max(2147483646),
  })
  .strict();
export const consoleMutation = z.discriminatedUnion("operation", [
  consoleUpdate,
  z.object({ operation: z.literal("delete"), ...copyScope }).strict(),
  z
    .object({
      operation: z.literal("override"),
      ...copyScope,
      type: z.enum(["CUSTOM_LOGO", "CUSTOM_MODEL"]),
      useId: z.uuid().nullable(),
    })
    .strict(),
  z
    .object({
      operation: z.literal("removeOverride"),
      ...copyScope,
      useId: z.uuid(),
    })
    .strict(),
]);
export const consoleDetailInput = z
  .object({
    id: z.uuid(),
    overridePage: z.number().int().min(1).max(1000).default(1),
  })
  .strict();
