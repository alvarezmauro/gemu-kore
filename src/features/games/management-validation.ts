import { z } from "zod";
import { gameCopyCreate } from "./creation-validation";
const scope = {
  id: z.uuid(),
  expectedRevision: z.number().int().min(1).max(2147483646),
};
export const gameUpdate = gameCopyCreate
  .omit({ defects: true })
  .extend({ operation: z.literal("update"), ...scope })
  .strict();
export const gameMutation = z.discriminatedUnion("operation", [
  gameUpdate,
  z.strictObject({ operation: z.literal("delete"), ...scope }),
]);
export const gameDetailInput = z.strictObject({ id: z.uuid() });
