import { z } from "zod";
import { screenshotUpload } from "@/features/games/screenshot-validation";
import { validatePhoto, PhotoUploadError } from "@/features/media/upload";
export function uploadArtwork(
  file: File,
  releaseId: string,
  source: z.input<typeof screenshotUpload>,
  progress: (value: number | null) => void,
): Promise<{ uploadId: string; useId?: string }> {
  return uploadPackagingFile(
    file,
    { kind: "catalog", target: "gameRelease", id: releaseId, role: "GALLERY" },
    source,
    progress,
  );
}
export function uploadGeometry(
  file: File,
  template: { id: string; revision: number },
  source: z.input<typeof screenshotUpload>,
  progress: (value: number | null) => void,
) {
  return uploadPackagingFile(
    file,
    {
      kind: "packagingGeometry",
      id: template.id,
      expectedRevision: template.revision,
    },
    source,
    progress,
  );
}
export function uploadPackagingFile(
  file: File,
  target: Record<string, unknown>,
  source: z.input<typeof screenshotUpload>,
  progress: (value: number | null) => void,
): Promise<{ uploadId: string; useId?: string }> {
  const geometry =
    target.kind === "packagingGeometry" ||
    target.kind === "physicalMediaGeometry";
  const invalid = geometry
    ? !file.name.toLowerCase().endsWith(".glb") ||
      !file.size ||
      file.size > 8 * 1024 * 1024
      ? "Choose a GLB file up to 8 MiB."
      : null
    : validatePhoto(file);
  if (invalid) return Promise.reject(new Error(invalid));
  const parsed = screenshotUpload.safeParse(source);
  if (!parsed.success)
    return Promise.reject(new Error(parsed.error.issues[0].message));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    request.timeout = 190000;
    request.setRequestHeader(
      "Content-Type",
      geometry ? "model/gltf-binary" : file.type,
    );
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader(
      "X-GemuKore-Target",
      encodeURIComponent(
        JSON.stringify({
          ...target,
          [geometry ? "source" : "artwork"]: parsed.data,
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
          "We couldn't confirm the upload. Refresh before uploading this file again.",
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
              ? "Only administrators can upload physical-edition files."
              : "The file could not be saved. Check the file and refresh before trying again.",
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
