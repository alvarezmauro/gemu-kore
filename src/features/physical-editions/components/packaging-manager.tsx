"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetSource } from "@/features/provenance/components/asset-source";
import { emptyScreenshotUpload } from "@/features/games/screenshot-validation";
import {
  PhotoUploadError,
  checkCollectionUpload,
} from "@/features/media/upload";
import {
  boxFamily,
  boxFormatLabels,
  fullArtwork,
} from "@/lib/three/packaging-contracts";
import { createTemplate, changeTemplate, savePackaging } from "../actions";
import { uploadArtwork } from "../upload";
import type { PackagingManager as Manager, BoxTemplate } from "../contracts";
const selectClass =
  "block min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3";
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
function useMutation(onSaved?: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  function run(work: () => ReturnType<typeof savePackaging>) {
    start(async () => {
      try {
        const result = await work();
        setMessage(result.status === "success" ? "Saved." : result.message);
        if (result.status === "success") {
          onSaved?.();
          router.refresh();
        }
      } catch {
        setMessage(
          "We couldn't confirm this action. Refresh to check saved changes before trying again.",
        );
      }
    });
  }
  return { pending, message, run };
}
function NewTemplate() {
  const mutation = useMutation(),
    id = useRef<string | null>(null);
  return (
    <details className="rounded-xl border p-4">
      <summary className="min-h-11 cursor-pointer py-3">
        Create packaging template
      </summary>
      <p className="my-3 text-sm">
        Enter measured dimensions and their source. A ready revision is
        immutable; create a new revision for corrections. Synthetic dimensions
        must be labeled.
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          id.current ??= crypto.randomUUID();
          mutation.run(async () => {
            const result = await createTemplate({
              id: id.current,
              name: text(form, "name"),
              slug: text(form, "slug"),
              familyKey: text(form, "family"),
              revisionNumber: Number(form.get("revision")),
              dimensions: {
                schemaVersion: 1,
                widthMm: Number(form.get("width")),
                heightMm: Number(form.get("height")),
                depthMm: Number(form.get("depth")),
              },
              synthetic: form.get("synthetic") === "on",
              measurementNote: text(form, "source"),
            });
            if (result.status === "success") id.current = null;
            return result;
          });
        }}
      >
        <fieldset disabled={mutation.pending} className="space-y-4">
          <label className="block">
            Packaging format
            <select
              aria-label="Packaging format"
              name="family"
              className={selectClass}
              defaultValue="snes-cardboard"
            >
              {boxFamily.options.map((key) => (
                <option key={key} value={key}>
                  {boxFormatLabels[key]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            These are closed cardboard boxes. Record the measured market/edition
            variant in the template name and source; no universal retail
            dimensions are supplied.
          </p>
          <label className="block">
            Template name
            <Input name="name" required maxLength={200} />
          </label>
          <label className="block">
            Unique slug
            <Input
              name="slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              maxLength={100}
            />
          </label>
          <label className="block">
            Family revision
            <Input
              name="revision"
              type="number"
              min={1}
              step={1}
              defaultValue={1}
              required
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {["width", "height", "depth"].map((name) => (
              <label key={name} className="capitalize">
                {name} (mm)
                <Input
                  name={name}
                  type="number"
                  min={0.1}
                  max={2000}
                  step="any"
                  required
                />
              </label>
            ))}
          </div>
          <label className="block">
            Measurement source or synthetic fixture note
            <Input name="source" required maxLength={1000} />
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input name="synthetic" type="checkbox" />
            Synthetic demonstration dimensions
          </label>
          <Button type="submit">Create draft template</Button>
        </fieldset>
        <p role="status">{mutation.message}</p>
      </form>
    </details>
  );
}
function TemplateRow({ template: t }: { template: BoxTemplate }) {
  const mutation = useMutation();
  return (
    <li className="space-y-3 rounded-xl border p-4">
      <p>
        {t.name} · {boxFormatLabels[t.familyKey]} · Revision {t.revisionNumber}{" "}
        · {t.status}
        {t.archived ? " · Archived" : ""}
      </p>
      <p className="text-sm">
        {t.dimensions.widthMm} × {t.dimensions.heightMm} ×{" "}
        {t.dimensions.depthMm} mm
        {t.synthetic ? " · Synthetic demonstration" : ""}
      </p>
      <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
        {t.measurementNote}
      </p>
      <div className="flex flex-wrap gap-3">
        {t.status === "DRAFT" && !t.archived && (
          <Button
            disabled={mutation.pending}
            onClick={() =>
              mutation.run(() =>
                changeTemplate({
                  id: t.id,
                  expectedRevision: t.revision,
                  operation: "ready",
                }),
              )
            }
          >
            Mark ready
          </Button>
        )}
        <Button
          variant="outline"
          disabled={mutation.pending}
          onClick={() =>
            mutation.run(() =>
              changeTemplate({
                id: t.id,
                expectedRevision: t.revision,
                operation: t.archived ? "restore" : "archive",
              }),
            )
          }
        >
          {t.archived ? "Restore template" : "Archive template"}
        </Button>
      </div>
      <p role="status">{mutation.message}</p>
    </li>
  );
}
function ComponentEditor({
  data,
  component: c,
  onSaved,
}: {
  data: Manager;
  component: Manager["components"][number];
  onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState(c.templateId ?? ""),
    mutation = useMutation(onSaved);
  const template = data.templates.find((t) => t.id === templateId);
  return (
    <form
      className="min-w-0 space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        mutation.run(() =>
          savePackaging({
            releaseId: data.release.id,
            componentId: c.id,
            expectedRevision: data.release.revision,
            templateId: template?.id ?? null,
            expectedTemplateRevision: template?.revision ?? null,
            bindings:
              template?.slots.flatMap((slot) => {
                const assetId = text(form, `${slot.id}-asset`);
                return assetId
                  ? [
                      {
                        slotId: slot.id,
                        assetId,
                        transform: {
                          schemaVersion: 1,
                          crop: Object.fromEntries(
                            ["x", "y", "width", "height"].map((k) => [
                              k,
                              Number(form.get(`${slot.id}-${k}`)),
                            ]),
                          ),
                          quarterTurns: Number(form.get(`${slot.id}-turns`)),
                        },
                      },
                    ]
                  : [];
              }) ?? [],
          }),
        );
      }}
    >
      <h3 className="font-heading text-xl">{c.name}</h3>
      <fieldset
        disabled={mutation.pending || data.release.archived}
        className="min-w-0 space-y-4"
      >
        <label className="block">
          Box template
          <select
            className={selectClass}
            aria-label="Box template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">No template (detach artwork)</option>
            {data.templates
              .filter(
                (t) =>
                  (t.status === "READY" && !t.archived) ||
                  t.id === c.templateId,
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {boxFormatLabels[t.familyKey]} · r
                  {t.revisionNumber}
                  {t.archived ? " · Archived" : ""}
                </option>
              ))}
          </select>
        </label>
        <p className="text-sm text-muted-foreground">
          Changing the template starts an empty artwork assignment. Saving
          without a template explicitly detaches its artwork. Missing faces
          remain neutral; front, back and spine are required for complete
          artwork.
        </p>
        <div key={templateId} className="grid min-w-0 gap-4 md:grid-cols-2">
          {template?.slots.map((slot) => {
            const binding =
                templateId === c.templateId
                  ? c.bindings.find((b) => b.slotId === slot.id)
                  : undefined,
              transform = binding?.transform ?? fullArtwork;
            return (
              <fieldset
                key={slot.id}
                className="min-w-0 space-y-3 rounded-lg bg-muted p-3"
              >
                <legend className="px-1">
                  {slot.name.replaceAll("_", " ")}
                  {slot.required ? " · Required" : " · Optional"}
                </legend>
                <label className="block">
                  Artwork
                  <select
                    aria-label="Artwork"
                    name={`${slot.id}-asset`}
                    defaultValue={binding?.assetId ?? ""}
                    className={selectClass}
                  >
                    <option value="">Neutral surface</option>
                    {data.artwork.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {a.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["x", "y", "width", "height"] as const).map((k) => (
                    <label key={k} className="block">
                      Crop {k}
                      <Input
                        name={`${slot.id}-${k}`}
                        type="number"
                        step="any"
                        min={k === "x" || k === "y" ? 0 : 0.000001}
                        max={1}
                        defaultValue={transform.crop[k]}
                        required
                      />
                    </label>
                  ))}
                </div>
                <label className="block">
                  Clockwise rotation
                  <select
                    className={selectClass}
                    aria-label="Clockwise rotation"
                    name={`${slot.id}-turns`}
                    defaultValue={transform.quarterTurns}
                  >
                    {[0, 1, 2, 3].map((n) => (
                      <option value={n} key={n}>
                        {n * 90}°
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
            );
          })}
        </div>
        <p className="text-sm">
          Crop coordinates use fractions of the upright source image. Artwork is
          contained with neutral margins; it is never stretched.
        </p>
        <Button type="submit">Save {c.name} packaging</Button>
      </fieldset>
      <p role="status">{mutation.message}</p>
    </form>
  );
}
function ArtworkUpload({
  releaseId,
  disabled,
}: {
  releaseId: string;
  disabled: boolean;
}) {
  const router = useRouter(),
    [pending, start] = useTransition(),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [uncertain, setUncertain] = useState<string>();
  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const file = form.get("file");
          if (!(file instanceof File)) return;
          setMessage("");
          setUncertain(undefined);
          try {
            await uploadArtwork(
              file,
              releaseId,
              {
                ...emptyScreenshotUpload,
                ...Object.fromEntries(
                  Object.keys(emptyScreenshotUpload).map((k) => [
                    k,
                    text(form, k),
                  ]),
                ),
                sourceType: "USER_UPLOAD",
              },
              setProgress,
            );
            setMessage(
              "Artwork uploaded. Choose it in a face and save the assignment.",
            );
            router.refresh();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Upload unavailable. Refresh before retrying.",
            );
            if (error instanceof PhotoUploadError) setUncertain(error.uploadId);
          }
        });
      }}
    >
      <h3 className="font-heading text-xl">Upload release artwork</h3>
      <fieldset disabled={pending || disabled} className="space-y-4">
        <label className="block">
          Artwork file
          <Input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            required
          />
        </label>
        {(
          [
            ["caption", "Artwork label"],
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
        ).map(([name, label]) => (
          <label className="block" key={name}>
            {label}
            <Input
              name={name}
              type={name === "retrievedAt" ? "date" : "text"}
              maxLength={
                name === "caption" || name === "altText"
                  ? 1000
                  : name === "provider"
                    ? 100
                    : name === "author" || name === "licenseName"
                      ? 160
                      : name === "attribution" || name === "usageRestrictions"
                        ? 500
                        : 512
              }
            />
          </label>
        ))}
        <p className="text-sm">
          Uploads remain private. Source and license information does not grant
          publication permission. Original files are preserved; previews use
          prepared display images.
        </p>
        <Button type="submit">Upload artwork</Button>
      </fieldset>
      {pending && (
        <progress
          aria-label="Artwork upload"
          max={100}
          value={progress ?? undefined}
        />
      )}
      <p role="status">{message}</p>
      {uncertain && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                await checkCollectionUpload(uncertain);
                setUncertain(undefined);
                setMessage("Upload completed. Refreshing artwork choices.");
                router.refresh();
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Upload unavailable.",
                );
              }
            })
          }
        >
          Check pending upload
        </Button>
      )}
    </form>
  );
}
export function PackagingManager({ data }: { data: Manager }) {
  const [saved, setSaved] = useState("");
  return (
    <div className="min-w-0 max-w-4xl space-y-8">
      <p>
        Expected catalog packaging only. Owned component presence and the manual
        “has box” answer are unchanged.
      </p>
      {data.release.archived && (
        <p role="status">
          Restore the release and its parent catalog records before assigning
          packaging or uploading artwork.
        </p>
      )}
      <p role="status">{saved}</p>
      <section aria-labelledby="packaging-components" className="space-y-4">
        <h2 id="packaging-components" className="font-heading text-2xl">
          Expected packaging components
        </h2>
        {!data.components.length && (
          <p>Add a packaging item to the release’s expected contents first.</p>
        )}
        {data.components.map((c) => (
          <ComponentEditor
            key={`${c.id}-${data.release.revision}`}
            data={data}
            component={c}
            onSaved={() => setSaved(`${c.name} packaging saved.`)}
          />
        ))}
      </section>
      <section aria-labelledby="packaging-templates" className="space-y-4">
        <h2 id="packaging-templates" className="font-heading text-2xl">
          Cardboard box templates
        </h2>
        <NewTemplate />
        <ul className="space-y-4">
          {data.templates.map((t) => (
            <TemplateRow key={t.id} template={t} />
          ))}
        </ul>
        {data.moreTemplates && (
          <p>
            Showing the latest 50 templates per format and all assigned
            templates.
          </p>
        )}
      </section>
      <section aria-labelledby="packaging-artwork" className="space-y-4">
        <h2 id="packaging-artwork" className="font-heading text-2xl">
          Release artwork
        </h2>
        <ArtworkUpload
          releaseId={data.release.id}
          disabled={data.release.archived}
        />
        {data.moreArtwork && (
          <p>Showing the latest 50 images and all assigned artwork.</p>
        )}
        <ul className="grid min-w-0 gap-4 sm:grid-cols-2">
          {data.artwork.map((a) => (
            <li className="min-w-0 space-y-3 rounded-xl border p-4" key={a.id}>
              <p className="[overflow-wrap:anywhere]">
                {a.label} · {a.id.slice(0, 8)}
              </p>
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block min-h-11 py-3 underline"
              >
                Open artwork · {a.width} × {a.height}
              </a>
              <AssetSource source={a.source} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
