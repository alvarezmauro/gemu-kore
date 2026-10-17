import { z } from "zod";
import { defectSeverities } from "@/features/defects/contracts";
const note = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .transform((value) => value || null);
export const newCopyDefect = z
  .object({
    title: z.string().trim().min(1, "Give each defect a title.").max(200),
    description: note(4000),
    severity: z.enum(defectSeverities),
  })
  .strict();
export const copyPhysical = z
  .object({
    serialNumber: note(200),
    observedMarkings: note(4000),
    hasBox: z
      .enum(["unknown", "yes", "no"])
      .transform((v) => (v === "unknown" ? null : v === "yes")),
    locationId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
    notes: note(16000),
    defects: z.array(newCopyDefect).max(20),
  })
  .strict();
export type CopyPhysicalDraft = z.input<typeof copyPhysical>;
export const emptyCopyPhysical: CopyPhysicalDraft = {
  serialNumber: "",
  observedMarkings: "",
  hasBox: "unknown",
  locationId: "",
  notes: "",
  defects: [],
};
