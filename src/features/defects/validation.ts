import { z } from "zod";
import { defectSeverities, defectStatuses } from "./contracts";

export const defectItemId = z.uuid();
const scope = {
  collectionItemId: defectItemId,
  expectedRevision: z.number().int().min(1).max(2147483646),
};
const note = z
  .string()
  .trim()
  .max(4000)
  .nullish()
  .transform((value) => value || null);
const fields = {
  title: z.string().trim().min(1).max(200),
  description: note,
  severity: z.enum(defectSeverities),
  status: z.enum(defectStatuses).default("ACTIVE"),
  repairNote: note,
};
export const defectMutation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), ...scope, ...fields }).strict(),
  z
    .object({
      operation: z.literal("update"),
      ...scope,
      id: z.uuid(),
      ...fields,
    })
    .strict(),
  z.object({ operation: z.literal("delete"), ...scope, id: z.uuid() }).strict(),
]);
