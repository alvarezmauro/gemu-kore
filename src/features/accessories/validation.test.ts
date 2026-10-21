import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { accessorySave, accessoryPage } from "./validation";
import {
  accessoryInput,
  variantInput,
} from "../../../tests/helpers/accessory-input";
it("validates separate family and variant data with multiple explicit compatible platforms", () => {
  const family = accessorySave.parse({
    ...accessoryInput(),
    fields: {
      ...accessoryInput().fields,
      specifications: '{"connection":"wired"}',
      releaseYear: "2000",
    },
  });
  expect(family.fields).toMatchObject({
    releaseYear: 2000,
    specifications: { schemaVersion: 1, data: { connection: "wired" } },
  });
  const v = variantInput(randomUUID());
  expect(
    accessorySave.parse({
      ...v,
      fields: {
        ...v.fields,
        platforms: [
          {
            platformId: randomUUID(),
            compatibilityNote: "  Adapter required  ",
          },
          { platformId: randomUUID(), compatibilityNote: "" },
        ],
      },
    }).fields,
  ).toMatchObject({
    platforms: [
      { compatibilityNote: "Adapter required" },
      { compatibilityNote: null },
    ],
    specificationsOverride: null,
  });
});
it.each(["0", "10000", "1.2", "-1", "unknown"])(
  "rejects invalid years %s",
  (releaseYear) => {
    const v = accessoryInput();
    expect(
      accessorySave.safeParse({ ...v, fields: { ...v.fields, releaseYear } })
        .success,
    ).toBe(false);
  },
);
it.each([
  "[]",
  '{"schemaVersion":1,"data":{}}',
  '{"__proto__":{"polluted":true}}',
  '{"nested":{"constructor":{}}}',
  '{"value":1e999}',
])("rejects unsafe specification objects %s", (specifications) => {
  const v = accessoryInput();
  expect(
    accessorySave.safeParse({ ...v, fields: { ...v.fields, specifications } })
      .success,
  ).toBe(false);
});
it("rejects duplicate platform and market links and family compatibility input", () => {
  const v = variantInput(randomUUID()),
    id = randomUUID();
  expect(
    accessorySave.safeParse({
      ...v,
      fields: {
        ...v.fields,
        platforms: [
          { platformId: id, compatibilityNote: "" },
          { platformId: id, compatibilityNote: "" },
        ],
      },
    }).success,
  ).toBe(false);
  expect(
    accessorySave.safeParse({
      ...v,
      fields: { ...v.fields, regionIds: [id, id] },
    }).success,
  ).toBe(false);
  const f = accessoryInput();
  expect(
    accessorySave.safeParse({ ...f, fields: { ...f.fields, platforms: [] } })
      .success,
  ).toBe(false);
});
it("requires explicit reviewed copying only on new variants and preserves revision guards", () => {
  const v = variantInput(randomUUID()),
    compatibilityCopy = {
      sourceId: randomUUID(),
      sourceRevision: 1,
      reviewed: false,
    };
  expect(accessorySave.safeParse({ ...v, compatibilityCopy }).success).toBe(
    false,
  );
  expect(
    accessorySave.safeParse({
      ...v,
      compatibilityCopy: { ...compatibilityCopy, reviewed: true },
    }).success,
  ).toBe(true);
  expect(accessorySave.safeParse({ ...v, id: randomUUID() }).success).toBe(
    false,
  );
  expect(
    accessorySave.safeParse({
      ...v,
      id: randomUUID(),
      expectedRevision: 1,
      compatibilityCopy: { ...compatibilityCopy, reviewed: true },
    }).success,
  ).toBe(false);
});
it("rejects unsafe video and extra publication fields", () => {
  const f = accessoryInput();
  expect(
    accessorySave.safeParse({
      ...f,
      fields: {
        ...f.fields,
        trailer: { provider: "DIRECT_URL", url: "javascript:alert(1)" },
      },
    }).success,
  ).toBe(false);
  expect(
    accessorySave.safeParse({
      ...f,
      fields: { ...f.fields, trailerPublicApproved: true },
    }).success,
  ).toBe(false);
});
it("normalizes external identities, rejects duplicates and handles invalid URLs without throwing", () => {
  const f = accessoryInput(),
    ref = {
      provider: "Manual",
      providerObjectType: "",
      externalId: "",
      url: "https://example.com/page#one",
    };
  expect(
    accessorySave.safeParse({
      ...f,
      references: [ref, { ...ref, url: "https://example.com/page#two" }],
    }).success,
  ).toBe(false);
  expect(
    accessorySave.safeParse({
      ...f,
      references: [{ ...ref, url: "javascript:bad" }],
    }).success,
  ).toBe(false);
  expect(accessoryPage.safeParse({ page: -1 }).success).toBe(false);
});
