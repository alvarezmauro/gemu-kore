"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PhysicalDetails } from "@/features/consoles/components/physical-details";
import { ConsolePicker } from "@/features/consoles/components/console-picker";
import { CopyConfirm } from "@/features/collection/components/copy-confirm";
import { lookupConsolePlatforms } from "@/features/consoles/actions";
import { lookupGames, lookupGameReleases } from "../creation-actions";
import { submitGameChange } from "../management-client";
import { gameUpdate } from "../management-validation";
import { editions } from "../validation";
import type { CopyPhysicalDraft } from "@/features/collection/copy-validation";
import type { GameCopyDetail } from "../management-contracts";
import type {
  Choices,
  CopyLocation,
  PlatformChoice,
  GameChoice,
  ReleaseChoice,
  ReleaseFilters,
} from "../creation-contracts";
const selectClass =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3";
export function GameControls({
  detail,
  locations,
}: {
  detail: Pick<
    GameCopyDetail,
    "id" | "revision" | "fields" | "platform" | "game" | "release"
  >;
  locations: CopyLocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CopyPhysicalDraft>({
    ...detail.fields,
    defects: [],
  });
  const [revision, setRevision] = useState(detail.revision);
  const [platform, setPlatform] = useState<PlatformChoice>(detail.platform);
  const [game, setGame] = useState<GameChoice>(detail.game);
  const [release, setRelease] = useState<ReleaseChoice | null>(detail.release);
  const [platforms, setPlatforms] = useState<Choices<PlatformChoice> | null>(
    null,
  );
  const [games, setGames] = useState<Choices<GameChoice> | null>(null);
  const [releases, setReleases] = useState<Choices<ReleaseChoice> | null>(null);
  const [markets, setMarkets] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<ReleaseFilters>({
    marketId: "",
    editionType: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const pending = useRef(false),
    alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  function task(run: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    startTransition(async () => {
      try {
        await run();
      } catch {
        setError("We couldn't load these choices. Try again.");
      } finally {
        pending.current = false;
      }
    });
  }
  async function loadReleases(p = platform, g = game, f = filters) {
    const result = await lookupGameReleases({
      platformId: p.id,
      gameId: g.id,
      ...f,
    });
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setReleases(result.data);
    setMarkets(result.data.markets);
    setAppliedFilters(f);
  }
  function chooseIdentity(p: PlatformChoice, g: GameChoice) {
    if (pending.current) return;
    setPlatform(p);
    setGame(g);
    setRelease(null);
    setReleases(null);
    const f: ReleaseFilters = { marketId: "", editionType: "" };
    setFilters(f);
    task(() => loadReleases(p, g, f));
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (pending.current) return;
            setOpen(value);
            setError("");
            if (value) {
              setDraft({ ...detail.fields, defects: [] });
              setRevision(detail.revision);
              setPlatform(detail.platform);
              setGame(detail.game);
              setRelease(detail.release);
              setPlatforms(null);
              setGames(null);
              setReleases(null);
              setMarkets([]);
              setFilters({ marketId: "", editionType: "" });
              setAppliedFilters({ marketId: "", editionType: "" });
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>Edit game</Button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-2xl"
            showCloseButton={!busy}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogTitle>Edit your game</DialogTitle>
            <DialogDescription>
              Change this physical copy. Its release fixes canonical market and
              edition. Meaningful edits return a published copy to private.
            </DialogDescription>
            <form
              className="min-w-0 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!release) {
                  setError("Choose a release before saving.");
                  return;
                }
                const { defects, ...fields } = draft;
                void defects;
                const input = {
                  operation: "update",
                  id: detail.id,
                  expectedRevision: revision,
                  ...fields,
                  platformId: platform.id,
                  platformRevision: platform.revision,
                  gameId: game.id,
                  gameRevision: game.revision,
                  releaseId: release.id,
                  releaseRevision: release.revision,
                };
                const valid = gameUpdate.safeParse(input);
                if (!valid.success) {
                  setError(
                    valid.error.issues[0]?.message ?? "Check these details.",
                  );
                  return;
                }
                task(async () => {
                  const result = await submitGameChange(input);
                  if (result.status === "error") setError(result.message);
                  else {
                    setOpen(false);
                    setMessage("Game saved.");
                    router.refresh();
                  }
                });
              }}
            >
              <fieldset disabled={busy} className="min-w-0 space-y-6">
                <section
                  aria-label="Catalog identity"
                  className="min-w-0 space-y-3 rounded-xl bg-muted p-4 [overflow-wrap:anywhere]"
                >
                  <h3 className="font-medium">Catalog identity</h3>
                  <p>
                    {game.name} · {platform.name} ·{" "}
                    {release?.name ?? "Choose a release"}
                  </p>
                  {release && (
                    <p className="text-sm text-muted-foreground">
                      {release.slug} · Markets:{" "}
                      {release.markets.map((m) => m.name).join(", ") ||
                        "Unknown"}
                    </p>
                  )}
                  {!platforms ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 max-w-full whitespace-normal"
                      onClick={() =>
                        task(async () => {
                          const [p, g] = await Promise.all([
                            lookupConsolePlatforms({}),
                            lookupGames({}),
                          ]);
                          if (p.status === "error") {
                            setError(p.message);
                            return;
                          }
                          if (g.status === "error") {
                            setError(g.message);
                            return;
                          }
                          setPlatforms(p.data);
                          setGames(g.data);
                          await loadReleases(platform, game, {
                            marketId: "",
                            editionType: "",
                          });
                        })
                      }
                    >
                      Correct release identification
                    </Button>
                  ) : (
                    <>
                      <ConsolePicker
                        label="platforms"
                        choices={platforms}
                        selectedId={platform.id}
                        search={(query, page) =>
                          lookupConsolePlatforms({ query, page })
                        }
                        detail={(p) => p.manufacturer ?? "Brand unknown"}
                        choose={(p) => chooseIdentity(p, game)}
                      />
                      {games && (
                        <ConsolePicker
                          label="games"
                          choices={games}
                          selectedId={game.id}
                          search={(query, page) => lookupGames({ query, page })}
                          detail={(g) => g.slug}
                          optionName={(g) => `${g.name} (${g.slug})`}
                          choose={(g) => chooseIdentity(platform, g)}
                        />
                      )}
                      <p className="text-sm">
                        Optional filters narrow releases; they do not change the
                        selected release’s market or edition.
                      </p>
                      <label className="block space-y-2">
                        Commercial market filter
                        <select
                          className={selectClass}
                          aria-label="Commercial market filter"
                          value={filters.marketId}
                          onChange={(e) =>
                            setFilters({ ...filters, marketId: e.target.value })
                          }
                        >
                          <option value="">
                            All markets, including unknown
                          </option>
                          {markets.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block space-y-2">
                        Edition filter
                        <select
                          className={selectClass}
                          aria-label="Edition filter"
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
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          task(async () => {
                            setRelease(null);
                            await loadReleases();
                          })
                        }
                      >
                        Apply release filters
                      </Button>
                      {releases && (
                        <ConsolePicker
                          key={`${platform.id}:${game.id}:${appliedFilters.marketId}:${appliedFilters.editionType}:${releases.items.map((r) => `${r.id}:${r.revision}`).join(",")}`}
                          label="releases"
                          choices={releases}
                          selectedId={release?.id}
                          search={(query, page) =>
                            lookupGameReleases({
                              platformId: platform.id,
                              gameId: game.id,
                              ...appliedFilters,
                              query,
                              page,
                            })
                          }
                          detail={(r) =>
                            `${r.slug} · ${r.markets.map((m) => m.name).join(", ") || "Market unknown"}`
                          }
                          optionName={(r) => `${r.name} (${r.slug})`}
                          choose={(r) => {
                            if (!pending.current) setRelease(r);
                          }}
                        />
                      )}
                    </>
                  )}
                </section>
                <PhysicalDetails
                  data={draft}
                  change={setDraft}
                  locations={locations}
                  showDefects={false}
                  identity="release"
                />
                <p className="text-sm text-muted-foreground">
                  Manage structured defects and photos separately. Expected
                  contents stay with the release.
                </p>
              </fieldset>
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
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <CopyConfirm
          label="Delete game"
          title="Delete this game copy?"
          description={`Delete this ${detail.game.name} (${detail.platform.name} · ${detail.release.name}) copy, its defects and attached media links? This cannot be undone. Shared catalog records, other copies and stored files remain available.`}
          input={{
            operation: "delete",
            id: detail.id,
            expectedRevision: detail.revision,
          }}
          submit={submitGameChange}
          done={() => {
            router.push("/app/collection");
            router.refresh();
          }}
        />
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
