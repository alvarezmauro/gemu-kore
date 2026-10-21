import { z } from "zod";
import {
  publicCollectionInput,
  type PublicCollectionInput,
} from "./validation";

export const publicCategories = {
  consoles: {
    type: "CONSOLE",
    title: "Consoles",
    description: "The hardware that made room for new worlds.",
  },
  games: {
    type: "GAME",
    title: "Games",
    description: "Physical adventures, one copy at a time.",
  },
  accessories: {
    type: "ACCESSORY",
    title: "Accessories",
    description: "The controllers and companions that complete the experience.",
  },
  search: {
    type: undefined,
    title: "Explore the collection",
    description:
      "Find a familiar favourite or discover something from another shelf.",
  },
} as const;
export type PublicCategory = keyof typeof publicCategories;
export const publicPageSize = 20;
export const publicLastPage = 251;
export const publicSortLabels = {
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
  relevance: "Best match",
  newest: "Recently added",
  oldest: "Oldest added",
} as const;
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );
const urlInput = z.strictObject({
  q: publicCollectionInput.shape.q,
  type: optional(z.enum(["console", "game", "accessory"])),
  platform: optional(z.uuid()),
  region: optional(z.uuid()),
  company: optional(z.uuid()),
  location: optional(z.uuid()),
  year: optional(
    z
      .string()
      .regex(/^[1-9]\d{0,3}$/)
      .transform(Number),
  ),
  hasBox: optional(z.enum(["true", "false", "unknown"])),
  hasDefects: optional(
    z.enum(["true", "false"]).transform((value) => value === "true"),
  ),
  sort: optional(
    z.enum(["name-asc", "name-desc", "relevance", "newest", "oldest"]),
  ),
  page: optional(
    z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .transform(Number)
      .pipe(z.number().max(publicLastPage)),
  ),
});
export type PublicBrowseParams = Record<string, string | string[] | undefined>;
export function parsePublicBrowse(
  params: PublicBrowseParams,
  category: PublicCategory = "search",
) {
  // Next represents duplicate URL controls as arrays. Do not pick a winner.
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.some(([, value]) => typeof value !== "string")) return null;
  if (
    new URLSearchParams(entries as [string, string][]).toString().length > 4096
  )
    return null;
  if (category !== "search" && Object.hasOwn(params, "type")) return null;
  const parsed = urlInput.safeParse(Object.fromEntries(entries));
  if (!parsed.success) return null;
  const { page = 1, type, ...controls } = parsed.data;
  const input = publicCollectionInput.safeParse({
    ...controls,
    type: publicCategories[category].type ?? type?.toUpperCase(),
    limit: publicPageSize,
    offset: (page - 1) * publicPageSize,
  });
  return input.success ? { input: input.data, page } : null;
}
export function publicUrlParams(params: URLSearchParams): PublicBrowseParams {
  const result: PublicBrowseParams = Object.create(null);
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}
export function publicBrowseHref(
  category: PublicCategory,
  input: PublicCollectionInput,
  page = 1,
) {
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "platform",
    "region",
    "company",
    "year",
    "location",
    "hasBox",
    "hasDefects",
    "sort",
  ] as const) {
    const value = input[key];
    if (
      value !== undefined &&
      value !== "" &&
      !(key === "sort" && value === "name-asc")
    )
      params.set(key, String(value));
  }
  if (category === "search" && input.type)
    params.set("type", input.type.toLowerCase());
  if (page > 1) params.set("page", String(page));
  return `/collection/${category}${params.size ? `?${params}` : ""}`;
}
