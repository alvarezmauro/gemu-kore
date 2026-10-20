import "server-only";
import type {
  GameMetadataResult,
  GameSearchPage,
} from "@/server/providers/game-metadata/contracts";

// Fixed messages project retained validation state without exposing raw diagnostics.
export function evidenceWarnings(
  metadata: GameMetadataResult | null,
  search: GameSearchPage | null,
): string[] {
  if (!metadata) {
    const incomplete = search?.candidates.some((candidate) =>
      [
        candidate.platforms,
        candidate.firstRelease,
        candidate.descriptionExcerpt,
      ].some(
        (section) => section.state === "limited" || section.state === "invalid",
      ),
    );
    return incomplete || search?.diagnostics.length
      ? [
          "Search evidence is incomplete. Missing platforms, dates or identity details do not rule out a match; check the source before choosing.",
        ]
      : [];
  }
  const warnings: string[] = [];
  if (metadata.diagnostics.some((item) => item.section === "identity"))
    warnings.push(
      "Some game identity details are missing, unsupported or truncated. Check the selected game before applying suggestions.",
    );
  for (const [label, section] of [
    ["Description", metadata.description],
    ["Developer", metadata.companies],
    ["Trailer", metadata.videos],
    ["Playtime", metadata.playtime],
  ] as const) {
    if (section.state === "limited")
      warnings.push(
        `${label} evidence is incomplete; only supplied values or choices are shown.`,
      );
    if (section.state === "invalid")
      warnings.push(
        `${label} evidence could not be validated and is unavailable for import.`,
      );
  }
  return warnings;
}
