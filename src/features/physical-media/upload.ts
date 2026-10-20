import { z } from "zod";
import { screenshotUpload } from "@/features/games/screenshot-validation";
import { uploadPackagingFile } from "@/features/physical-editions/upload";
export function uploadCartridgeGeometry(
  file: File,
  template: { id: string; revision: number },
  source: z.input<typeof screenshotUpload>,
  progress: (value: number | null) => void,
) {
  return uploadPackagingFile(
    file,
    {
      kind: "physicalMediaGeometry",
      id: template.id,
      expectedRevision: template.revision,
    },
    source,
    progress,
  );
}
