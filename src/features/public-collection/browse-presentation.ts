import type { PublicFacet } from "./contracts";
import type { PublicCollectionInput } from "./validation";
import { publicBrowseHref, type PublicCategory } from "./browsing";

const labels = {
  platform: "Platform",
  region: "Region",
  company: "Company",
  year: "Release year",
  location: "Location",
} as const;
export function activePublicFilters(
  category: PublicCategory,
  input: PublicCollectionInput,
  facets: PublicFacet[],
) {
  const filters: { key: string; label: string; href: string }[] = [];
  const add = (key: keyof PublicCollectionInput, label: string) =>
    filters.push({
      key,
      label,
      href: publicBrowseHref(category, { ...input, [key]: undefined }),
    });
  if (input.q) add("q", `Search: ${input.q}`);
  if (category === "search" && input.type)
    add(
      "type",
      { CONSOLE: "Consoles", GAME: "Games", ACCESSORY: "Accessories" }[
        input.type
      ],
    );
  for (const [key, label] of Object.entries(labels) as [
    keyof typeof labels,
    string,
  ][]) {
    if (input[key] === undefined) continue;
    const option = facets.find(
      (f) => f.field === key && f.value === String(input[key]),
    );
    // Never resolve an unknown/now-hidden option through a private catalog read.
    add(
      key,
      `${label}: ${option?.label ?? (key === "year" ? input.year : "Selected option")}`,
    );
  }
  if (input.hasBox)
    add(
      "hasBox",
      { true: "Box included", false: "Without box", unknown: "Box unknown" }[
        input.hasBox
      ],
    );
  if (input.hasDefects !== undefined)
    add(
      "hasDefects",
      input.hasDefects
        ? "With unresolved defects"
        : "Without unresolved defects",
    );
  return filters;
}
