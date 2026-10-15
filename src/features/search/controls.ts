import { z } from "zod";

export const sortLabels = {
  relevance: "Best match",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
  newest: "Recently added",
  oldest: "Oldest added",
  "year-asc": "Release year ascending",
  "year-desc": "Release year descending",
  location: "Location",
  platform: "Platform",
  publisher: "Publisher",
} as const;
export const editionTypes = [
  "STANDARD",
  "LIMITED",
  "SPECIAL",
  "COLLECTORS",
  "DELUXE",
  "GREATEST_HITS",
  "PLAYERS_CHOICE",
  "PLATINUM",
  "BUDGET",
  "RE_RELEASE",
  "BUNDLE",
  "CUSTOM",
] as const;
const slug = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u);
export const collectionControls = z
  .object({
    type: z.enum(["console", "game", "accessory"]).optional(),
    platform: slug.optional(),
    manufacturer: slug.optional(),
    publisher: slug.optional(),
    producer: slug.optional(),
    model: slug.optional(),
    region: slug.optional(),
    year: z
      .union([z.string().regex(/^[1-9]\d{0,3}$/), z.literal("unknown")])
      .optional(),
    location: z.union([z.uuid(), z.literal("unassigned")]).optional(),
    hasBox: z.enum(["true", "false", "unknown"]).optional(),
    hasDefects: z.enum(["true", "false"]).optional(),
    edition: z.enum(editionTypes).optional(),
    sort: z
      .enum(
        Object.keys(sortLabels) as [
          keyof typeof sortLabels,
          ...(keyof typeof sortLabels)[],
        ],
      )
      .default("relevance"),
  })
  .strict();
export type CollectionControls = z.infer<typeof collectionControls>;
export type FilterOption = { value: string; label: string };
export type FilterOptions = Record<
  | "platform"
  | "manufacturer"
  | "publisher"
  | "producer"
  | "model"
  | "region"
  | "year"
  | "location",
  FilterOption[]
>;
const keys = [
  "type",
  "platform",
  "manufacturer",
  "publisher",
  "producer",
  "model",
  "region",
  "year",
  "location",
  "hasBox",
  "hasDefects",
  "edition",
  "sort",
] as const;
export function parseControls(params: URLSearchParams) {
  const input: Record<string, string> = {};
  if (params.toString().length > 2048)
    return collectionControls.safeParse(null);
  for (const [key, value] of params) {
    if (key in input || !keys.includes(key as (typeof keys)[number]))
      return collectionControls.safeParse(null);
    input[key] = value;
  }
  return collectionControls.safeParse(input);
}
export function controlsQuery(controls: CollectionControls) {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = controls[key];
    if (value !== undefined && !(key === "sort" && value === "relevance"))
      params.set(key, value);
  }
  return params.toString();
}
export function controlsActive(controls: CollectionControls) {
  return controlsQuery(controls) !== "";
}
