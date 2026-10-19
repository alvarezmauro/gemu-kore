"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CopyConfirm } from "@/features/collection/components/copy-confirm";
import {
  checkCollectionUpload,
  PhotoUploadError,
} from "@/features/media/upload";
import { ScreenshotGallery } from "./screenshot-gallery";
import { emptyScreenshotUpload } from "../screenshot-validation";
import { uploadScreenshot } from "../screenshot-upload";
import { changeScreenshot } from "../screenshot-actions";
import type {
  ScreenshotGalleryData,
  Screenshot,
} from "../screenshot-contracts";
export function ScreenshotManager({
  release,
  gallery,
}: {
  release: { id: string; revision: number; archived: boolean };
  gallery: ScreenshotGalleryData;
}) {
  const router = useRouter();
  const [source, setSource] = useState(() => ({ ...emptyScreenshotUpload }));
  const [file, setFile] = useState<File | null>(null);
  const [saving, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const refresh = () => startRefresh(() => router.refresh());
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [editing, setEditing] = useState<{
    photo: Screenshot;
    revision: number;
  } | null>(null);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const pending = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  async function task(run: () => Promise<void>) {
    if (pending.current || busy) return;
    pending.current = true;
    setBusy(true);
    setPercent(null);
    setError("");
    try {
      await run();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't confirm this change. Refresh the gallery.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const base = `/app/catalog/games/screenshots?releaseId=${release.id}`;
  async function mutate(input: unknown) {
    const result = await changeScreenshot(input);
    if (result.status === "error") {
      setError(result.message);
      return result;
    }
    setEditing(null);
    refresh();
    return result;
  }
  return (
    <div className="space-y-8" data-screenshot-revision={release.revision}>
      <p className="text-sm text-muted-foreground">
        Shared screenshots belong to this release. Personal photos remain with
        each copy.
      </p>
      {release.archived && (
        <p>Restore this release before changing screenshots.</p>
      )}
      {error && (
        <p
          ref={alert}
          role="alert"
          tabIndex={-1}
          className="rounded-xl bg-muted p-4 text-sm"
        >
          {error}
        </p>
      )}
      <form
        className="max-w-3xl space-y-4 rounded-xl bg-card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          void task(async () => {
            try {
              await uploadScreenshot(file, release.id, source, setPercent);
              setFile(null);
              setSource({ ...emptyScreenshotUpload });
              if (picker.current) picker.current.value = "";
              refresh();
            } catch (e) {
              if (e instanceof PhotoUploadError) {
                setUploadId(e.uploadId ?? null);
                setUncertain(true);
              }
              throw e;
            }
          });
        }}
      >
        <h2 className="font-heading text-xl">Add screenshot</h2>
        <p className="text-sm text-muted-foreground">
          JPEG, PNG, WebP or AVIF, up to 25 MB. Source details are saved with
          the upload. To correct a source later, remove the gallery link and
          upload a replacement; the original provenance stays recorded.
        </p>
        <fieldset
          disabled={busy || release.archived || uncertain}
          className="min-w-0 space-y-4"
        >
          <label className="block space-y-2">
            Screenshot file
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="block w-full min-w-0"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {(
            [
              ["caption", "Caption"],
              ["altText", "Image description"],
              ["provider", "Source name"],
              ["sourceUrl", "Source URL"],
              ["author", "Author"],
              ["licenseName", "License name"],
              ["licenseUrl", "License URL"],
              ["attribution", "Attribution"],
              ["usageRestrictions", "Usage restrictions"],
              ["retrievedAt", "Retrieved date"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-2">
              <span>{label}</span>
              <Input
                aria-label={label}
                type={key === "retrievedAt" ? "date" : "text"}
                value={source[key] ?? ""}
                onChange={(e) =>
                  setSource({ ...source, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <label className="block space-y-2">
            Source type
            <select
              aria-label="Source type"
              className="min-h-12 w-full rounded-lg border border-input bg-background px-3"
              value={source.sourceType}
              onChange={(e) =>
                setSource({
                  ...source,
                  sourceType: e.target.value as typeof source.sourceType,
                })
              }
            >
              <option value="USER_UPLOAD">User upload</option>
              <option value="CURATED">Manually curated source</option>
            </select>
          </label>
          <Button type="submit" disabled={!file}>
            {busy ? "Uploading…" : "Upload screenshot"}
          </Button>
        </fieldset>
        {busy && (
          <p role="status">
            Saving… {percent === null ? "" : `${percent}%`} Keep this page open.
          </p>
        )}
      </form>
      {uncertain && (
        <div className="space-y-3">
          <p>
            Refresh and check the saved gallery before uploading this file
            again.
          </p>
          {uploadId && (
            <Button
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await checkCollectionUpload(uploadId);
                  setUncertain(false);
                  setUploadId(null);
                  setFile(null);
                  if (picker.current) picker.current.value = "";
                  refresh();
                })
              }
            >
              Check screenshot upload
            </Button>
          )}
        </div>
      )}
      {editing && (
        <form
          className="max-w-3xl space-y-4 rounded-xl bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void task(() =>
              mutate({
                operation: "update",
                releaseId: release.id,
                id: editing.photo.id,
                expectedRevision: editing.revision,
                caption,
                altText: alt,
              }).then(() => undefined),
            );
          }}
        >
          <h2 className="font-heading text-xl">Edit screenshot caption</h2>
          <fieldset disabled={busy} className="space-y-4">
            <label className="block space-y-2">
              Caption
              <Textarea
                aria-label="Edit caption"
                maxLength={1000}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
            <label className="block space-y-2">
              Image description
              <Textarea
                aria-label="Edit image description"
                maxLength={1000}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
            <Button type="submit">Save screenshot details</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Cancel edit
            </Button>
          </fieldset>
        </form>
      )}
      <ScreenshotGallery
        gallery={gallery}
        previous={
          gallery.page > 1 ? `${base}&page=${gallery.page - 1}` : undefined
        }
        next={gallery.hasNext ? `${base}&page=${gallery.page + 1}` : undefined}
      />
      {!release.archived && (
        <ul className="space-y-4" aria-label="Screenshot controls">
          {gallery.items.map((photo, i) => (
            <li
              key={photo.id}
              className="flex min-w-0 flex-wrap items-center gap-3"
            >
              <p className="w-full text-sm [overflow-wrap:anywhere]">
                Screenshot {(gallery.page - 1) * 16 + i + 1}:{" "}
                {photo.caption ?? "No caption"}
              </p>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => {
                  setEditing({ photo, revision: release.revision });
                  setCaption(photo.caption ?? "");
                  setAlt(photo.altText ?? "");
                }}
              >
                Edit screenshot {(gallery.page - 1) * 16 + i + 1}
              </Button>
              {(["up", "down"] as const).map((direction) => (
                <Button
                  key={direction}
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    void task(() =>
                      mutate({
                        operation: "move",
                        releaseId: release.id,
                        id: photo.id,
                        expectedRevision: release.revision,
                        direction,
                      }).then(() => undefined),
                    )
                  }
                >
                  Move screenshot {(gallery.page - 1) * 16 + i + 1} {direction}
                </Button>
              ))}
              <CopyConfirm
                label={`Remove screenshot ${(gallery.page - 1) * 16 + i + 1}`}
                title="Remove this screenshot?"
                description="Remove this release's screenshot link? Stored files, source metadata and other catalog uses remain."
                input={{
                  operation: "delete",
                  releaseId: release.id,
                  id: photo.id,
                  expectedRevision: release.revision,
                }}
                submit={async (input) => {
                  const result = await changeScreenshot(input);
                  return result;
                }}
                done={() => refresh()}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
