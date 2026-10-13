import { z } from "zod";
import { photoMimeTypes, photoSizeLimit, type PhotoType } from "./contracts";
const responseId = z.object({ uploadId: z.uuid() });
export class PhotoUploadError extends Error {
  constructor(
    message: string,
    public readonly uploadId?: string,
  ) {
    super(message);
    this.name = "PhotoUploadError";
  }
}
export function validatePhoto(
  file: Pick<File, "type" | "size">,
): string | null {
  if (!photoMimeTypes.some((type) => type === file.type))
    return "Choose a JPEG, PNG, WebP or AVIF image. Convert HEIC photos to JPEG first.";
  if (file.size <= 0 || file.size > photoSizeLimit)
    return "Choose a photo between 1 byte and 25 MB.";
  return null;
}
export function uploadPhoto(
  file: File,
  collectionItemId: string,
  type: PhotoType,
  onProgress: (percent: number | null) => void,
): Promise<void> {
  const invalid = validatePhoto(file);
  if (invalid) return Promise.reject(new PhotoUploadError(invalid));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    request.timeout = 190_000;
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader(
      "X-GemuKore-Target",
      JSON.stringify({ kind: "collection", id: collectionItemId, type }),
    );
    request.upload.onprogress = (event) =>
      onProgress(
        event.lengthComputable
          ? Math.min(100, Math.round((event.loaded / event.total) * 100))
          : null,
      );
    request.upload.onload = () => onProgress(100);
    const unknown = () =>
      reject(
        new PhotoUploadError(
          "We couldn't confirm this upload. Refresh the page before uploading this photo again.",
        ),
      );
    request.onerror = unknown;
    request.ontimeout = unknown;
    request.onabort = unknown;
    request.onload = () => {
      let data: unknown;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        unknown();
        return;
      }
      const parsed = responseId.safeParse(data);
      if (request.status === 201 && parsed.success) {
        resolve();
        return;
      }
      const message =
        (
          {
            400: "This image could not be read. Choose a supported, single-frame image.",
            401: "Sign in again before uploading photos.",
            403: "Your account cannot upload photos right now.",
            404: "This collection copy is unavailable. Refresh the page.",
            409: "This upload needs checking before you upload the photo again.",
            413: "This image exceeds the size or pixel limit.",
            429: "Another upload is being processed. Try again shortly.",
            503: "Storage is unavailable. Check the upload or refresh before trying again.",
          } as Record<number, string>
        )[request.status] ??
        "We couldn't confirm this upload. Refresh before trying again.";
      reject(
        new PhotoUploadError(
          message,
          parsed.success && [409, 503].includes(request.status)
            ? parsed.data.uploadId
            : undefined,
        ),
      );
    };
    request.send(file);
  });
}
export async function checkPhotoUpload(uploadId: string): Promise<void> {
  try {
    const response = await fetch(`/api/uploads/${uploadId}/complete`, {
      method: "POST",
      signal: AbortSignal.timeout(190_000),
    });
    const parsed = responseId.safeParse(await response.json());
    if (!response.ok || !parsed.success) throw new Error();
  } catch {
    throw new PhotoUploadError(
      "We couldn't complete this upload. Refresh to check saved photos before trying again.",
      uploadId,
    );
  }
}
