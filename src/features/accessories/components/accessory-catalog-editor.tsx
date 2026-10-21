"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CatalogPicker } from "@/features/catalog/components/catalog-picker";
import type {
  CatalogOption,
  ReferenceInput,
} from "@/features/catalog/contracts";
import { parseTrailerInput } from "@/features/games/trailer-validation";
import {
  emptyAccessory,
  emptyVariant,
  type AccessoryKind,
  type VariantFields,
} from "../validation";
import type { AccessoryCatalogRecord } from "../contracts";
import { changeAccessoryCatalog, loadAccessoryCompatibility } from "../actions";
const control =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring";
export function AccessoryCatalogEditor({
  kind,
  record,
}: {
  kind: AccessoryKind;
  record: AccessoryCatalogRecord | null;
}) {
  const router = useRouter();
  const [family, setFamily] = useState(
    record?.kind === "accessory" ? record.fields : emptyAccessory,
  );
  const [variant, setVariant] = useState(
    record?.kind === "variant" ? record.fields : emptyVariant,
  );
  const [options, setOptions] = useState(
    record?.options ?? { company: [], accessory: [], platform: [], region: [] },
  );
  const [refs, setRefs] = useState(() =>
    (record?.references ?? []).map((v, i) => ({ ...v, key: `ref-${i}` })),
  );
  const counter = useRef(0);
  const initialVideo = record?.fields.trailer;
  const [provider, setProvider] = useState<"" | "YOUTUBE" | "DIRECT_URL">(
    initialVideo?.provider ?? "",
  );
  const [videoValue, setVideoValue] = useState(
    initialVideo?.provider === "YOUTUBE"
      ? initialVideo.id
      : (initialVideo?.url ?? ""),
  );
  const [source, setSource] = useState<CatalogOption[]>([]);
  const [copyReview, setCopyReview] = useState<{
    sourceId: string;
    sourceRevision: number;
    reviewed: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  const fields = kind === "accessory" ? family : variant;
  function editCommon(
    key: "name" | "slug" | "producerId" | "releaseYear",
    value: string,
  ) {
    if (kind === "accessory") setFamily((f) => ({ ...f, [key]: value }));
    else setVariant((v) => ({ ...v, [key]: value }));
  }
  function editVariant<K extends keyof VariantFields>(
    key: K,
    value: VariantFields[K],
  ) {
    setVariant((v) => ({ ...v, [key]: value }));
  }
  function field(
    label: string,
    value: string,
    change: (v: string) => void,
    multiline = false,
  ) {
    return (
      <label className="block min-w-0 space-y-2">
        <span className="text-sm font-medium">{label}</span>
        {multiline ? (
          <Textarea
            aria-label={label}
            value={value}
            onChange={(e) => change(e.target.value)}
            maxLength={16000}
          />
        ) : (
          <Input
            aria-label={label}
            value={value}
            onChange={(e) => change(e.target.value)}
            maxLength={4000}
          />
        )}
      </label>
    );
  }
  function picker(
    key: keyof typeof options,
    label: string,
    ids: string[],
    change: (ids: string[]) => void,
    multiple = false,
  ) {
    return (
      <CatalogPicker
        kind={key}
        label={label}
        selected={options[key].filter((o) => ids.includes(o.id))}
        multiple={multiple}
        onChange={(values) => {
          setOptions((all) => ({
            ...all,
            [key]: [
              ...all[key].filter((o) => !values.some((v) => v.id === o.id)),
              ...values,
            ],
          }));
          change(values.map((v) => v.id));
        }}
      />
    );
  }
  async function loadCopy() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await loadAccessoryCompatibility({
        accessoryId: variant.accessoryId,
        sourceId: source[0]?.id,
      });
      if (result.status === "error") setError(result.message);
      else {
        setVariant((v) => ({ ...v, platforms: result.draft.platforms }));
        setOptions((all) => ({ ...all, platform: result.draft.options }));
        setCopyReview({
          sourceId: result.draft.sourceId,
          sourceRevision: result.draft.sourceRevision,
          reviewed: false,
        });
      }
    } catch {
      setError(
        "We couldn't load the compatibility draft. Your entries are still here.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save(archive = false) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const scope = record
        ? { id: record.id, expectedRevision: record.revision }
        : {};
      const input = archive
        ? { kind, ...scope, archived: !record?.archived }
        : {
            kind,
            ...scope,
            fields: {
              ...fields,
              trailer: provider
                ? parseTrailerInput(provider, videoValue)
                : null,
            },
            references: refs.map(({ key, ...r }) => {
              void key;
              return r;
            }),
            ...(kind === "variant" && copyReview
              ? { compatibilityCopy: copyReview }
              : {}),
          };
      const result = await changeAccessoryCatalog(input, archive);
      if (result.status === "error") setError(result.message);
      else {
        router.push(
          `/app/catalog/accessories?kind=${kind}&id=${result.id}&saved=1`,
        );
        router.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't confirm this save. Your entries are still here. Refresh before trying again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="max-w-3xl space-y-5"
      data-accessory-catalog-revision={record?.revision ?? 0}
    >
      <h2 className="font-heading text-xl [overflow-wrap:anywhere]">
        {record
          ? `Edit ${record.name}`
          : kind === "accessory"
            ? "New accessory family"
            : "New accessory variant"}
      </h2>
      {error && (
        <p
          ref={alert}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-destructive p-4 text-destructive"
        >
          {error}
        </p>
      )}
      {record?.archived && (
        <p>This catalog record is archived. Restore it before editing.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-5"
      >
        <fieldset
          disabled={busy || record?.archived}
          className="min-w-0 space-y-5 rounded-xl bg-card p-4 sm:p-6"
        >
          <legend className="px-1 font-medium">
            {kind === "accessory"
              ? "Shared family information"
              : "Variant information"}
          </legend>
          {field("Name", fields.name, (v) => editCommon("name", v))}
          {field("Slug", fields.slug, (v) => editCommon("slug", v))}
          {kind === "variant" &&
            picker(
              "accessory",
              "Accessory family",
              [variant.accessoryId],
              (ids) => editVariant("accessoryId", ids[0] ?? ""),
            )}
          {picker(
            "company",
            kind === "accessory" ? "Producer" : "Variant producer",
            fields.producerId ? [fields.producerId] : [],
            (ids) => editCommon("producerId", ids[0] ?? ""),
          )}
          {field("Release year", fields.releaseYear, (v) =>
            editCommon("releaseYear", v),
          )}
          {kind === "accessory" ? (
            <>
              {field(
                "Description",
                family.description,
                (v) => setFamily((f) => ({ ...f, description: v })),
                true,
              )}
              {field(
                "Specifications (JSON)",
                family.specifications,
                (v) => setFamily((f) => ({ ...f, specifications: v })),
                true,
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Blank producer, year, description, specifications or video uses
                the family value. A specifications override replaces the whole
                object. Markets and compatibility are separate facts.
              </p>
              {field("Model number", variant.modelNumber, (v) =>
                editVariant("modelNumber", v),
              )}
              {field("Color", variant.color, (v) => editVariant("color", v))}
              {field("Edition", variant.edition, (v) =>
                editVariant("edition", v),
              )}
              {field(
                "Variant description",
                variant.descriptionOverride,
                (v) => editVariant("descriptionOverride", v),
                true,
              )}
              {field(
                "Variant specifications (JSON)",
                variant.specificationsOverride,
                (v) => editVariant("specificationsOverride", v),
                true,
              )}
              <label className="block space-y-2">
                <span>Identification</span>
                <select
                  aria-label="Identification"
                  className={control}
                  value={variant.identificationStatus}
                  onChange={(e) =>
                    editVariant(
                      "identificationStatus",
                      e.target.value as VariantFields["identificationStatus"],
                    )
                  }
                >
                  <option value="INCOMPLETE">Incomplete</option>
                  <option value="CONFIRMED">Confirmed</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span>Region locking</span>
                <select
                  aria-label="Region locking"
                  className={control}
                  value={variant.regionLock}
                  onChange={(e) =>
                    editVariant(
                      "regionLock",
                      e.target.value as VariantFields["regionLock"],
                    )
                  }
                >
                  <option value="">Unknown</option>
                  <option value="UNRESTRICTED">Unrestricted</option>
                  <option value="RESTRICTED">Restricted</option>
                  <option value="NOT_APPLICABLE">Not applicable</option>
                </select>
              </label>
              {field(
                "Region lock notes",
                variant.regionLockNote,
                (v) => editVariant("regionLockNote", v),
                true,
              )}
              {picker(
                "region",
                "Commercial markets",
                variant.regionIds,
                (ids) => editVariant("regionIds", ids),
                true,
              )}
              <h3 className="font-heading text-lg">Compatible platforms</h3>
              <p className="text-sm text-muted-foreground">
                Record confirmed compatibility for this variant, including
                adapter or model restrictions in the notes. An absent platform
                is unconfirmed, not proven incompatible.
              </p>
              {!record && (
                <div className="space-y-3">
                  <CatalogPicker
                    kind="variant"
                    label="Source variant"
                    selected={source}
                    onChange={setSource}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!source.length || !variant.accessoryId}
                    onClick={() => void loadCopy()}
                  >
                    Load compatibility for review
                  </Button>
                </div>
              )}
              {picker(
                "platform",
                "Compatible platforms",
                variant.platforms.map((p) => p.platformId),
                (ids) =>
                  editVariant(
                    "platforms",
                    ids.map(
                      (platformId) =>
                        variant.platforms.find(
                          (p) => p.platformId === platformId,
                        ) ?? { platformId, compatibilityNote: "" },
                    ),
                  ),
                true,
              )}
              {variant.platforms.map((p, i) => (
                <div key={p.platformId}>
                  {field(
                    `Compatibility notes for ${options.platform.find((o) => o.id === p.platformId)?.name ?? `platform ${i + 1}`}`,
                    p.compatibilityNote,
                    (value) =>
                      editVariant(
                        "platforms",
                        variant.platforms.map((v) =>
                          v.platformId === p.platformId
                            ? { ...v, compatibilityNote: value }
                            : v,
                        ),
                      ),
                    true,
                  )}
                </div>
              ))}
              {copyReview && (
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={copyReview.reviewed}
                    onChange={(e) =>
                      setCopyReview(
                        (v) => v && { ...v, reviewed: e.target.checked },
                      )
                    }
                    className="size-5 shrink-0"
                  />
                  <span>
                    I reviewed the copied compatibility list and notes for this
                    variant.
                  </span>
                </label>
              )}
            </>
          )}
          <p className="text-sm text-muted-foreground">
            Specifications accept an optional JSON object without a
            schemaVersion wrapper.
          </p>
          <label className="block space-y-2">
            <span>
              {kind === "accessory" ? "Family video" : "Variant video override"}
            </span>
            <select
              aria-label="Video provider"
              className={control}
              value={provider}
              onChange={(e) => setProvider(e.target.value as typeof provider)}
            >
              <option value="">
                {kind === "accessory"
                  ? "No video recorded"
                  : "Use family video"}
              </option>
              <option value="YOUTUBE">YouTube</option>
              <option value="DIRECT_URL">Direct HTTPS video</option>
            </select>
          </label>
          {provider && field("Video ID or URL", videoValue, setVideoValue)}
          <h3 className="font-heading text-lg">External references</h3>
          {refs.map((r, i) => (
            <div key={r.key} className="space-y-3 rounded-lg border p-4">
              {(
                [
                  ["provider", "Provider"],
                  ["providerObjectType", "Object type"],
                  ["externalId", "External ID"],
                  ["url", "URL"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  {field(
                    `Reference ${i + 1} ${label.toLowerCase()}`,
                    r[key],
                    (v) =>
                      setRefs((all) =>
                        all.map((x) =>
                          x.key === r.key ? { ...x, [key]: v } : x,
                        ),
                      ),
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRefs((all) => all.filter((v) => v.key !== r.key))
                }
              >
                Remove reference {i + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={refs.length >= 30}
            onClick={() =>
              setRefs((all) => [
                ...all,
                {
                  key: `new-${++counter.current}`,
                  provider: "",
                  providerObjectType: "",
                  externalId: "",
                  url: "",
                } satisfies ReferenceInput & { key: string },
              ])
            }
          >
            Add reference
          </Button>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save catalog record"}
            </Button>
          </div>
        </fieldset>
      </form>
      <div className="flex flex-wrap gap-3">
        {record && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void save(true)}
          >
            {record.archived ? "Restore record" : "Archive record"}
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/app/catalog/accessories?kind=${kind}`}>
            Back to catalog
          </Link>
        </Button>
      </div>
    </div>
  );
}
