"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magic/magic-card";
import { BlurFade } from "@/components/magic/blur-fade";
import { severityLabels } from "@/features/defects/contracts";
import {
  checkCollectionUpload,
  PhotoUploadError,
  uploadCollectionFile,
  validateCollectionFile,
  type CollectionUploadType,
  type CollectionUploadResult,
} from "@/features/media/upload";
import {
  lookupConsoleModels,
  lookupConsolePlatforms,
  saveConsole,
  selectConsoleOverride,
} from "../actions";
import {
  consoleSteps,
  type ConsoleChoices,
  type ConsoleLocation,
  type ConsoleModelOption,
  type ConsolePlatformOption,
} from "../contracts";
import { consolePhysical, emptyConsolePhysical } from "../validation";
import { ConsolePicker } from "./console-picker";
import { PhysicalDetails } from "./physical-details";
import {
  ConsoleFileList,
  ConsoleFilePicker,
  type ConsoleFile,
} from "./console-files";

function IdentityPreview({
  platform,
  model,
}: {
  platform: ConsolePlatformOption;
  model: ConsoleModelOption;
}) {
  const image = model.imageUrl ?? model.logoUrl ?? platform.logoUrl;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <MagicCard>
      <div className="grid min-w-0 gap-5 p-5 sm:grid-cols-[10rem_1fr]">
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-stone">
          {image && image !== failed ? (
            <Image
              unoptimized
              src={image}
              alt={model.name}
              width={240}
              height={180}
              className="h-full w-full object-contain p-3"
              onError={() => setFailed(image)}
            />
          ) : (
            <div className="space-y-2 p-4 text-center text-muted-foreground">
              <Gamepad2 aria-hidden="true" className="mx-auto size-8" />
              <p className="text-sm">No preview available</p>
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
          <p className="text-sm text-muted-foreground">{platform.name}</p>
          <h3 className="font-heading text-xl">{model.name}</h3>
          <p className="text-sm">
            {model.modelNumber ?? "Model number unknown"} ·{" "}
            {model.releaseYear ?? "Year unknown"}
          </p>
          <p className="text-sm text-muted-foreground">
            Platform brand: {platform.manufacturer ?? "Unknown"}
            <br />
            Hardware manufacturer: {model.manufacturer ?? "Unknown"}
          </p>
          <p className="text-sm">
            Commercial markets:{" "}
            {model.markets.length ? model.markets.join(", ") : "Unknown"}
          </p>
          <p className="text-sm text-muted-foreground">
            Region lock:{" "}
            {model.regionLock === "RESTRICTED"
              ? "Restricted"
              : model.regionLock === "UNRESTRICTED"
                ? "Unrestricted"
                : model.regionLock === "NOT_APPLICABLE"
                  ? "Not applicable"
                  : "Unknown"}
          </p>
          {model.identificationStatus === "INCOMPLETE" && (
            <Badge variant="outline">Identity incomplete</Badge>
          )}
          {model.description && (
            <p className="text-sm text-muted-foreground">{model.description}</p>
          )}
        </div>
      </div>
    </MagicCard>
  );
}
export function ConsoleWizard({
  platforms,
  locations,
}: {
  platforms: ConsoleChoices<ConsolePlatformOption>;
  locations: ConsoleLocation[];
}) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<ConsolePlatformOption | null>(null);
  const [model, setModel] = useState<ConsoleModelOption | null>(null);
  const [models, setModels] = useState<ConsoleChoices<ConsoleModelOption>>({
    items: [],
    hasMore: false,
    page: 0,
  });
  const [physical, setPhysical] = useState(() =>
    structuredClone(emptyConsolePhysical),
  );
  const [files, setFiles] = useState<ConsoleFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const pending = useRef(false);
  const requestId = useRef<string | null>(null);
  const submitted = useRef<unknown>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const error = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, savedId]);
  useEffect(() => {
    if (message) error.current?.focus();
  }, [message]);
  function addFiles(incoming: File[], type: CollectionUploadType) {
    if (!incoming.length) return;
    const invalid = incoming
      .map((f) => validateCollectionFile(f, type))
      .find(Boolean);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    const override = type === "CUSTOM_LOGO" || type === "CUSTOM_MODEL";
    const retained = override ? files.filter((f) => f.type !== type) : files;
    const next = [
      ...retained,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        type,
        state: "waiting" as const,
        percent: 0,
      })),
    ];
    if (
      next.length > 22 ||
      next.filter((f) => f.type !== "CUSTOM_LOGO" && f.type !== "CUSTOM_MODEL")
        .length > 20 ||
      next.reduce((n, f) => n + f.file.size, 0) > 100 * 1024 * 1024
    ) {
      setMessage(
        "Choose up to 20 photos and one file per override, with no more than 100 MB in total.",
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
  async function activate(
    id: string,
    entry: ConsoleFile,
    result: CollectionUploadResult,
  ) {
    if (entry.type !== "CUSTOM_LOGO" && entry.type !== "CUSTOM_MODEL") return;
    if (!result.useId)
      throw new PhotoUploadError(
        "Your file was uploaded, but its selection could not be confirmed. Check the upload before trying again.",
        result.uploadId,
      );
    try {
      const selected = await selectConsoleOverride({
        collectionItemId: id,
        useId: result.useId,
        type: entry.type,
      });
      if (selected.status === "error") throw new Error(selected.message);
    } catch (cause) {
      throw new PhotoUploadError(
        cause instanceof Error
          ? cause.message
          : "We couldn't confirm this override.",
        result.uploadId,
      );
    }
  }
  async function sendFiles(id: string) {
    for (const entry of files.filter((f) => f.state === "waiting")) {
      patchFile(entry.id, { state: "sending", message: undefined });
      try {
        const result = await uploadCollectionFile(
          entry.file,
          id,
          entry.type,
          (percent) =>
            patchFile(entry.id, {
              percent,
              state: percent === 100 ? "processing" : "sending",
            }),
        );
        await activate(id, entry, result);
        patchFile(entry.id, { state: "saved", percent: 100 });
      } catch (cause) {
        patchFile(entry.id, {
          state: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Check this file in Photos before trying again.",
          uploadId:
            cause instanceof PhotoUploadError ? cause.uploadId : undefined,
        });
        setMessage(
          "Your console is saved. A file needs checking; the remaining files have not been uploaded. Check the saved files before adding this file again.",
        );
        break;
      }
    }
  }
  async function save() {
    if (pending.current || !platform || !model) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      requestId.current ??= crypto.randomUUID();
      submitted.current ??= {
        ...physical,
        id: requestId.current,
        platformId: platform.id,
        platformRevision: platform.revision,
        modelId: model.id,
        modelRevision: model.revision,
      };
      const result = await saveConsole(submitted.current);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setSavedId(result.data.id);
      await sendFiles(result.data.id);
    } catch {
      setMessage(
        "We couldn't confirm this save. Keep this page open and try Save again to check the same copy.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function next() {
    if (pending.current) return;
    setMessage("");
    if (step === 0) {
      if (!platform) {
        setMessage("Choose a console before continuing.");
        return;
      }
      pending.current = true;
      setBusy(true);
      try {
        const result = await lookupConsoleModels({ platformId: platform.id });
        if (result.status === "error") {
          setMessage(result.message);
          return;
        }
        setModels(result.data);
        if (!model || model.platformId !== platform.id)
          setModel(
            !result.data.hasMore && result.data.items.length === 1
              ? result.data.items[0]
              : null,
          );
        setStep(1);
      } catch {
        setMessage("We couldn't load models. Try again.");
      } finally {
        pending.current = false;
        setBusy(false);
      }
      return;
    }
    if (step === 1 && !model) {
      setMessage("Choose a hardware model before continuing.");
      return;
    }
    if (step === 2) {
      const parsed = consolePhysical.safeParse(physical);
      if (!parsed.success) {
        setMessage(parsed.error.issues[0].message);
        return;
      }
    }
    setStep(step + 1);
  }
  async function recover(entry: ConsoleFile) {
    if (pending.current || !entry.uploadId) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await checkCollectionUpload(entry.uploadId);
      await activate(savedId!, entry, result);
      patchFile(entry.id, {
        state: "saved",
        message: undefined,
        uploadId: undefined,
        percent: 100,
      });
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "We couldn't check this upload.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {!savedId && (
        <ol
          aria-label="Add console steps"
          className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"
        >
          {consoleSteps.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? "step" : undefined}
              className={index === step ? "font-semibold text-foreground" : ""}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
      )}
      <h2
        ref={heading}
        tabIndex={-1}
        className="font-heading text-2xl focus:outline-none"
      >
        {savedId ? "Console saved privately" : consoleSteps[step]}
      </h2>
      {message && (
        <p
          ref={error}
          role="alert"
          tabIndex={-1}
          className="rounded-xl bg-muted p-4 text-sm focus:outline-none"
        >
          {message}
        </p>
      )}
      {savedId ? (
        <section className="space-y-5" aria-busy={busy}>
          <p>
            Your physical copy has been added to the collection. Copy{" "}
            {savedId.slice(0, 8)}.
          </p>
          <ConsoleFileList files={files} />
          {files
            .filter((f) => f.state === "error" && f.uploadId)
            .map((f) => (
              <Button
                key={f.id}
                disabled={busy}
                variant="outline"
                onClick={() => void recover(f)}
              >
                Check upload for {f.file.name}
              </Button>
            ))}
          {files.some((f) => f.state === "waiting") && (
            <Button
              disabled={busy}
              onClick={async () => {
                if (pending.current) return;
                pending.current = true;
                setBusy(true);
                setMessage("");
                try {
                  await sendFiles(savedId);
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              Upload remaining files
            </Button>
          )}
          {busy && <p role="status">Saving files… Keep this page open.</p>}
          {!busy && (
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/app/collection">Browse collection</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/media?itemId=${savedId}`}>Manage photos</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/app/defects?itemId=${savedId}`}>
                  Manage defects
                </Link>
              </Button>
            </div>
          )}
        </section>
      ) : (
        <>
          <fieldset
            disabled={busy}
            className="min-w-0 space-y-6"
            aria-busy={busy}
          >
            <BlurFade key={step}>
              {step === 0 && (
                <ConsolePicker
                  label="consoles"
                  choices={platforms}
                  selectedId={platform?.id}
                  search={(query, page) =>
                    lookupConsolePlatforms({ query, page })
                  }
                  choose={(value) => {
                    if (pending.current) return;
                    setPlatform(value);
                    if (value.id !== platform?.id) setModel(null);
                    submitted.current = null;
                  }}
                  detail={(p) =>
                    `${p.manufacturer ?? "Brand unknown"} · ${p.generation ? `Generation ${p.generation}` : "Generation unknown"} · ${p.releaseYear ?? "Year unknown"}`
                  }
                />
              )}
              {step === 1 && (
                <div className="space-y-5">
                  <p className="text-sm text-muted-foreground">
                    Choose the physical model of {platform?.name}. If uncertain,
                    use an explicitly incomplete catalog identity and record
                    your observations.
                  </p>
                  <ConsolePicker
                    key={platform!.id}
                    label="models"
                    choices={models}
                    selectedId={model?.id}
                    search={(query, page) =>
                      lookupConsoleModels({
                        query,
                        page,
                        platformId: platform!.id,
                      })
                    }
                    choose={(value) => {
                      if (pending.current) return;
                      setModel(value);
                      submitted.current = null;
                    }}
                    detail={(m) =>
                      `${m.modelNumber ?? "Model number unknown"} · ${m.releaseYear ?? "Year unknown"}${m.identificationStatus === "INCOMPLETE" ? " · Identity incomplete" : ""}`
                    }
                  />
                  {model && (
                    <>
                      <p role="status" className="text-sm">
                        Selected: {model.name}
                        {models.items.length === 1 && !models.hasMore
                          ? " (only active model, selected automatically)"
                          : ""}
                      </p>
                      <IdentityPreview platform={platform!} model={model} />
                    </>
                  )}
                </div>
              )}
              {step === 2 && (
                <PhysicalDetails
                  data={physical}
                  change={(value) => {
                    setPhysical(value);
                    submitted.current = null;
                  }}
                  locations={locations}
                />
              )}
              {(step === 3 || step === 4) && (
                <ConsoleFilePicker
                  overrides={step === 4}
                  files={files}
                  add={addFiles}
                  remove={(id) => setFiles(files.filter((f) => f.id !== id))}
                />
              )}
              {step === 5 && platform && model && (
                <div className="space-y-6">
                  <IdentityPreview platform={platform} model={model} />
                  <section
                    aria-label="Review physical details"
                    className="space-y-4 rounded-xl bg-card p-5"
                  >
                    <h3 className="font-heading text-xl">Your copy</h3>
                    <dl className="space-y-3 text-sm [overflow-wrap:anywhere]">
                      {[
                        [
                          "Serial number",
                          physical.serialNumber.trim() || "Not recorded",
                        ],
                        [
                          "Observed markings",
                          physical.observedMarkings.trim() || "Not recorded",
                        ],
                        [
                          "Has box",
                          physical.hasBox === "unknown"
                            ? "Unknown"
                            : physical.hasBox === "yes"
                              ? "Yes"
                              : "No",
                        ],
                        [
                          "Location",
                          locations.find((l) => l.id === physical.locationId)
                            ?.label ?? "Unassigned",
                        ],
                        ["Private notes", physical.notes.trim() || "None"],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="whitespace-pre-wrap">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <h4 className="font-medium">
                      Defects ({physical.defects.length})
                    </h4>
                    <ul className="space-y-2">
                      {physical.defects.map((d, index) => (
                        <li
                          key={index}
                          className="text-sm [overflow-wrap:anywhere]"
                        >
                          {d.title} · {severityLabels[d.severity]} · Active
                          {d.description && (
                            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                              {d.description}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section className="space-y-3">
                    <h3 className="font-heading text-xl">
                      Photos and overrides ({files.length})
                    </h3>
                    <ConsoleFileList files={files} />
                    {!files.length && (
                      <p className="text-sm text-muted-foreground">
                        No files selected. Catalog artwork will remain the
                        default.
                      </p>
                    )}
                  </section>
                  <p className="text-sm text-muted-foreground">
                    Your console will be saved privately, then files uploaded.
                    If an upload fails, your copy stays saved and you can finish
                    the uploads here. Shared catalog information stays separate
                    from your copy.
                  </p>
                </div>
              )}
            </BlurFade>
            <div className="flex flex-wrap gap-3">
              {step > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMessage("");
                    setStep(step - 1);
                  }}
                >
                  Back
                </Button>
              )}
              {step < 5 ? (
                <Button type="button" onClick={() => void next()}>
                  {busy ? "Loading…" : "Continue"}
                </Button>
              ) : (
                <Button type="button" onClick={() => void save()}>
                  {busy ? "Saving…" : "Save console"}
                </Button>
              )}
              {busy ? (
                <Button type="button" disabled variant="ghost">
                  Cancel
                </Button>
              ) : (
                <Button asChild variant="ghost">
                  <Link href="/app/collection">Cancel</Link>
                </Button>
              )}
            </div>
          </fieldset>
          {platform && step === 0 && (
            <p role="status" className="text-sm">
              Selected: {platform.name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
