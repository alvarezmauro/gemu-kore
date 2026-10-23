import { z } from "zod";

const choicePage = z.number().int().min(0).max(1_000_000);
export const copyLookup = z.strictObject({
  query: z.string().trim().max(200).default(""),
  page: choicePage.default(0),
});
export const managementPage = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^(0|[1-9]\d{0,6})$/)
      .transform(Number),
  ])
  .pipe(choicePage);
export type CopyOption = { id: string; label: string };
export type CopyChoices = {
  items: CopyOption[];
  page: number;
  hasMore: boolean;
};
export type CopyChoiceResult =
  | { status: "success"; data: CopyChoices }
  | { status: "error"; message: string };
