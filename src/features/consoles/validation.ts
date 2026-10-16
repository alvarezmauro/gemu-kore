import { z } from "zod";
import { defectSeverities } from "@/features/defects/contracts";

const note = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .transform((value) => value || null);
export const newConsoleDefect = z
  .object({
    title: z.string().trim().min(1, "Give each defect a title.").max(200),
    description: note(4000),
    severity: z.enum(defectSeverities),
  })
  .strict();
export const consolePhysical = z
  .object({
    serialNumber: note(200),
    observedMarkings: note(4000),
    hasBox: z
      .enum(["unknown", "yes", "no"])
      .transform((v) => (v === "unknown" ? null : v === "yes")),
    locationId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
    notes: note(16000),
    defects: z.array(newConsoleDefect).max(20),
  })
  .strict();
export const consoleCreate = consolePhysical
  .extend({
    id: z.uuid(),
    platformId: z.uuid(),
    platformRevision: z.number().int().min(1).max(2147483646),
    modelId: z.uuid(),
    modelRevision: z.number().int().min(1).max(2147483646),
  })
  .strict();
export type ConsoleCreate = z.output<typeof consoleCreate>;
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
