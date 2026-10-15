import { z } from "zod";
import { searchInput, searchResult } from "./validation";
import { catalogKinds } from "./palette-contracts";
export const paletteInput = searchInput.pick({ q: true }).strict();
export const paletteResult = z
  .object({
    collection: searchResult,
    catalog: z
      .array(
        z
          .object({
            id: z.uuid(),
            kind: z.enum(catalogKinds),
            title: z.string(),
            context: z.string(),
            identificationStatus: z
              .enum(["INCOMPLETE", "CONFIRMED"])
              .nullable(),
          })
          .strict(),
      )
      .max(10),
    catalogHasMore: z.boolean(),
  })
  .strict();
