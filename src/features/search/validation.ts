import { z } from "zod";
import { matchSources, searchTypes } from "./contracts";
export const searchInput = z
  .object({
    q: z
      .string()
      .max(640)
      .transform((value) => value.normalize("NFC").trim().replace(/\s+/gu, " "))
      .refine((value) => [...value].length <= 160)
      .refine((value) => value === "" || value.split(" ").length <= 8)
      .refine((value) => !value.includes("\0")),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(5000).default(0),
  })
  .strict();
export const searchResult = z
  .object({
    state: z.enum(["idle", "ready"]),
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            type: z.enum(searchTypes),
            title: z.string(),
            context: z.string(),
            identificationStatus: z.enum(["INCOMPLETE", "CONFIRMED"]),
            matchSources: z.array(z.enum(matchSources)),
            details: z
              .object({
                releaseYear: z.number().int().nullable(),
                location: z.string().nullable(),
                platform: z.string().nullable(),
                publisher: z.string().nullable(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .max(50),
    hasMore: z.boolean(),
    offset: z.number().int().min(0).max(5000),
    limit: z.number().int().min(1).max(50),
  })
  .strict();
