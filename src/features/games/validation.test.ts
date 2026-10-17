import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  gameSave,
  releaseMarket,
  releaseFields,
  gameArchive,
} from "./validation";
import {
  gameInput,
  releaseInput,
} from "../../../tests/helpers/game-catalog-input";
it("separates conceptual games from releases and normalizes manual unknowns", () => {
  expect(gameSave.parse(gameInput()).fields).toMatchObject({
    name: "Chrono Trigger",
    description: null,
    aliases: [],
  });
  expect(
    gameSave.safeParse({
      ...gameInput(),
      fields: { ...gameInput().fields, platformId: randomUUID() },
    }).success,
  ).toBe(false);
  const release = gameSave.parse(releaseInput(randomUUID(), randomUUID()));
  expect(release.fields).toMatchObject({
    editionType: "STANDARD",
    editionName: null,
    firstReleaseYear: null,
    markets: [],
  });
  for (const property of [
    "hasBox",
    "locationId",
    "notes",
    "publicApproved",
    "packagingTemplateId",
    "ratingValue",
  ]) {
    expect(
      gameSave.safeParse({
        ...releaseInput(randomUUID(), randomUUID()),
        fields: {
          ...releaseInput(randomUUID(), randomUUID()).fields,
          [property]: "injected",
        },
      }).success,
    ).toBe(false);
  }
});
it.each([
  ["2000", "2", "29", true],
  ["1900", "2", "29", false],
  ["2024", "4", "31", false],
  ["1", "2", "28", true],
  ["", "", "", true],
  ["1995", "", "", true],
  ["1995", "3", "", true],
  ["", "3", "", false],
  ["1995", "", "1", false],
  ["0", "", "", false],
  ["99999", "", "", false],
])("validates partial calendar dates %s/%s/%s", (year, month, day, valid) => {
  expect(
    releaseMarket.safeParse({ regionId: randomUUID(), year, month, day })
      .success,
  ).toBe(valid);
});
it("rejects duplicate identities, cross-market credits and foreign form details", () => {
  const f = releaseInput(randomUUID(), randomUUID()).fields;
  const regionId = randomUUID(),
    companyId = randomUUID();
  const m = { regionId, year: "1995", month: "", day: "" };
  expect(releaseFields.safeParse({ ...f, markets: [m, m] }).success).toBe(
    false,
  );
  expect(
    releaseFields.safeParse({
      ...f,
      credits: [{ companyId, role: "PUBLISHER", regionId, creditLabel: "" }],
    }).success,
  ).toBe(false);
  expect(
    releaseFields.safeParse({
      ...f,
      markets: [m],
      credits: [{ companyId, role: "PUBLISHER", regionId, creditLabel: "" }],
    }).success,
  ).toBe(true);
  for (const quantity of [0, -1, 1.5, 10001])
    expect(
      releaseFields.safeParse({
        ...f,
        includedItems: [
          { name: "Manual", kind: "MANUAL", description: "", quantity },
        ],
      }).success,
    ).toBe(false);
  expect(gameSave.safeParse({ ...gameInput(), id: randomUUID() }).success).toBe(
    false,
  );
  expect(
    gameArchive.safeParse({
      kind: "game",
      id: randomUUID(),
      expectedRevision: 0,
      archived: true,
    }).success,
  ).toBe(false);
});
it("requires distinct owned reference IDs and normalized source identities", () => {
  const ref = {
    provider: "wiki",
    providerObjectType: "",
    externalId: "",
    url: "https://example.com/game#one",
  };
  expect(
    gameSave.safeParse({
      ...gameInput(),
      references: [ref, { ...ref, url: "https://example.com/game#two" }],
    }).success,
  ).toBe(false);
  expect(
    gameSave.safeParse({
      ...gameInput(),
      references: [{ ...ref, url: "javascript:alert(1)" }],
    }).success,
  ).toBe(false);
  const id = randomUUID();
  expect(
    gameSave.safeParse({
      ...gameInput(),
      references: [
        { ...ref, id },
        { ...ref, id, url: "https://other.example/game" },
      ],
    }).success,
  ).toBe(false);
});
