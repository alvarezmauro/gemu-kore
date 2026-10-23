"use client";
import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  photoLabels,
  photoTypes,
  photoMimeTypes,
  type PhotoType,
} from "@/features/media/contracts";
import type { CollectionUploadType } from "@/features/media/upload";
export type ConsoleFile = {
  id: string;
  file: File;
  type: CollectionUploadType;
  state: "waiting" | "sending" | "processing" | "saved" | "error";
  percent: number | null;
  message?: string;
  uploadId?: string;
};
export function fileRole(type: CollectionUploadType) {
  return type === "CUSTOM_LOGO"
    ? "Custom logo"
    : type === "CUSTOM_MODEL"
      ? "Custom 3D model"
      : photoLabels[type];
}
function LocalPhoto({ file }: { file: File }) {
  const preview = useCallback(
    (node: HTMLImageElement | null) => {
      if (!node) return;
      const url = URL.createObjectURL(file);
      node.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  return (
    // Browser-local blob preview; no network image or optimization endpoint.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={preview}
      alt={`Selected file: ${file.name}`}
      width={160}
      height={120}
      className="h-24 w-32 rounded-lg bg-stone object-contain"
    />
  );
}
export function ConsoleFileList({
  files,
  remove,
}: {
  files: ConsoleFile[];
  remove?: (id: string) => void;
}) {
  return (
    <ul aria-label="Selected files" className="space-y-3">
      {files.map((entry) => (
        <li key={entry.id} className="min-w-0 rounded-xl bg-muted p-4">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
            {entry.type !== "CUSTOM_MODEL" && <LocalPhoto file={entry.file} />}
            <div className="w-full min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere] sm:w-auto">
              <p className="font-medium">{entry.file.name}</p>
              <p className="text-sm text-muted-foreground">
                {fileRole(entry.type)} ·{" "}
                {(entry.file.size / 1024 / 1024).toFixed(1)} MB
              </p>
              <p role="status" className="text-sm">
                {entry.state === "saved"
                  ? "Saved privately"
                  : entry.state === "processing"
                    ? "Processing and saving…"
                    : entry.state === "sending"
                      ? `Uploading${entry.percent === null ? "…" : ` ${entry.percent}%`}`
                      : entry.state === "error"
                        ? entry.message
                        : "Ready to upload after saving"}
              </p>
            </div>
            {remove && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => remove(entry.id)}
                aria-label={`Remove ${entry.file.name}`}
              >
                Remove
              </Button>
            )}
          </div>
          {entry.state === "sending" && (
            <progress
              className="mt-3 h-2 w-full accent-primary"
              aria-label={`Upload ${entry.file.name}`}
              max={100}
              value={entry.percent ?? undefined}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
export function ConsoleFilePicker({
  overrides,
  files,
  add,
  remove,
}: {
  overrides: boolean;
  files: ConsoleFile[];
  add: (files: File[], type: CollectionUploadType) => void;
  remove: (id: string) => void;
}) {
  const id = useId();
  const [classification, setClassification] = useState<PhotoType>("PHOTO");
  const pick = (input: HTMLInputElement, type: CollectionUploadType) => {
    add(Array.from(input.files ?? []), type);
    input.value = "";
  };
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {overrides
          ? "Optional artwork for this copy only. Your selections leave the shared catalog unchanged. Use a supported image for a logo or a self-contained GLB up to 50 MB for a 3D model."
          : "Optional personal photos: JPEG, PNG, WebP or AVIF, up to 25 MB each. Convert HEIC to JPEG first. You can classify, caption and reorder saved photos in Photos."}
      </p>
      <p className="text-sm text-muted-foreground">
        Files stay on this page until you save. Leaving or reloading now
        discards your selections.
      </p>
      {overrides ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-logo`}>Custom logo</Label>
            <input
              id={`${id}-logo`}
              type="file"
              accept={photoMimeTypes.join(",")}
              className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-secondary-foreground"
              onChange={(e) => pick(e.target, "CUSTOM_LOGO")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-model`}>Custom 3D model</Label>
            <input
              id={`${id}-model`}
              type="file"
              accept=".glb,model/gltf-binary"
              className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-secondary-foreground"
              onChange={(e) => pick(e.target, "CUSTOM_MODEL")}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${id}-type`}>Photo classification</Label>
            <select
              id={`${id}-type`}
              value={classification}
              className="min-h-12 w-full rounded-lg border border-input bg-background px-3"
              onChange={(e) => setClassification(e.target.value as PhotoType)}
            >
              {photoTypes.map((type) => (
                <option key={type} value={type}>
                  {photoLabels[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-photos`}>Choose photos</Label>
            <input
              id={`${id}-photos`}
              type="file"
              multiple
              accept={photoMimeTypes.join(",")}
              className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-secondary-foreground"
              onChange={(e) => pick(e.target, classification)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-camera`}>Take a photo</Label>
            <input
              id={`${id}-camera`}
              type="file"
              capture="environment"
              accept={photoMimeTypes.join(",")}
              className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-secondary-foreground"
              onChange={(e) => pick(e.target, classification)}
            />
          </div>
        </div>
      )}
      <ConsoleFileList
        files={files.filter(
          (f) =>
            (f.type === "CUSTOM_LOGO" || f.type === "CUSTOM_MODEL") ===
            overrides,
        )}
        remove={remove}
      />
    </div>
  );
}
