import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  consoleCreate,
  consoleLookup,
  emptyConsolePhysical,
} from "./validation";
const input = () => ({
  ...emptyConsolePhysical,
  id: randomUUID(),
  platformId: randomUUID(),
  modelId: randomUUID(),
  platformRevision: 1,
  modelRevision: 1,
});
it("keeps unknown physical facts empty and accepts incomplete catalog selections without inventing overrides", () => {
  const result = consoleCreate.parse(input());
  expect(result).toMatchObject({
    hasBox: null,
    locationId: null,
    notes: null,
    serialNumber: null,
    defects: [],
  });
  expect(
    consoleCreate.parse({ ...input(), hasBox: "no", serialNumber: " 00001 " }),
  ).toMatchObject({ hasBox: false, serialNumber: "00001" });
});
it.each([
  "publicationStatus",
  "manufacturerId",
  "regionId",
  "regionLock",
  "customLogoAssetId",
  "createdById",
  "type",
])("rejects client-supplied %s", (field) => {
  expect(
    consoleCreate.safeParse({ ...input(), [field]: "injected" }).success,
  ).toBe(false);
});
it("bounds identifiers, private text, defect records and catalog pagination", () => {
  for (const fields of [
    { serialNumber: "a".repeat(201) },
    { observedMarkings: "a".repeat(4001) },
    { notes: "a".repeat(16001) },
    { defects: [{ title: " ", description: "", severity: "MINOR" }] },
    { modelRevision: 0 },
    { locationId: "unknown" },
  ])
    expect(consoleCreate.safeParse({ ...input(), ...fields }).success).toBe(
      false,
    );
  expect(consoleLookup.safeParse({ page: 1001 }).success).toBe(false);
  expect(consoleLookup.safeParse({ query: "a".repeat(201) }).success).toBe(
    false,
  );
});
