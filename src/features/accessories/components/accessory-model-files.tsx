"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CopyConfirm } from "@/features/collection/components/copy-confirm";
import {
  uploadCollectionFile,
  checkCollectionUpload,
  validateCollectionFile,
  PhotoUploadError,
} from "@/features/media/upload";
import { submitAccessoryChange } from "../copy-client";
import type { AccessoryModel, Choices } from "../copy-contracts";
export function AccessoryModelFiles({
  id,
  revision,
  canManage,
  models,
}: {
  id: string;
  revision: number;
  canManage: boolean;
  models: Choices<AccessoryModel> & { selected: AccessoryModel | null };
}) {
  const router = useRouter(),
    pending = useRef(false),
    alert = useRef<HTMLParagraphElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [uploadId, setUploadId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  async function task(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't confirm the result. Refresh saved files before trying again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
      setPercent(null);
    }
  }
  const change = (operation: "model" | "removeModel", useId: string | null) =>
    task(async () => {
      const result = await submitAccessoryChange({
        operation,
        id,
        expectedRevision: revision,
        useId,
      });
      if (result.status === "error") setError(result.message);
      else router.refresh();
    });
  const entries =
    models.selected && !models.items.some((m) => m.id === models.selected!.id)
      ? [models.selected, ...models.items]
      : models.items;
  return (
    <section
      aria-labelledby="accessory-model-heading"
      className="min-w-0 space-y-5 rounded-2xl border border-border p-5 [overflow-wrap:anywhere]"
    >
      <h2 id="accessory-model-heading" className="font-display text-xl">
        Custom 3D models
      </h2>
      <p className="text-sm text-muted-foreground">
        Private files for this copy. Uploading leaves the shared catalog
        unchanged. Select a saved model to use it for this copy.
      </p>
      <p className="text-sm">
        Selected model:{" "}
        {models.selected?.name ?? "Catalog default, when available"}
      </p>
      {canManage && (
        <>
          <fieldset disabled={busy || uncertain} className="min-w-0 space-y-3">
            <label className="block space-y-2">
              <span>Upload custom 3D model</span>
              <input
                ref={input}
                aria-label="Upload custom 3D model"
                className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11"
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError("");
                }}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Self-contained GLB, up to 50 MB.
            </p>
            <Button
              type="button"
              disabled={!file}
              onClick={() => {
                if (!file) return;
                const invalid = validateCollectionFile(file, "CUSTOM_MODEL");
                if (invalid) {
                  setError(invalid);
                  return;
                }
                void task(async () => {
                  setUncertain(true);
                  try {
                    await uploadCollectionFile(
                      file,
                      id,
                      "CUSTOM_MODEL",
                      setPercent,
                    );
                    setUncertain(false);
                    setFile(null);
                    if (input.current) input.current.value = "";
                    setMessage(
                      "Model saved privately. Select it below to use it for this copy.",
                    );
                    router.refresh();
                  } catch (e) {
                    setUploadId(
                      e instanceof PhotoUploadError
                        ? (e.uploadId ?? null)
                        : null,
                    );
                    throw e;
                  }
                });
              }}
            >
              Upload model
            </Button>
          </fieldset>
          {percent !== null && (
            <p role="status">
              {percent === 100 ? "Processing model…" : `Uploading ${percent}%`}
            </p>
          )}
          {uncertain && (
            <div className="space-y-3">
              <p className="text-sm">
                Check the upload or refresh saved files before choosing this
                file again.
              </p>
              {uploadId && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    task(async () => {
                      await checkCollectionUpload(uploadId);
                      setUploadId(null);
                      setUncertain(false);
                      setFile(null);
                      if (input.current) input.current.value = "";
                      setMessage("Model saved privately.");
                      router.refresh();
                    })
                  }
                >
                  Check model upload
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setFile(null);
                setUploadId(null);
                setUncertain(false);
                setError("");
                if (input.current) input.current.value = "";
                router.refresh();
              }}
            >
              Refresh saved files
            </Button>
            {models.selected && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => change("model", null)}
              >
                Use catalog model
              </Button>
            )}
          </div>
        </>
      )}
      {entries.length ? (
        <ul className="space-y-4">
          {entries.map((m) => (
            <li
              key={m.id}
              className="min-w-0 space-y-3 rounded-xl bg-muted p-4"
            >
              <p>
                {m.name}
                {m.primary ? " · Selected" : ""}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline">
                  <a href={m.url} download>
                    Download model
                  </a>
                </Button>
                {canManage && (
                  <>
                    <Button
                      variant="outline"
                      disabled={busy || m.primary}
                      onClick={() => change("model", m.id)}
                    >
                      Use for copy
                    </Button>
                    <CopyConfirm
                      label="Remove model"
                      title="Remove this custom model?"
                      description={`Remove ${m.name} from this copy? The stored file remains available. Removing the selected model restores catalog fallback.`}
                      input={{
                        operation: "removeModel",
                        id,
                        expectedRevision: revision,
                        useId: m.id,
                      }}
                      submit={submitAccessoryChange}
                      done={() => router.refresh()}
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No custom models on this page.
        </p>
      )}
      <nav aria-label="Custom model pages" className="flex flex-wrap gap-3">
        {models.page > 1 && (
          <Button asChild variant="outline">
            <Link
              href={`/app/accessories/${id}?modelPage=${models.page - 1}#accessory-model-heading`}
            >
              Previous models
            </Link>
          </Button>
        )}
        {models.hasMore && (
          <Button asChild variant="outline">
            <Link
              href={`/app/accessories/${id}?modelPage=${models.page + 1}#accessory-model-heading`}
            >
              More models
            </Link>
          </Button>
        )}
      </nav>
      {error && (
        <p
          ref={alert}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </section>
  );
}
