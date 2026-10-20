import { z } from "zod";
import { glbSlotTarget } from "./packaging-contracts";
// One authored cartridge profile. Console/market variants are curated revisions,
// never inferred from a release platform or cover.
export const cartridgeFamily = z.literal("cartridge");
export const cartridgeSlots = z
  .array(
    z.strictObject({
      name: z.literal("FRONT_LABEL"),
      target: glbSlotTarget,
    }),
  )
  .length(1);
