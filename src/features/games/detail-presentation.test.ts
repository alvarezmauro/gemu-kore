import { expect, it } from "vitest";
import {
  formatReleaseDate,
  gameDetailPresentation,
} from "./detail-presentation";
import type { GameCopyDetail } from "./management-contracts";
const detail: Parameters<typeof gameDetailPresentation>[0] = {
  game: {
    id: "game",
    revision: 1,
    name: "Game",
    slug: "game",
    description: "Game description",
    archived: false,
  },
  release: {
    id: "release",
    revision: 1,
    gameId: "game",
    platformId: "platform",
    name: "Deluxe Edition",
    slug: "deluxe",
    editionType: "DELUXE",
    editionName: "Deluxe Edition",
    printingLabel: null,
    markets: [],
    languages: [],
    description: null,
    identificationStatus: "CONFIRMED",
    regionLock: null,
    regionLockNote: null,
    components: [],
    archived: false,
  },
  firstReleaseYear: 1994,
  developers: ["Original developer"],
  credits: [],
};
const market = (
  year: number | null,
  month: number | null = null,
  day: number | null = null,
) => ({ id: "market", name: "Market", year, month, day });
it.each([
  [market(null), "Date unknown"],
  [market(1995), "1995"],
  [market(1995, 8), "1995-08"],
  [market(1995, 8, 22), "1995-08-22"],
])("preserves the precision of %j", (value, expected) => {
  expect(formatReleaseDate(value)).toBe(expected);
});
it("uses the earliest known market year without overriding it with a broad fallback or mutating market order", () => {
  const release = {
    ...detail.release,
    markets: [
      market(1996, 1),
      { ...market(1995), id: "other" },
      { ...market(null), id: "unknown" },
    ],
  };
  const before = structuredClone(release);
  expect(gameDetailPresentation({ ...detail, release })).toMatchObject({
    year: "1995",
    yearLabel: "First known market year",
    dates: [{ value: "1996-01" }, { value: "1995" }, { value: "Date unknown" }],
  });
  expect(release).toEqual(before);
});
it("labels a broad first year as market-unknown and keeps absent data unknown", () => {
  expect(gameDetailPresentation(detail)).toMatchObject({
    year: "1994",
    yearLabel: "First release year (market unknown)",
  });
  expect(
    gameDetailPresentation({ ...detail, firstReleaseYear: null }),
  ).toMatchObject({
    year: "Unknown",
    yearLabel: "Release year",
    publishers: "Unknown",
  });
});
it("preserves release-scoped publishers and excludes distributor credits", () => {
  const credits: GameCopyDetail["credits"] = [
    { company: "Publisher", role: "PUBLISHER", market: "Japan", label: null },
    { company: "Publisher", role: "PUBLISHER", market: "Europe", label: null },
    { company: "Distributor", role: "DISTRIBUTOR", market: null, label: null },
  ];
  expect(gameDetailPresentation({ ...detail, credits }).publishers).toBe(
    "Publisher (Japan), Publisher (Europe)",
  );
});
it("uses the selected release description as a complete override and retains truthful empty states", () => {
  expect(gameDetailPresentation(detail).description).toBe("Game description");
  expect(
    gameDetailPresentation({
      ...detail,
      release: { ...detail.release, description: "Release description" },
    }).description,
  ).toBe("Release description");
  expect(
    gameDetailPresentation({
      ...detail,
      game: { ...detail.game, description: null },
      developers: [],
    }),
  ).toMatchObject({
    description: "No description recorded.",
    developers: "Unknown",
    markets: "Unknown",
  });
});
