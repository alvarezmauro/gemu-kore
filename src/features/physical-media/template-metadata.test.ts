import { expect, it } from "vitest";
import {
  cartridgeFormat,
  cartridgeFormatKey,
  cartridgeFormatLabels,
  cartridgeFormatLabel,
  cartridgeTemplateMetadata,
} from "./template-metadata";
it.each(cartridgeFormatKey.options)(
  "validates curator-supplied %s metadata without selecting geometry",
  (formatKey) => {
    const data = cartridgeFormat.parse({
      schemaVersion: 1,
      formatKey,
      variant: "  Curator shell revision 2  ",
    });
    expect(data.variant).toBe("Curator shell revision 2");
    expect(cartridgeFormatLabel(data)).toContain("Curator shell revision 2");
    expect(cartridgeFormatLabels[formatKey]).toBeTruthy();
    expect(Object.keys(data).sort()).toEqual([
      "formatKey",
      "schemaVersion",
      "variant",
    ]);
  },
);
it("reads old metadata as unspecified without writing back or sharing default objects", () => {
  const old = {
    schemaVersion: 1,
    synthetic: true,
    measurementNote: "Original measurements",
  };
  const a = cartridgeTemplateMetadata.parse(old),
    b = cartridgeTemplateMetadata.parse(old);
  expect(a.format).toEqual({
    schemaVersion: 1,
    formatKey: "unspecified",
    variant: "",
  });
  expect(old).not.toHaveProperty("format");
  a.format.variant = "Local description";
  expect(b.format.variant).toBe("");
  expect(cartridgeFormatLabel(b.format)).toBe("Cartridge");
});
it("rejects unsupported or ambiguous metadata, oversized text and invented preset fields", () => {
  const base = { schemaVersion: 1, formatKey: "snes-us", variant: "" };
  for (const patch of [
    { schemaVersion: 2 },
    { formatKey: "SNES" },
    { formatKey: "other" },
    { variant: "x".repeat(201) },
    { widthMm: 100 },
    { baseModelAssetId: crypto.randomUUID() },
    { platformId: crypto.randomUUID() },
  ])
    expect(cartridgeFormat.safeParse({ ...base, ...patch }).success).toBe(
      false,
    );
  expect(
    cartridgeFormat.safeParse({ ...base, formatKey: "other", variant: " " })
      .success,
  ).toBe(false);
});
