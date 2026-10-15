import {
  catalogFields,
  type CatalogKind,
} from "../../src/features/catalog/contracts";
export function catalogInput(
  kind: CatalogKind,
  overrides: Record<string, unknown> = {},
) {
  const fields: Record<string, unknown> = Object.fromEntries(
    catalogFields[kind].map((field) => [field.key, ""]),
  );
  Object.assign(fields, { name: "Test record", slug: "test-record" });
  if (kind === "platform" || kind === "model") fields.manufacturerId = "";
  if (kind === "region") fields.code = "JP";
  if (kind === "model")
    Object.assign(fields, {
      platformId: "11111111-1111-4111-8111-111111111111",
      regionLock: "",
      regionIds: [],
      identificationStatus: "INCOMPLETE",
    });
  return {
    kind,
    fields: { ...fields, ...overrides },
    references: [] as unknown[],
  };
}
