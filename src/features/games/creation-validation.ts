import { z } from "zod";
import { copyPhysical } from "@/features/collection/copy-validation";
import { editions } from "./validation";
const revision = z.number().int().min(1).max(2147483646);
const search = {
  query: z.string().trim().max(200).default(""),
  page: z.number().int().min(0).max(1000).default(0),
};
export const gameSearch = z.strictObject(search);
export const releaseSearch = z.strictObject({
  ...search,
  platformId: z.uuid(),
  gameId: z.uuid(),
  marketId: z.union([z.uuid(), z.literal("")]).default(""),
  editionType: z.union([z.enum(editions), z.literal("")]).default(""),
});
export const releaseSelection = z.strictObject({
  id: z.uuid(),
  platformId: z.uuid(),
  gameId: z.uuid(),
});
export const gameCopyCreate = copyPhysical
  .extend({
    id: z.uuid(),
    platformId: z.uuid(),
    platformRevision: revision,
    gameId: z.uuid(),
    gameRevision: revision,
    releaseId: z.uuid(),
    releaseRevision: revision,
  })
  .strict();
