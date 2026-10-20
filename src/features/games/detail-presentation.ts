import type { GameCopyDetail } from "./management-contracts";
import type { ReleaseChoice } from "./creation-contracts";

export function formatReleaseDate(market: ReleaseChoice["markets"][number]) {
  if (market.year === null) return "Date unknown";
  return [
    String(market.year),
    ...(market.month === null ? [] : [String(market.month).padStart(2, "0")]),
    ...(market.day === null ? [] : [String(market.day).padStart(2, "0")]),
  ].join("-");
}

// Keep catalog fallback and partial-date selection outside React components.
export function gameDetailPresentation(
  detail: Pick<
    GameCopyDetail,
    "release" | "firstReleaseYear" | "credits" | "game" | "developers"
  >,
) {
  const years = detail.release.markets.flatMap((m) =>
    m.year === null ? [] : [m.year],
  );
  const year = years.length ? Math.min(...years) : detail.firstReleaseYear;
  return {
    edition: detail.release.name,
    markets: detail.release.markets.map((m) => m.name).join(", ") || "Unknown",
    year: year === null ? "Unknown" : String(year),
    yearLabel: years.length
      ? "First known market year"
      : year === null
        ? "Release year"
        : "First release year (market unknown)",
    publishers:
      detail.credits
        .filter((credit) => credit.role === "PUBLISHER")
        .map(
          (credit) =>
            `${credit.company}${credit.market ? ` (${credit.market})` : ""}`,
        )
        .join(", ") || "Unknown",
    description:
      detail.release.description ??
      detail.game.description ??
      "No description recorded.",
    developers: detail.developers.join(", ") || "Unknown",
    dates: detail.release.markets.map((m) => ({
      id: m.id,
      label: m.name,
      value: formatReleaseDate(m),
    })),
  };
}
export type GameDetailPresentation = ReturnType<typeof gameDetailPresentation>;
