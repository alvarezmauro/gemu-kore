import { z } from "zod";
import { screenshotUpload } from "@/features/games/screenshot-validation";
import { validatePhoto, PhotoUploadError } from "@/features/media/upload";
export function uploadArtwork(
  file: File,
  releaseId: string,
  source: z.input<typeof screenshotUpload>,
  progress: (value: number | null) => void,
): Promise<{ uploadId: string; useId?: string }> {
  const invalid = validatePhoto(file);
  if (invalid) return Promise.reject(new Error(invalid));
  const parsed = screenshotUpload.safeParse(source);
  if (!parsed.success)
    return Promise.reject(new Error(parsed.error.issues[0].message));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    request.timeout = 190000;
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader(
      "X-GemuKore-Target",
      encodeURIComponent(
        JSON.stringify({
          kind: "catalog",
          target: "gameRelease",
          id: releaseId,
          role: "GALLERY",
          artwork: parsed.data,
        }),
      ),
    );
    request.upload.onprogress = (e) =>
      progress(
        e.lengthComputable
          ? Math.min(100, Math.round((e.loaded / e.total) * 100))
          : null,
      );
    const unknown = () =>
      reject(
        new PhotoUploadError(
          "We couldn't confirm the upload. Refresh the gallery before uploading this file again.",
        ),
      );
    request.onerror = unknown;
    request.onabort = unknown;
    request.ontimeout = unknown;
    request.onload = () => {
      try {
        const data = z
          .object({ uploadId: z.uuid(), useId: z.uuid().optional() })
          .safeParse(JSON.parse(request.responseText));
        if (request.status === 201 && data.success) {
          resolve(data.data);
          return;
        }
        reject(
          new PhotoUploadError(
            request.status === 403
              ? "Only administrators can upload artwork."
              : "The artwork could not be saved. Check the file and gallery before trying again.",
            data.success ? data.data.uploadId : undefined,
          ),
        );
      } catch {
        unknown();
      }
    };
    request.send(file);
  });
}
