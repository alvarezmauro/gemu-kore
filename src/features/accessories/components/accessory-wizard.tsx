"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConsolePicker } from "@/features/consoles/components/console-picker";
import { PhysicalDetails } from "@/features/consoles/components/physical-details";
import {
  ConsoleFilePicker,
  ConsoleFileList,
  type ConsoleFile,
} from "@/features/consoles/components/console-files";
import {
  emptyCopyPhysical,
  copyPhysical,
} from "@/features/collection/copy-validation";
import {
  uploadCollectionFile,
  checkCollectionUpload,
  validateCollectionFile,
  PhotoUploadError,
  type CollectionUploadType,
} from "@/features/media/upload";
import {
  lookupAccessories,
  lookupAccessoryVariants,
  refreshSelectedAccessory,
  saveAccessoryCopy,
} from "../copy-actions";
import type {
  AccessoryChoice,
  VariantChoice,
  Choices,
  CopyLocation,
} from "../copy-contracts";
import { AccessoryEnrichmentLinks } from "@/features/enrichment/components/accessory-enrichment-links";
import { AccessoryChoiceSummary } from "./accessory-choice-summary";
const steps = ["Accessory", "Variant", "My copy", "Review"];
export function AccessoryWizard({
  accessories,
  locations,
  canManageCatalog,
}: {
  accessories: Choices<AccessoryChoice>;
  locations: CopyLocation[];
  canManageCatalog: boolean;
}) {
  const [step, setStep] = useState(0),
    [accessory, setAccessory] = useState<AccessoryChoice | null>(null),
    [variant, setVariant] = useState<VariantChoice | null>(null);
  const [variants, setVariants] = useState<Choices<VariantChoice>>({
    items: [],
    hasMore: false,
    page: 0,
  });
  const [physical, setPhysical] = useState(() =>
    structuredClone(emptyCopyPhysical),
  );
  const [files, setFiles] = useState<ConsoleFile[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [savedId, setSavedId] = useState<string | null>(null);
  const pending = useRef(false),
    requestId = useRef<string | null>(null),
    submitted = useRef<unknown>(null),
    heading = useRef<HTMLHeadingElement>(null),
    alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, savedId]);
  useEffect(() => {
    if (message && !busy) alert.current?.focus();
  }, [message, busy]);
  async function task(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch {
      setMessage(
        "We couldn't confirm the result. Keep this page open and try again to check the same copy.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function addFiles(incoming: File[], type: CollectionUploadType) {
    if (type === "CUSTOM_LOGO") return;
    const invalid = incoming
      .map((file) => validateCollectionFile(file, type))
      .find(Boolean);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    const next = [
      ...files,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        type,
        state: "waiting" as const,
        percent: 0,
      })),
    ];
    if (
      next.length > 20 ||
      next.reduce((sum, f) => sum + f.file.size, 0) > 100 * 1024 * 1024 ||
      next.filter((f) => f.type === "CUSTOM_MODEL").length > 1
    ) {
      setMessage(
        "Choose up to 20 files and one custom model, with no more than 100 MB in total.",
      );
      return;
    }
    setFiles(next);
    setMessage("");
  }
  const patchFile = (id: string, patch: Partial<ConsoleFile>) =>
    setFiles((current) =>
      current.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
  async function sendFiles(id: string) {
    for (const entry of files.filter((f) => f.state === "waiting")) {
      patchFile(entry.id, { state: "sending", message: undefined });
      try {
        await uploadCollectionFile(entry.file, id, entry.type, (percent) =>
          patchFile(entry.id, {
            percent,
            state: percent === 100 ? "processing" : "sending",
          }),
        );
        patchFile(entry.id, { state: "saved", percent: 100 });
      } catch (e) {
        patchFile(entry.id, {
          state: "error",
          message:
            e instanceof Error
              ? e.message
              : "Check saved files before adding this file again.",
          uploadId: e instanceof PhotoUploadError ? e.uploadId : undefined,
        });
        setMessage(
          "Your accessory is saved. A file needs checking; the remaining files have not been uploaded. Check saved files before adding this file again.",
        );
        break;
      }
    }
  }
  async function next() {
    if (step === 0 && accessory)
      await task(async () => {
        const result = await lookupAccessoryVariants({
          accessoryId: accessory.id,
        });
        if (result.status === "error") {
          setMessage(result.message);
          return;
        }
        setVariants(result.data);
        setStep(1);
      });
    else if (step === 1 && variant) {
      setStep(2);
      setMessage("");
    } else if (step === 2) {
      const valid = copyPhysical.safeParse(physical);
      if (!valid.success)
        setMessage(valid.error.issues[0]?.message ?? "Check these details.");
      else {
        setStep(3);
        setMessage("");
      }
    }
  }
  async function save() {
    if (!accessory || !variant) return;
    await task(async () => {
      requestId.current ??= crypto.randomUUID();
      submitted.current ??= {
        ...physical,
        id: requestId.current,
        accessoryId: accessory.id,
        accessoryRevision: accessory.revision,
        variantId: variant.id,
        variantRevision: variant.revision,
      };
      const result = await saveAccessoryCopy(submitted.current);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setSavedId(result.data.id);
      await sendFiles(result.data.id);
    });
  }
  const error = message && (
    <p
      ref={alert}
      role="alert"
      tabIndex={-1}
      className="text-sm text-destructive"
    >
      {message}
    </p>
  );
  if (savedId)
    return (
      <section className="min-w-0 space-y-6" aria-label="Saved accessory">
        <h2 ref={heading} tabIndex={-1} className="font-display text-2xl">
          Accessory saved
        </h2>
        <p>
          Your physical copy is private. Saved files stay attached if another
          upload fails. Choose an uploaded model on the copy page to use it for
          this copy.
        </p>
        <ConsoleFileList files={files} />
        {error}
        <div className="flex flex-wrap gap-3">
          {files
            .filter((f) => f.state === "error" && f.uploadId)
            .map((entry) => (
              <Button
                key={entry.id}
                className="h-auto min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere]"
                disabled={busy}
                variant="outline"
                onClick={() =>
                  task(async () => {
                    try {
                      await checkCollectionUpload(entry.uploadId!);
                      patchFile(entry.id, {
                        state: "saved",
                        message: undefined,
                        uploadId: undefined,
                        percent: 100,
                      });
                    } catch (e) {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "We couldn't check this upload.",
                      );
                    }
                  })
                }
              >
                Check upload: {entry.file.name}
              </Button>
            ))}
          {files.some((f) => f.state === "waiting") && (
            <Button
              disabled={busy}
              onClick={() => task(() => sendFiles(savedId))}
            >
              Upload remaining files
            </Button>
          )}
          <Button asChild>
            <Link href={`/app/accessories/${savedId}`}>View accessory</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/app/media?itemId=${savedId}`}>
              Check saved photos
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/collection">Browse collection</Link>
          </Button>
        </div>
      </section>
    );
  return (
    <section className="min-w-0 space-y-6" aria-label="Add accessory">
      <ol aria-label="Creation steps" className="flex flex-wrap gap-3 text-sm">
        {steps.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={i === step ? "font-semibold" : "text-muted-foreground"}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      <h2 ref={heading} tabIndex={-1} className="font-display text-2xl">
        {steps[step]}
      </h2>
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        {step === 0 && (
          <>
            <ConsolePicker
              label="accessories"
              choices={accessories}
              selectedId={accessory?.id}
              search={(query, page) => lookupAccessories({ query, page })}
              detail={(a) => `${a.slug} · ${a.producer ?? "Producer unknown"}`}
              choose={(a) => {
                setAccessory(a);
                setVariant(null);
                submitted.current = null;
              }}
            />
            <p className="text-sm text-muted-foreground">
              Choose a shared accessory family, then identify your version.{" "}
              {canManageCatalog ? (
                <Link
                  className="underline"
                  href="/app/catalog/accessories"
                  target="_blank"
                  rel="noopener"
                >
                  Manage accessory catalog (new tab)
                </Link>
              ) : (
                "Ask an administrator if a family or variant is missing."
              )}
            </p>
          </>
        )}
        {step === 1 && accessory && (
          <>
            <p>{accessory.name}</p>
            <ConsolePicker
              key={accessory.id}
              label="variants"
              choices={variants}
              selectedId={variant?.id}
              search={(query, page) =>
                lookupAccessoryVariants({
                  accessoryId: accessory.id,
                  query,
                  page,
                })
              }
              optionName={(v) => `${v.name} (${v.slug})`}
              detail={(v) =>
                `${[v.modelNumber, v.color, v.edition].filter(Boolean).join(" · ") || v.slug} · ${v.markets.map((m) => m.name).join(", ") || "Markets unknown"}`
              }
              choose={(v) => {
                setVariant(v);
                submitted.current = null;
              }}
            />
            {variant && (
              <AccessoryChoiceSummary accessory={accessory} variant={variant} />
            )}
          </>
        )}
        {step === 2 && (
          <>
            <PhysicalDetails
              identity="variant"
              data={physical}
              change={(value) => {
                setPhysical(value);
                submitted.current = null;
              }}
              locations={locations}
            />
            <section aria-label="Personal files" className="space-y-5">
              <h3 className="font-medium">Photos and custom model</h3>
              <ConsoleFilePicker
                overrides={false}
                files={files}
                add={addFiles}
                remove={(id) =>
                  setFiles((current) => current.filter((f) => f.id !== id))
                }
              />
              <label className="block space-y-2">
                <span>Custom 3D model</span>
                <input
                  aria-label="Custom 3D model"
                  type="file"
                  accept=".glb,model/gltf-binary"
                  className="block w-full min-w-0 text-sm file:mr-3 file:min-h-11"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []), "CUSTOM_MODEL");
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-sm text-muted-foreground">
                Optional self-contained GLB, up to 50 MB. Files upload privately
                after saving your copy.
              </p>
            </section>
          </>
        )}
        {step === 3 && accessory && variant && (
          <>
            <AccessoryChoiceSummary accessory={accessory} variant={variant} />
            <dl className="grid gap-4 [overflow-wrap:anywhere] sm:grid-cols-2">
              {[
                ["Serial number", physical.serialNumber || "Not recorded"],
                [
                  "Has box",
                  physical.hasBox === "yes"
                    ? "Yes"
                    : physical.hasBox === "no"
                      ? "No"
                      : "Unknown",
                ],
                [
                  "Location",
                  locations.find((l) => l.id === physical.locationId)?.label ??
                    "Unassigned",
                ],
                ["Observed markings", physical.observedMarkings || "None"],
                ["Private notes", physical.notes || "None"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
            <p>{physical.defects.length} initial defects</p>
            <ul className="list-inside list-disc">
              {physical.defects.map((d, i) => (
                <li key={i}>
                  {d.title} · {d.severity.toLowerCase()}
                  {d.description ? ` — ${d.description}` : ""}
                </li>
              ))}
            </ul>
            <ConsoleFileList files={files} />
            <p className="text-sm text-muted-foreground">
              Save creates one private physical copy. Has box records only
              whether its box is present.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                task(async () => {
                  const result = await refreshSelectedAccessory({
                    accessoryId: accessory.id,
                    variantId: variant.id,
                  });
                  if (result.status === "error") setMessage(result.message);
                  else {
                    setAccessory(result.data.accessory);
                    setVariant(result.data.variant);
                    submitted.current = null;
                    setStep(2);
                  }
                })
              }
            >
              Refresh catalog choices
            </Button>
          </>
        )}
      </fieldset>
      {accessory &&
        variant &&
        step >= 2 &&
        !accessory.archived &&
        !variant.archived && (
          <AccessoryEnrichmentLinks
            accessoryId={accessory.id}
            variantId={variant.id}
          />
        )}
      {error}
      <div className="flex flex-wrap gap-3">
        {step > 0 && (
          <Button
            type="button"
            disabled={busy}
            variant="outline"
            onClick={() => {
              setStep(step - 1);
              setMessage("");
            }}
          >
            Back
          </Button>
        )}
        {step < 3 ? (
          <Button
            type="button"
            disabled={
              busy || (step === 0 && !accessory) || (step === 1 && !variant)
            }
            onClick={next}
          >
            {busy ? "Loading…" : "Continue"}
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save accessory"}
          </Button>
        )}
      </div>
    </section>
  );
}
