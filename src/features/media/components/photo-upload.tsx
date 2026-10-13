"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  photoLabels,
  photoMimeTypes,
  photoTypes,
  type PhotoType,
} from "../contracts";
import { checkPhotoUpload, PhotoUploadError, uploadPhoto } from "../upload";
type UploadEntry = {
  name: string;
  state: "waiting" | "sending" | "processing" | "saved" | "error";
  percent: number | null;
  message?: string;
  uploadId?: string;
};
export function PhotoUpload({
  itemId,
  disabled,
  onBusy,
}: {
  itemId: string;
  disabled: boolean;
  onBusy: (value: boolean) => void;
}) {
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const active = useRef(false);
  const [type, setType] = useState<PhotoType>("PHOTO");
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const router = useRouter();
  const patch = (index: number, update: Partial<UploadEntry>) =>
    setEntries((current) =>
      current.map((entry, i) =>
        i === index ? { ...entry, ...update } : entry,
      ),
    );
  async function start(files: File[]) {
    if (active.current || files.length === 0) return;
    active.current = true;
    onBusy(true);
    setEntries(
      files.map((file) => ({ name: file.name, state: "waiting", percent: 0 })),
    );
    try {
      for (const [index, file] of files.entries()) {
        patch(index, { state: "sending" });
        try {
          await uploadPhoto(file, itemId, type, (percent) =>
            patch(index, {
              percent,
              state: percent === 100 ? "processing" : "sending",
            }),
          );
          patch(index, { state: "saved", percent: 100 });
        } catch (error) {
          patch(index, {
            state: "error",
            message:
              error instanceof PhotoUploadError
                ? error.message
                : "Upload unavailable. Refresh before trying again.",
            uploadId:
              error instanceof PhotoUploadError ? error.uploadId : undefined,
          });
          // Stop on an uncertain outcome; never silently retry or create duplicate uses.
          for (let i = index + 1; i < files.length; i++)
            patch(i, {
              state: "error",
              message:
                "Not uploaded. Select this photo again after checking the previous upload.",
            });
          break;
        }
      }
    } finally {
      active.current = false;
      onBusy(false);
      router.refresh();
    }
  }
  async function check(index: number, uploadId: string) {
    if (active.current) return;
    active.current = true;
    onBusy(true);
    patch(index, { state: "processing", message: undefined });
    try {
      await checkPhotoUpload(uploadId);
      patch(index, { state: "saved", percent: 100, uploadId: undefined });
    } catch (error) {
      patch(index, {
        state: "error",
        message: error instanceof Error ? error.message : "Upload unavailable.",
      });
    } finally {
      active.current = false;
      onBusy(false);
      router.refresh();
    }
  }
  return (
    <section
      aria-label="Upload photos"
      className="space-y-4 rounded-xl bg-card p-6"
    >
      <div>
        <h2 className="font-heading text-xl">Add photos</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          JPEG, PNG, WebP or AVIF, up to 25 MB each. Photos stay private until
          separately reviewed for public display. Convert HEIC camera photos to
          JPEG first.
        </p>
      </div>
      <div className="max-w-sm space-y-2">
        <Label htmlFor="upload-classification">Photo classification</Label>
        <select
          id="upload-classification"
          value={type}
          disabled={disabled}
          onChange={(event) => setType(event.target.value as PhotoType)}
          className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
        >
          {photoTypes.map((value) => (
            <option key={value} value={value}>
              {photoLabels[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => library.current?.click()} disabled={disabled}>
          <ImagePlus aria-hidden="true" />
          Choose photos
        </Button>
        <Button
          variant="outline"
          onClick={() => camera.current?.click()}
          disabled={disabled}
        >
          <Camera aria-hidden="true" />
          Take a photo
        </Button>
      </div>
      <input
        ref={library}
        aria-label="Photo files"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept={photoMimeTypes.join(",")}
        multiple
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void start(files);
        }}
      />
      <input
        ref={camera}
        aria-label="Camera photo"
        className="sr-only"
        tabIndex={-1}
        type="file"
        accept={photoMimeTypes.join(",")}
        capture="environment"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          void start(files);
        }}
      />
      {entries.length > 0 && (
        <ol aria-label="Upload progress" className="space-y-4">
          {entries.map((entry, index) => (
            <li key={index} className="min-w-0 space-y-2">
              <p className="break-all text-sm font-medium">{entry.name}</p>
              <p role="status" className="text-sm">
                {entry.state === "saved"
                  ? "Saved privately"
                  : entry.state === "processing"
                    ? "Processing and saving…"
                    : entry.state === "sending"
                      ? `Uploading${entry.percent === null ? "…" : ` ${entry.percent}%`}`
                      : entry.state === "waiting"
                        ? "Waiting"
                        : entry.message}
              </p>
              {entry.state === "sending" && (
                <progress
                  className="h-2 w-full accent-primary"
                  aria-label={`Upload ${entry.name}`}
                  max={100}
                  value={entry.percent ?? undefined}
                />
              )}
              {entry.state === "error" && entry.uploadId && (
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void check(index, entry.uploadId!)}
                >
                  Check upload
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
