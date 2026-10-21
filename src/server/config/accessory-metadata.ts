import "server-only";
import { z } from "zod";
export const accessoryMetadataEnvironment = z.object({
  ACCESSORY_METADATA_PROVIDER: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["none", "wikidata"]).default("none"),
  ),
  WIKIDATA_USER_AGENT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .trim()
      .min(10)
      .max(200)
      .regex(/^[\x20-\x7e]+$/)
      .optional(),
  ),
});
export function getAccessoryMetadataConfiguration() {
  const parsed = accessoryMetadataEnvironment.safeParse(process.env);
  if (!parsed.success)
    throw new Error("Invalid accessory metadata configuration.");
  return parsed.data.ACCESSORY_METADATA_PROVIDER === "wikidata"
    ? {
        userAgent:
          parsed.data.WIKIDATA_USER_AGENT ??
          "GemuKore/0.1 (https://github.com/alvarezmauro/gemu-kore)",
      }
    : null;
}
