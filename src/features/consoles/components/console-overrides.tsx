"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  uploadCollectionFile,
  checkCollectionUpload,
  validateCollectionFile,
  PhotoUploadError,
} from "@/features/media/upload";
import { photoMimeTypes } from "@/features/media/contracts";
import { submitConsoleChange } from "../client";
import type { ConsoleDetail, ConsoleOverrideEntry } from "../contracts";
import { ConsoleConfirm } from "./console-confirm";
import { ConsoleImage } from "./console-image";
export function ConsoleOverrides({
  detail,
  canManage,
}: {
  detail: Pick<
    ConsoleDetail,
    | "id"
    | "revision"
    | "overrides"
    | "primaryOverrides"
    | "overridePage"
    | "moreOverrides"
  >;
  canManage: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState<ConsoleOverrideEntry["type"]>("CUSTOM_LOGO");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadId, setUploadId] = useState<string>();
  const [uncertain, setUncertain] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();
  const pending = useRef(false);
  function task(run: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        await run();
      } finally {
        pending.current = false;
      }
    });
  }
  async function change(
    type: ConsoleOverrideEntry["type"],
    useId: string | null,
  ) {
    task(async () => {
      const result = await submitConsoleChange({
        operation: "override",
        id: detail.id,
        expectedRevision: detail.revision,
        type,
        useId,
      });
      if (result.status === "error") setError(result.message);
      else {
        setMessage("Override selection saved.");
        router.refresh();
      }
    });
  }
  async function upload(recover = false) {
    task(async () => {
      try {
        if (recover && uploadId) await checkCollectionUpload(uploadId);
        else if (file)
          await uploadCollectionFile(file, detail.id, type, setPercent);
        else return;
        setFile(null);
        setUncertain(false);
        setUploadId(undefined);
        setPercent(null);
        setMessage(
          "File saved privately. Choose Use for this copy below to select it.",
        );
        router.refresh();
      } catch (e) {
        setUncertain(true);
        setUploadId(e instanceof PhotoUploadError ? e.uploadId : undefined);
        setError(
          e instanceof Error
            ? e.message
            : "We couldn't confirm this upload. Refresh to check saved files.",
        );
      }
    });
  }
  const current = new Map(detail.primaryOverrides.map((u) => [u.type, u]));
  const uses = [
    ...detail.primaryOverrides.filter(
      (u) => !detail.overrides.some((v) => u.id === v.id),
    ),
    ...detail.overrides,
  ];
  return (
    <section
      className="space-y-5 rounded-xl bg-card p-4 sm:p-6"
      aria-labelledby="console-overrides-title"
    >
      <h2 id="console-overrides-title" className="font-heading text-xl">
        Copy artwork and 3D file
      </h2>
      <p className="text-sm text-muted-foreground">
        Custom files belong to this copy. Clearing a selection restores the
        catalog fallback. Removing a link keeps its stored file.
      </p>
      {canManage && (
        <>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={busy || !current.has("CUSTOM_LOGO")}
              onClick={() => void change("CUSTOM_LOGO", null)}
            >
              Use catalog logo
            </Button>
            <Button
              variant="outline"
              disabled={busy || !current.has("CUSTOM_MODEL")}
              onClick={() => void change("CUSTOM_MODEL", null)}
            >
              Use catalog 3D file
            </Button>
          </div>
          <fieldset disabled={busy || uncertain} className="min-w-0 space-y-4">
            <FormField id="override-type" label="File purpose">
              <select
                id="override-type"
                value={type}
                className="min-h-12 w-full rounded-lg border border-input bg-background px-3"
                onChange={(e) => {
                  setType(e.target.value as typeof type);
                  setFile(null);
                  setError("");
                }}
              >
                <option value="CUSTOM_LOGO">Custom logo</option>
                <option value="CUSTOM_MODEL">Custom 3D model</option>
              </select>
            </FormField>
            <FormField
              id="override-file"
              label="Choose override file"
              hint="JPEG, PNG, WebP or AVIF up to 25 MB; self-contained GLB up to 50 MB. Uploading does not select the file automatically."
            >
              <input
                key={type}
                id="override-file"
                type="file"
                accept={
                  type === "CUSTOM_MODEL"
                    ? ".glb,model/gltf-binary"
                    : photoMimeTypes.join(",")
                }
                aria-describedby="override-file-hint"
                className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-secondary-foreground"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  e.target.value = "";
                  if (!selected) return;
                  const invalid = validateCollectionFile(selected, type);
                  setError(invalid ?? "");
                  setFile(invalid ? null : selected);
                }}
              />
            </FormField>
            {file && (
              <p className="break-words text-sm">Selected: {file.name}</p>
            )}
            <Button disabled={!file || busy} onClick={() => void upload()}>
              {busy ? "Uploading…" : "Upload file"}
            </Button>
          </fieldset>
          {busy && (
            <progress
              className="h-2 w-full accent-primary"
              aria-label="Upload progress"
              max={100}
              value={percent ?? undefined}
            />
          )}
          {uploadId && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void upload(true)}
            >
              Check upload
            </Button>
          )}
          {uncertain && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                router.refresh();
                setFile(null);
                setUncertain(false);
                setUploadId(undefined);
                setError("");
              }}
            >
              Refresh saved files
            </Button>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
      {!uses.length && (
        <p className="text-sm text-muted-foreground">
          No custom files saved for this copy.
        </p>
      )}
      <ul
        className="grid min-w-0 gap-4 sm:grid-cols-2"
        aria-label="Copy overrides"
      >
        {uses.map((use) => (
          <li
            key={use.id}
            className="min-w-0 space-y-3 rounded-xl bg-muted p-4 [overflow-wrap:anywhere]"
          >
            {use.type === "CUSTOM_LOGO" && (
              <ConsoleImage
                url={use.url}
                alt={use.name}
                width={use.width}
                height={use.height}
              />
            )}
            <p className="font-medium">{use.name}</p>
            <p className="text-sm">
              {use.type === "CUSTOM_LOGO" ? "Custom logo" : "Custom 3D model"}
              {use.primary ? " · In use" : " · Not selected"}
            </p>
            <a
              className="inline-flex min-h-11 items-center underline underline-offset-4"
              href={use.url}
              download
            >
              Download {use.name}
            </a>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={busy || use.primary}
                  onClick={() => void change(use.type, use.id)}
                >
                  Use for this copy
                </Button>
                <ConsoleConfirm
                  label={`Remove ${use.name}`}
                  title="Remove this override link?"
                  description="This removes the file's link to this copy. If selected, the catalog fallback will be used. The stored file and other uses remain available."
                  input={{
                    operation: "removeOverride",
                    id: detail.id,
                    expectedRevision: detail.revision,
                    useId: use.id,
                  }}
                  done={() => {
                    setMessage("Override link removed.");
                    router.refresh();
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {(detail.overridePage > 1 || detail.moreOverrides) && (
        <nav aria-label="Override pages" className="flex flex-wrap gap-3">
          {detail.overridePage > 1 && (
            <Button asChild variant="outline">
              <Link href={`?overridePage=${detail.overridePage - 1}`}>
                Previous overrides
              </Link>
            </Button>
          )}
          <span className="self-center text-sm">
            Page {detail.overridePage}
          </span>
          {detail.moreOverrides && detail.overridePage < 1000 && (
            <Button asChild variant="outline">
              <Link href={`?overridePage=${detail.overridePage + 1}`}>
                More overrides
              </Link>
            </Button>
          )}
        </nav>
      )}
    </section>
  );
}
