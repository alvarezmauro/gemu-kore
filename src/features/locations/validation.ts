import { z } from "zod";
import { locationTypes } from "./contracts";

const fields = {
  name: z.string().trim().min(1).max(200),
  type: z.enum(locationTypes),
  parentId: z.uuid().nullable(),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
};
const existing = { id: z.uuid(), updatedAt: z.iso.datetime() };
export const locationMutation = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create"), ...fields }).strict(),
  z.object({ operation: z.literal("update"), ...existing, ...fields }).strict(),
  z
    .object({
      operation: z.literal("reorder"),
      ...existing,
      direction: z.enum(["up", "down"]),
    })
    .strict(),
  z.object({ operation: z.literal("delete"), ...existing }).strict(),
]);
export type LocationMutation = z.infer<typeof locationMutation>;
