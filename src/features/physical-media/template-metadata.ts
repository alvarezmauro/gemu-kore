import { z } from "zod";
// Descriptive curation choices from PROJECT_SPEC §44. These select no geometry,
// physical dimensions, artwork mapping, platform FK or readiness automatically.
export const cartridgeFormatKey = z.enum([
  "unspecified",
  "nes-us",
  "famicom",
  "snes-us",
  "super-famicom",
  "genesis",
  "game-boy",
  "game-boy-color",
  "game-boy-advance",
  "nintendo-64",
  "other",
]);
type CartridgeFormatKey = z.infer<typeof cartridgeFormatKey>;
export const cartridgeFormatLabels: Record<CartridgeFormatKey, string> = {
  unspecified: "Unspecified",
  "nes-us": "NES US",
  famicom: "Famicom",
  "snes-us": "SNES US",
  "super-famicom": "Super Famicom",
  genesis: "Genesis",
  "game-boy": "Game Boy",
  "game-boy-color": "Game Boy Color",
  "game-boy-advance": "Game Boy Advance",
  "nintendo-64": "Nintendo 64",
  other: "Other",
};
export const unspecifiedCartridgeFormat = {
  schemaVersion: 1 as const,
  formatKey: "unspecified" as const,
  variant: "",
};
export const cartridgeFormat = z
  .strictObject({
    schemaVersion: z.literal(1),
    formatKey: cartridgeFormatKey,
    variant: z.string().trim().max(200),
  })
  .refine(
    (f) => f.formatKey !== "other" || f.variant.length > 0,
    "Describe the other cartridge format in the shell variant.",
  );
export type CartridgeFormat = z.infer<typeof cartridgeFormat>;
export const cartridgeTemplateMetadata = z.strictObject({
  schemaVersion: z.literal(1),
  synthetic: z.boolean(),
  measurementNote: z.string().min(1).max(1000),
  // Read existing Task 14.4 rows without rewriting manual metadata.
  format: cartridgeFormat.default(() => ({ ...unspecifiedCartridgeFormat })),
});
export function cartridgeFormatLabel(format: CartridgeFormat) {
  const label =
    format.formatKey === "unspecified"
      ? "Cartridge"
      : `${cartridgeFormatLabels[format.formatKey]} cartridge`;
  return format.variant ? `${label} · ${format.variant}` : label;
}
