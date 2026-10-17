"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConsolePicker } from "@/features/consoles/components/console-picker";
import { PhysicalDetails } from "@/features/consoles/components/physical-details";
import {
  ConsoleFileList,
  ConsoleFilePicker,
  type ConsoleFile,
} from "@/features/consoles/components/console-files";
import { lookupConsolePlatforms } from "@/features/consoles/actions";
import {
  emptyCopyPhysical,
  copyPhysical,
} from "@/features/collection/copy-validation";
import {
  uploadCollectionFile,
  checkCollectionUpload,
  validatePhoto,
  PhotoUploadError,
} from "@/features/media/upload";
import { photoTypes } from "@/features/media/contracts";
import type { CollectionUploadType } from "@/features/media/upload";
import { editions } from "../validation";
import {
  lookupGames,
  lookupGameReleases,
  loadGameRelease,
  saveGameCopy,
} from "../creation-actions";
import {
  gameCreationSteps,
  type PlatformChoice,
  type GameChoice,
  type ReleaseChoice,
  type Choices,
  type CopyLocation,
  type ReleaseFilters,
} from "../creation-contracts";
import { GameReleaseSummary } from "./game-release-summary";
import { severityLabels } from "@/features/defects/contracts";
const ReleaseEditor = dynamic(
  () => import("./game-catalog-editor").then((m) => m.GameCatalogEditor),
  { loading: () => <p role="status">Loading release form…</p> },
);
const selectClass =
  "min-h-12 w-full rounded-lg border border-input bg-background px-3";
export function GameWizard({
  platforms,
  games,
  locations,
  canManageCatalog,
}: {
  platforms: Choices<PlatformChoice>;
  games: Choices<GameChoice>;
  locations: CopyLocation[];
  canManageCatalog: boolean;
}) {
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<PlatformChoice | null>(null);
  const [game, setGame] = useState<GameChoice | null>(null);
  const [release, setRelease] = useState<ReleaseChoice | null>(null);
  const [releases, setReleases] = useState<Choices<ReleaseChoice>>({
    items: [],
    hasMore: false,
    page: 0,
  });
  const [markets, setMarkets] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<ReleaseFilters>({
    marketId: "",
    editionType: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [physical, setPhysical] = useState(() =>
    structuredClone(emptyCopyPhysical),
  );
  const [files, setFiles] = useState<ConsoleFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [createdReleaseId, setCreatedReleaseId] = useState<string | null>(null);
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
  }, [step, savedId, creating]);
  useEffect(() => {
    if (message && !busy) error.current?.focus();
  }, [message, busy]);
  function resetSelection() {
    setRelease(null);
    setFilters({ marketId: "", editionType: "" });
    setAppliedFilters({ marketId: "", editionType: "" });
    setCreatedReleaseId(null);
    submitted.current = null;
  }
  async function refreshReleases(nextFilters = filters) {
    if (!platform || !game || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await lookupGameReleases({
        platformId: platform.id,
        gameId: game.id,
        ...nextFilters,
      });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setReleases(result.data);
      setMarkets(result.data.markets);
      setAppliedFilters(nextFilters);
      setRelease(null);
      submitted.current = null;
      setStep(2);
    } catch {
      setMessage("We couldn't load releases. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function selectCreatedRelease() {
    if (!platform || !game || !createdReleaseId || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await loadGameRelease({
        id: createdReleaseId,
        platformId: platform.id,
        gameId: game.id,
      });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setRelease(result.data);
      setCreatedReleaseId(null);
      setFilters({ marketId: "", editionType: "" });
      setAppliedFilters({ marketId: "", editionType: "" });
      submitted.current = null;
    } catch {
      setMessage("Your release was saved. Try selecting it again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function addFiles(incoming: File[], type: CollectionUploadType) {
    if (!photoTypes.some((t) => t === type)) return;
    const invalid = incoming.map(validatePhoto).find(Boolean);
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
      next.reduce((sum, f) => sum + f.file.size, 0) > 100 * 1024 * 1024
    ) {
      setMessage("Choose up to 20 photos, with no more than 100 MB in total.");
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
            e instanceof Error ? e.message : "Check this file in Photos.",
          uploadId: e instanceof PhotoUploadError ? e.uploadId : undefined,
        });
        setMessage(
          "Your game is saved. A photo needs checking; the remaining photos have not been uploaded. Check saved photos before adding this file again.",
        );
        break;
      }
    }
  }
  async function recover(entry: ConsoleFile) {
    if (pending.current || !entry.uploadId) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      await checkCollectionUpload(entry.uploadId);
      patchFile(entry.id, {
        state: "saved",
        uploadId: undefined,
        message: undefined,
        percent: 100,
      });
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "We couldn't check this upload.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (pending.current || !platform || !game || !release) return;
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
        gameId: game.id,
        gameRevision: game.revision,
        releaseId: release.id,
        releaseRevision: release.revision,
      };
      const result = await saveGameCopy(submitted.current);
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
    if (step === 0 && !platform) {
      setMessage("Choose a platform before continuing.");
      return;
    }
    if (step === 1) {
      if (!game) {
        setMessage("Choose a game before continuing.");
        return;
      }
      await refreshReleases({ marketId: "", editionType: "" });
      return;
    }
    if (step === 2 && !release) {
      setMessage("Choose a release before continuing.");
      return;
    }
    if (step === 3) {
      const p = copyPhysical.safeParse(physical);
      if (!p.success) {
        setMessage(p.error.issues[0].message);
        return;
      }
    }
    setStep(step + 1);
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {!savedId && (
        <ol
          aria-label="Add game steps"
          className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"
        >
          {gameCreationSteps.map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={step === i ? "font-semibold text-foreground" : ""}
            >
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      )}
      <h2
        ref={heading}
        tabIndex={-1}
        className="font-heading text-2xl focus:outline-none"
      >
        {savedId
          ? "Game saved privately"
          : creating
            ? "Create missing release"
            : gameCreationSteps[step]}
      </h2>
      {message && (
        <p
          ref={error}
          tabIndex={-1}
          role="alert"
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
              Upload remaining photos
            </Button>
          )}
          {busy ? (
            <p role="status">Saving photos… Keep this page open.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/app/collection?type=game">Browse games</Link>
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
      ) : creating && game && platform ? (
        <>
          <p className="text-sm text-muted-foreground">
            This creates a shared catalog release for {game.name} on{" "}
            {platform.name}. It does not save your physical copy. Review the
            market, edition and contents before saving.
          </p>
          <ReleaseEditor
            kind="release"
            record={null}
            creation={{
              game: { id: game.id, name: game.name, archived: false },
              platform: {
                id: platform.id,
                name: platform.name,
                archived: false,
              },
            }}
            onCreated={(id) => {
              setCreatedReleaseId(id);
              setCreating(false);
              setRelease(null);
              setMessage("");
            }}
          />
          <Button variant="outline" onClick={() => setCreating(false)}>
            Back to release selection
          </Button>
        </>
      ) : (
        <>
          <fieldset
            disabled={busy}
            aria-busy={busy}
            className="min-w-0 space-y-6"
          >
            {step === 0 && (
              <ConsolePicker
                label="platforms"
                choices={platforms}
                selectedId={platform?.id}
                search={(query, page) =>
                  lookupConsolePlatforms({ query, page })
                }
                choose={(p) => {
                  if (pending.current) return;
                  setPlatform(p);
                  resetSelection();
                }}
                detail={(p) =>
                  `${p.manufacturer ?? "Brand unknown"} · ${p.releaseYear ?? "Year unknown"}`
                }
              />
            )}
            {step === 1 && (
              <>
                <p className="text-sm">
                  Platform: {platform?.name}. Choose the game title; its
                  physical release comes next.
                </p>
                <ConsolePicker
                  label="games"
                  choices={games}
                  selectedId={game?.id}
                  search={(query, page) => lookupGames({ query, page })}
                  choose={(g) => {
                    if (pending.current) return;
                    setGame(g);
                    resetSelection();
                  }}
                  detail={(g) => g.slug}
                  optionName={(g) => `${g.name} (${g.slug})`}
                />
                {canManageCatalog && (
                  <p className="text-sm">
                    <Link
                      href="/app/catalog/games?kind=game&new=1"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      Add a missing game in the catalog (opens a new tab)
                    </Link>
                    . Return here and use Find matches; your draft stays on this
                    page.
                  </p>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <p>
                  {game?.name} · {platform?.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Market and edition filters are optional. Unknown details do
                  not block searching. The release you select fixes both facts
                  for your copy.
                </p>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    Commercial market filter
                    <select
                      aria-label="Commercial market filter"
                      className={selectClass}
                      value={filters.marketId}
                      onChange={(e) =>
                        setFilters({ ...filters, marketId: e.target.value })
                      }
                    >
                      <option value="">All markets, including unknown</option>
                      {markets.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2">
                    Edition filter
                    <select
                      aria-label="Edition filter"
                      className={selectClass}
                      value={filters.editionType}
                      onChange={(e) =>
                        setFilters({
                          ...filters,
                          editionType: e.target
                            .value as ReleaseFilters["editionType"],
                        })
                      }
                    >
                      <option value="">All editions</option>
                      {editions.map((e) => (
                        <option key={e} value={e}>
                          {e.toLowerCase().replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void refreshReleases()}
                >
                  Apply release filters
                </Button>
                <ConsolePicker
                  key={`${platform!.id}:${game!.id}:${appliedFilters.marketId}:${appliedFilters.editionType}:${releases.items.map((r) => `${r.id}:${r.revision}`).join(",")}`}
                  label="releases"
                  choices={releases}
                  selectedId={release?.id}
                  search={(query, page) =>
                    lookupGameReleases({
                      platformId: platform!.id,
                      gameId: game!.id,
                      ...appliedFilters,
                      query,
                      page,
                    })
                  }
                  choose={(r) => {
                    if (pending.current) return;
                    setRelease(r);
                    submitted.current = null;
                  }}
                  detail={(r) =>
                    `${r.slug} · ${r.markets.map((m) => m.name).join(", ") || "Market unknown"}${r.printingLabel ? ` · ${r.printingLabel}` : ""}`
                  }
                  optionName={(r) => `${r.name} (${r.slug})`}
                />
                {createdReleaseId && (
                  <div className="space-y-3">
                    <p role="status">
                      The catalog release was saved. Select it to continue with
                      your copy.
                    </p>
                    <Button onClick={() => void selectCreatedRelease()}>
                      Use created release
                    </Button>
                  </div>
                )}
                {canManageCatalog && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCreating(true);
                      setMessage("");
                    }}
                  >
                    Create missing release
                  </Button>
                )}
                {release && <GameReleaseSummary release={release} />}
              </>
            )}
            {step === 3 && (
              <>
                <PhysicalDetails
                  data={physical}
                  change={(v) => {
                    setPhysical(v);
                    submitted.current = null;
                  }}
                  locations={locations}
                  identity="release"
                />
                <section className="space-y-3" aria-label="Copy photos">
                  <h3 className="font-heading text-xl">Photos</h3>
                  <ConsoleFilePicker
                    overrides={false}
                    files={files}
                    add={addFiles}
                    remove={(id) =>
                      setFiles((current) => current.filter((f) => f.id !== id))
                    }
                  />
                </section>
              </>
            )}
            {step === 4 && release && (
              <>
                <p className="font-medium [overflow-wrap:anywhere]">
                  {game?.name} · {platform?.name}
                </p>
                <GameReleaseSummary release={release} />
                <section
                  aria-label="Review my copy"
                  className="space-y-4 rounded-xl bg-card p-5"
                >
                  <h3 className="font-heading text-xl">My copy</h3>
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
                    {physical.defects.map((d, i) => (
                      <li key={i} className="text-sm [overflow-wrap:anywhere]">
                        {d.title} · {severityLabels[d.severity]} · Active
                        {d.description && (
                          <p className="whitespace-pre-wrap">{d.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
                <h3 className="font-heading text-xl">
                  Photos ({files.length})
                </h3>
                <ConsoleFileList files={files} />
                <p className="text-sm text-muted-foreground">
                  Your game will be saved privately, then photos uploaded. If an
                  upload fails, your copy stays saved and you can finish uploads
                  here. Has box does not imply completeness.
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-3">
              {step > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(step - 1);
                    setMessage("");
                  }}
                >
                  Back
                </Button>
              )}
              {step < 4 ? (
                <Button onClick={() => void next()}>
                  {busy ? "Loading…" : "Continue"}
                </Button>
              ) : (
                <Button onClick={() => void save()}>
                  {busy ? "Saving…" : "Save game"}
                </Button>
              )}
              {busy ? (
                <Button disabled variant="ghost">
                  Cancel
                </Button>
              ) : (
                <Button asChild variant="ghost">
                  <Link href="/app/collection">Cancel</Link>
                </Button>
              )}
            </div>
          </fieldset>
          {step < 2 && (step === 0 ? platform : game) && (
            <p role="status" className="text-sm">
              Selected: {step === 0 ? platform?.name : game?.name}
            </p>
          )}
        </>
      )}
    </div>
  );
}
