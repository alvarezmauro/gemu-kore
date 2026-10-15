"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { changeCatalog, changeCatalogArchive } from "../actions";
import {
  catalogFields,
  type CatalogKind,
  type CatalogRecord,
  type ReferenceInput,
} from "../contracts";
import { CatalogPicker } from "./catalog-picker";
const control =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring";
export function CatalogEditor({
  kind,
  record,
}: {
  kind: CatalogKind;
  record: CatalogRecord | null;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(catalogFields[kind].map((f) => [f.key, ""])),
    manufacturerId: "",
    platformId: "",
    regionLock: "",
    identificationStatus: "INCOMPLETE",
    ...record?.fields,
  }));
  const [manufacturer, setManufacturer] = useState(
    record?.manufacturer ? [record.manufacturer] : [],
  );
  const [platform, setPlatform] = useState(
    record?.platform ? [record.platform] : [],
  );
  const [markets, setMarkets] = useState(record?.markets ?? []);
  const [references, setReferences] = useState<
    (ReferenceInput & { key: string })[]
  >(() => (record?.references ?? []).map((r, i) => ({ ...r, key: String(i) })));
  const counter = useRef(references.length);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [confirm, setConfirm] = useState(false);
  const archiveButtonRef = useRef<HTMLButtonElement>(null);
  const setField = (key: string, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  async function submit(archive = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const values: Record<string, unknown> = Object.fromEntries(
        catalogFields[kind].map((f) => [f.key, fields[f.key] ?? ""]),
      );
      if (kind === "platform" || kind === "model")
        values.manufacturerId = manufacturer[0]?.id ?? "";
      if (kind === "model")
        Object.assign(values, {
          platformId: platform[0]?.id ?? "",
          regionIds: markets.map((m) => m.id),
          regionLock: fields.regionLock,
          identificationStatus: fields.identificationStatus,
        });
      const result =
        archive && record
          ? await changeCatalogArchive({
              kind,
              id: record.id,
              expectedRevision: record.revision,
              archived: !record.archived,
            })
          : await changeCatalog({
              kind,
              ...(record
                ? { id: record.id, expectedRevision: record.revision }
                : {}),
              fields: values,
              references: references.map((ref) => ({
                ...(ref.id ? { id: ref.id } : {}),
                provider: ref.provider,
                providerObjectType: ref.providerObjectType,
                externalId: ref.externalId,
                url: ref.url,
              })),
            });
      if (result.status === "error") {
        setError(result.message);
        setConfirm(false);
        requestAnimationFrame(() => errorRef.current?.focus());
      } else {
        setConfirm(false);
        router.push(`/app/catalog?kind=${kind}&id=${result.id}&saved=1`);
        router.refresh();
      }
    } catch {
      setError(
        "We couldn't save this change. Your entries are still here. Please try again.",
      );
      setConfirm(false);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="max-w-3xl space-y-5 rounded-xl bg-card p-4 sm:p-6"
      aria-labelledby="catalog-editor-title"
      data-catalog-revision={record?.revision ?? 0}
    >
      <h2 id="catalog-editor-title" className="text-xl font-medium break-words">
        {record ? `Edit ${record.name}` : "Add catalog record"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Shared catalog facts apply to every linked copy. Personal notes,
        condition and photographs belong to your collection.
      </p>
      {record?.archived ? (
        <p>
          This record is archived. Its existing collection links are preserved.
          Restore it to make changes.
        </p>
      ) : null}
      {error ? (
        <p
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="text-destructive break-words"
        >
          {error}
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-6"
        aria-busy={busy}
      >
        <fieldset
          disabled={busy || record?.archived}
          className="min-w-0 space-y-5"
        >
          {catalogFields[kind].map((field) => (
            <div key={field.key} className="min-w-0 space-y-2">
              <Label htmlFor={`catalog-${field.key}`}>
                {field.label}
                {["name", "slug", "code"].includes(field.key)
                  ? " (required)"
                  : ""}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`catalog-${field.key}`}
                  value={fields[field.key]}
                  onChange={(event) => setField(field.key, event.target.value)}
                  maxLength={
                    field.key === "history" || field.key === "specifications"
                      ? 16000
                      : field.key === "aliases"
                        ? 8000
                        : 4000
                  }
                  aria-describedby={
                    field.hint ? `${field.key}-hint` : undefined
                  }
                />
              ) : (
                <Input
                  id={`catalog-${field.key}`}
                  value={fields[field.key]}
                  onChange={(event) => setField(field.key, event.target.value)}
                  required={["name", "slug", "code"].includes(field.key)}
                  inputMode={
                    field.type === "year"
                      ? "numeric"
                      : field.type === "decimal"
                        ? "decimal"
                        : undefined
                  }
                  maxLength={field.key === "website" ? 2048 : 200}
                  aria-describedby={
                    field.hint ? `${field.key}-hint` : undefined
                  }
                />
              )}
              {field.hint ? (
                <p
                  id={`${field.key}-hint`}
                  className="text-sm text-muted-foreground"
                >
                  {field.hint}
                </p>
              ) : null}
            </div>
          ))}
          {kind === "platform" || kind === "model" ? (
            <>
              <CatalogPicker
                kind="company"
                label={
                  kind === "platform" ? "Brand company" : "Actual manufacturer"
                }
                selected={manufacturer}
                onChange={setManufacturer}
                disabled={busy || record?.archived}
              />
              <p className="text-sm text-muted-foreground">
                {kind === "model"
                  ? "Unknown manufacturers remain empty; the platform brand is not copied here."
                  : "Select the company associated with this platform."}
              </p>
            </>
          ) : null}
          {kind === "model" ? (
            <>
              <CatalogPicker
                kind="platform"
                label="Platform (required)"
                selected={platform}
                onChange={setPlatform}
                disabled={busy || record?.archived}
              />
              <CatalogPicker
                kind="region"
                label="Commercial markets"
                selected={markets}
                onChange={setMarkets}
                multiple
                disabled={busy || record?.archived}
              />
              <div className="space-y-2">
                <Label htmlFor="catalog-lock">Region lock</Label>
                <select
                  id="catalog-lock"
                  className={control}
                  value={fields.regionLock}
                  onChange={(e) => setField("regionLock", e.target.value)}
                >
                  <option value="">Unknown</option>
                  <option value="UNRESTRICTED">Unrestricted</option>
                  <option value="RESTRICTED">Restricted</option>
                  <option value="NOT_APPLICABLE">Not applicable</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-identification">Identification</Label>
                <select
                  id="catalog-identification"
                  className={control}
                  value={fields.identificationStatus}
                  onChange={(e) =>
                    setField("identificationStatus", e.target.value)
                  }
                >
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="CONFIRMED">Confirmed</option>
                </select>
              </div>
            </>
          ) : null}
          {kind !== "region" ? (
            <fieldset className="min-w-0 space-y-4">
              <legend className="mb-2 font-medium">External references</legend>
              <p className="text-sm text-muted-foreground">
                Store a provider ID, an HTTP/HTTPS URL, or both. IDs also need
                an object type. Links are stored without fetching or importing
                their contents.
              </p>
              {references.map((reference, index) => (
                <fieldset
                  key={reference.key}
                  className="min-w-0 space-y-3 rounded-xl bg-muted p-4"
                >
                  <legend className="px-1">Reference {index + 1}</legend>
                  {(
                    [
                      ["provider", "Provider"],
                      ["providerObjectType", "Object type"],
                      ["externalId", "External ID"],
                      ["url", "URL"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label htmlFor={`ref-${reference.key}-${key}`}>
                        {label}
                      </Label>
                      <Input
                        id={`ref-${reference.key}-${key}`}
                        value={reference[key]}
                        maxLength={
                          key === "url"
                            ? 2048
                            : key === "externalId"
                              ? 300
                              : 100
                        }
                        onChange={(e) =>
                          setReferences((current) =>
                            current.map((r) =>
                              r.key === reference.key
                                ? { ...r, [key]: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setReferences((current) =>
                        current.filter((r) => r.key !== reference.key),
                      )
                    }
                  >
                    Remove reference {index + 1}
                  </Button>
                </fieldset>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={references.length >= 30}
                onClick={() => {
                  const key = String(counter.current++);
                  setReferences((current) => [
                    ...current,
                    {
                      key,
                      provider: "",
                      providerObjectType: "",
                      externalId: "",
                      url: "",
                    },
                  ]);
                }}
              >
                Add external reference
              </Button>
            </fieldset>
          ) : null}
          <Button type="submit">
            {busy ? "Saving…" : "Save catalog record"}
          </Button>
        </fieldset>
      </form>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href={`/app/catalog?kind=${kind}`}>
            Back to {kind === "region" ? "markets" : "catalog"}
          </Link>
        </Button>
        {record ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            ref={archiveButtonRef}
            onClick={() => setConfirm(true)}
          >
            {record.archived ? "Restore record" : "Archive record"}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!pending.current) setConfirm(open);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (error) errorRef.current?.focus();
            else archiveButtonRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending.current) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (pending.current) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {record?.archived
                ? "Restore this record?"
                : "Archive this record?"}
            </DialogTitle>
            <DialogDescription>
              {record?.archived
                ? "This record will be available for new catalog links again."
                : "Existing collection and catalog links remain. This record will no longer appear in new selections. Unsaved form changes will not be applied."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void submit(true)}
            >
              {busy
                ? "Saving…"
                : record?.archived
                  ? "Confirm restore"
                  : "Confirm archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
