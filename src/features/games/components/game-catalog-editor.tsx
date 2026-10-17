"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CatalogPicker } from "@/features/catalog/components/catalog-picker";
import type { ReferenceInput } from "@/features/catalog/contracts";
import type { GameCatalogRecord } from "../contracts";
import {
  emptyGame,
  emptyRelease,
  editions,
  creditRoles,
  componentKinds,
  type GameFields,
  type ReleaseFields,
  type GameKind,
} from "../validation";
import { changeGameCatalog } from "../actions";
type Keyed<T> = T & { key: string };
type GameDraft = Omit<GameFields, "developers"> & {
  developers: Keyed<GameFields["developers"][number]>[];
};
type ReleaseDraft = Omit<
  ReleaseFields,
  "markets" | "credits" | "includedItems"
> & {
  markets: Keyed<ReleaseFields["markets"][number]>[];
  credits: Keyed<ReleaseFields["credits"][number]>[];
  includedItems: Keyed<ReleaseFields["includedItems"][number]>[];
};
const unkey = <T extends { key: string }>(rows: T[]) =>
  rows.map(({ key, ...row }) => {
    void key;
    return row;
  });
const control =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 focus-visible:outline-2 focus-visible:outline-ring";
const label = (v: string) => v.toLowerCase().replaceAll("_", " ");
export function GameCatalogEditor({
  kind,
  record,
}: {
  kind: GameKind;
  record: GameCatalogRecord | null;
}) {
  const router = useRouter();
  const [game, setGame] = useState<GameDraft>(() => {
    const initial = record?.kind === "game" ? record.fields : emptyGame;
    return {
      ...initial,
      developers: initial.developers.map((row, i) => ({
        ...row,
        key: `developer-${i}`,
      })),
    };
  });
  const [release, setRelease] = useState<ReleaseDraft>(() => {
    const initial = record?.kind === "release" ? record.fields : emptyRelease;
    return {
      ...initial,
      markets: initial.markets.map((row, i) => ({
        ...row,
        key: `market-${i}`,
      })),
      credits: initial.credits.map((row, i) => ({
        ...row,
        key: `credit-${i}`,
      })),
      includedItems: initial.includedItems.map((row, i) => ({
        ...row,
        key: `component-${i}`,
      })),
    };
  });
  const [refs, setRefs] = useState<Keyed<ReferenceInput>[]>(
    (record?.references ?? []).map((row, i) => ({
      ...row,
      key: `reference-${i}`,
    })),
  );
  const [options, setOptions] = useState(
    record?.options ?? { company: [], region: [], game: [], platform: [] },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    alert = useRef<HTMLParagraphElement>(null);
  const counter = useRef(0);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  function editGame<K extends keyof GameDraft>(key: K, value: GameDraft[K]) {
    setGame((g) => ({ ...g, [key]: value }));
  }
  function editRelease<K extends keyof ReleaseDraft>(
    key: K,
    value: ReleaseDraft[K],
  ) {
    setRelease((r) => ({ ...r, [key]: value }));
  }
  function picker(
    type: keyof typeof options,
    title: string,
    id: string,
    change: (id: string) => void,
  ) {
    return (
      <CatalogPicker
        kind={type}
        label={title}
        selected={options[type].filter((o) => o.id === id).slice(0, 1)}
        onChange={(values) => {
          setOptions((all) => ({
            ...all,
            [type]: [
              ...all[type].filter((o) => !values.some((v) => v.id === o.id)),
              ...values,
            ],
          }));
          change(values[0]?.id ?? "");
        }}
      />
    );
  }
  function field(
    title: string,
    value: string,
    change: (s: string) => void,
    multi = false,
  ) {
    return (
      <label className="block min-w-0 space-y-2">
        <span className="text-sm font-medium">{title}</span>
        {multi ? (
          <Textarea
            aria-label={title}
            value={value}
            onChange={(e) => change(e.target.value)}
            maxLength={16000}
          />
        ) : (
          <Input
            aria-label={title}
            value={value}
            onChange={(e) => change(e.target.value)}
            maxLength={4000}
          />
        )}
      </label>
    );
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
      const result = await changeGameCatalog(
        archive && record
          ? { kind, ...scope, archived: !record.archived }
          : {
              kind,
              ...scope,
              fields:
                kind === "game"
                  ? { ...game, developers: unkey(game.developers) }
                  : {
                      ...release,
                      markets: unkey(release.markets),
                      credits: unkey(release.credits),
                      includedItems: unkey(release.includedItems),
                    },
              references: unkey(refs),
            },
        archive,
      );
      if (result.status === "error") setError(result.message);
      else {
        router.push(`/app/catalog/games?kind=${kind}&id=${result.id}&saved=1`);
        router.refresh();
      }
    } catch {
      setError(
        "We couldn't confirm the save. Your entries are still here; refresh to check the catalog.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="max-w-3xl space-y-6 rounded-xl bg-card p-4 sm:p-6"
      aria-labelledby="game-editor-title"
      data-game-catalog-revision={record?.revision ?? 0}
    >
      <h2
        id="game-editor-title"
        className="font-heading text-xl [overflow-wrap:anywhere]"
      >
        {record
          ? `Edit ${record.name}`
          : `Add ${kind === "game" ? "game" : "game release"}`}
      </h2>
      <p className="text-sm text-muted-foreground">
        Shared catalog facts apply to every linked physical copy. A game is the
        title; a release identifies its platform and commercial edition.
      </p>
      {error && (
        <p
          ref={alert}
          tabIndex={-1}
          role="alert"
          className="text-destructive [overflow-wrap:anywhere]"
        >
          {error}
        </p>
      )}
      {record?.archived && (
        <p>This record is archived. Restore it before editing.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-6"
        aria-busy={busy}
      >
        <fieldset
          disabled={busy || record?.archived}
          className="space-y-5 min-w-0"
        >
          {kind === "game" ? (
            <>
              {field("Game name", game.name, (v) => editGame("name", v))}
              {field("Slug", game.slug, (v) => editGame("slug", v))}
              {field(
                "Description",
                game.description,
                (v) => editGame("description", v),
                true,
              )}
              {field(
                "Other names (one per line)",
                game.aliases,
                (v) => editGame("aliases", v),
                true,
              )}
              <div className="space-y-4">
                <h3 className="font-medium">Developers</h3>
                {game.developers.map((d, i) => (
                  <div key={d.key} className="space-y-3 rounded-lg border p-4">
                    {picker(
                      "company",
                      `Developer ${i + 1}`,
                      d.companyId,
                      (id) =>
                        editGame(
                          "developers",
                          game.developers.map((c, n) =>
                            n === i ? { ...c, companyId: id } : c,
                          ),
                        ),
                    )}
                    {field(`Developer ${i + 1} credit`, d.creditLabel, (v) =>
                      editGame(
                        "developers",
                        game.developers.map((c, n) =>
                          n === i ? { ...c, creditLabel: v } : c,
                        ),
                      ),
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        editGame(
                          "developers",
                          game.developers.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Remove developer {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    editGame("developers", [
                      ...game.developers,
                      {
                        companyId: "",
                        creditLabel: "",
                        key: `new-${++counter.current}`,
                      },
                    ])
                  }
                >
                  Add developer
                </Button>
              </div>
            </>
          ) : (
            <>
              {picker("game", "Game", release.gameId, (v) =>
                editRelease("gameId", v),
              )}
              {picker("platform", "Platform", release.platformId, (v) =>
                editRelease("platformId", v),
              )}
              {field("Slug", release.slug, (v) => editRelease("slug", v))}
              {field("Edition name", release.editionName, (v) =>
                editRelease("editionName", v),
              )}
              <label className="block space-y-2">
                <span>Edition type</span>
                <select
                  className={control}
                  aria-label="Edition type"
                  value={release.editionType}
                  onChange={(e) =>
                    editRelease(
                      "editionType",
                      e.target.value as ReleaseFields["editionType"],
                    )
                  }
                >
                  {editions.map((e) => (
                    <option key={e} value={e}>
                      {label(e)}
                    </option>
                  ))}
                </select>
              </label>
              {field("Printing label", release.printingLabel, (v) =>
                editRelease("printingLabel", v),
              )}
              {field(
                "First release year (market unknown)",
                release.firstReleaseYear,
                (v) => editRelease("firstReleaseYear", v),
              )}
              {field(
                "Languages (one per line)",
                release.languages,
                (v) => editRelease("languages", v),
                true,
              )}
              {field(
                "Release description override",
                release.descriptionOverride,
                (v) => editRelease("descriptionOverride", v),
                true,
              )}
              <label className="block space-y-2">
                <span>Identification</span>
                <select
                  className={control}
                  aria-label="Identification"
                  value={release.identificationStatus}
                  onChange={(e) =>
                    editRelease(
                      "identificationStatus",
                      e.target.value as ReleaseFields["identificationStatus"],
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
                  className={control}
                  aria-label="Region locking"
                  value={release.regionLock}
                  onChange={(e) =>
                    editRelease(
                      "regionLock",
                      e.target.value as ReleaseFields["regionLock"],
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
                release.regionLockNote,
                (v) => editRelease("regionLockNote", v),
                true,
              )}
              <div className="space-y-4">
                <h3 className="font-medium">
                  Commercial markets and launch dates
                </h3>
                <p className="text-sm text-muted-foreground">
                  Unknown dates may stay empty. Record only the year, month and
                  day you know; markets do not mean PAL, NTSC or region-free.
                </p>
                {release.markets.map((m, i) => (
                  <div key={m.key} className="space-y-3 rounded-lg border p-4">
                    {picker("region", `Market ${i + 1}`, m.regionId, (id) =>
                      editRelease(
                        "markets",
                        release.markets.map((c, n) =>
                          n === i ? { ...c, regionId: id } : c,
                        ),
                      ),
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      {(["year", "month", "day"] as const).map((part) => (
                        <div key={part}>
                          {field(`Market ${i + 1} ${part}`, m[part], (v) =>
                            editRelease(
                              "markets",
                              release.markets.map((c, n) =>
                                n === i ? { ...c, [part]: v } : c,
                              ),
                            ),
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        editRelease(
                          "markets",
                          release.markets.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Remove market {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    editRelease("markets", [
                      ...release.markets,
                      {
                        regionId: "",
                        year: "",
                        month: "",
                        day: "",
                        key: `new-${++counter.current}`,
                      },
                    ])
                  }
                >
                  Add market
                </Button>
              </div>
              <div className="space-y-4">
                <h3 className="font-medium">Release company credits</h3>
                {release.credits.map((c, i) => (
                  <div key={c.key} className="space-y-3 rounded-lg border p-4">
                    {picker("company", `Company ${i + 1}`, c.companyId, (id) =>
                      editRelease(
                        "credits",
                        release.credits.map((x, n) =>
                          n === i ? { ...x, companyId: id } : x,
                        ),
                      ),
                    )}
                    <label className="block space-y-2">
                      <span>Company {i + 1} role</span>
                      <select
                        className={control}
                        aria-label={`Company ${i + 1} role`}
                        value={c.role}
                        onChange={(e) =>
                          editRelease(
                            "credits",
                            release.credits.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    role: e.target.value as typeof c.role,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {creditRoles.map((role) => (
                          <option key={role} value={role}>
                            {label(role)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span>Company {i + 1} market scope</span>
                      <select
                        className={control}
                        aria-label={`Company ${i + 1} market scope`}
                        value={c.regionId}
                        onChange={(e) =>
                          editRelease(
                            "credits",
                            release.credits.map((x, n) =>
                              n === i ? { ...x, regionId: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="">All release markets</option>
                        {c.regionId &&
                          !release.markets.some(
                            (m) => m.regionId === c.regionId,
                          ) && (
                            <option value={c.regionId}>
                              Market removed — choose a scope
                            </option>
                          )}
                        {release.markets
                          .filter((m) => m.regionId)
                          .map((m) => (
                            <option key={m.regionId} value={m.regionId}>
                              {options.region.find((o) => o.id === m.regionId)
                                ?.name ?? "Selected market"}
                            </option>
                          ))}
                      </select>
                    </label>
                    {field(`Company ${i + 1} credit`, c.creditLabel, (v) =>
                      editRelease(
                        "credits",
                        release.credits.map((x, n) =>
                          n === i ? { ...x, creditLabel: v } : x,
                        ),
                      ),
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        editRelease(
                          "credits",
                          release.credits.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Remove company {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    editRelease("credits", [
                      ...release.credits,
                      {
                        companyId: "",
                        role: "PUBLISHER",
                        regionId: "",
                        creditLabel: "",
                        key: `new-${++counter.current}`,
                      },
                    ])
                  }
                >
                  Add company credit
                </Button>
              </div>
              <div className="space-y-4">
                <h3 className="font-medium">Expected edition contents</h3>
                <p className="text-sm text-muted-foreground">
                  Describe the official contents, not what your copy currently
                  has. List differently illustrated discs separately.
                </p>
                {release.includedItems.map((c, i) => (
                  <div key={c.key} className="space-y-3 rounded-lg border p-4">
                    {field(`Component ${i + 1} name`, c.name, (v) =>
                      editRelease(
                        "includedItems",
                        release.includedItems.map((x, n) =>
                          n === i ? { ...x, name: v } : x,
                        ),
                      ),
                    )}
                    <label className="block space-y-2">
                      <span>Component {i + 1} kind</span>
                      <select
                        className={control}
                        aria-label={`Component ${i + 1} kind`}
                        value={c.kind}
                        onChange={(e) =>
                          editRelease(
                            "includedItems",
                            release.includedItems.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    kind: e.target.value as typeof c.kind,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {componentKinds.map((k) => (
                          <option key={k} value={k}>
                            {label(k)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-2">
                      <span>Component {i + 1} quantity</span>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={c.quantity}
                        onChange={(e) =>
                          editRelease(
                            "includedItems",
                            release.includedItems.map((x, n) =>
                              n === i
                                ? { ...x, quantity: Number(e.target.value) }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                    {field(
                      `Component ${i + 1} description`,
                      c.description,
                      (v) =>
                        editRelease(
                          "includedItems",
                          release.includedItems.map((x, n) =>
                            n === i ? { ...x, description: v } : x,
                          ),
                        ),
                      true,
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        editRelease(
                          "includedItems",
                          release.includedItems.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Remove component {i + 1}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    editRelease("includedItems", [
                      ...release.includedItems,
                      {
                        name: "",
                        kind: "EXTRA",
                        description: "",
                        quantity: 1,
                        key: `new-${++counter.current}`,
                      },
                    ])
                  }
                >
                  Add expected component
                </Button>
              </div>
            </>
          )}
          <div className="space-y-4">
            <h3 className="font-medium">External references</h3>
            {refs.map((r, i) => (
              <div key={r.key} className="space-y-3 rounded-lg border p-4">
                {(
                  [
                    "provider",
                    "providerObjectType",
                    "externalId",
                    "url",
                  ] as const
                ).map((k) => (
                  <div key={k}>
                    {field(
                      `Reference ${i + 1} ${{ provider: "provider", providerObjectType: "record type", externalId: "external ID", url: "source URL" }[k]}`,
                      r[k],
                      (v) =>
                        setRefs(
                          refs.map((x, n) => (n === i ? { ...x, [k]: v } : x)),
                        ),
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefs(refs.filter((_, n) => n !== i))}
                >
                  Remove reference {i + 1}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRefs([
                  ...refs,
                  {
                    provider: "",
                    providerObjectType: "",
                    externalId: "",
                    url: "",
                    key: `new-${++counter.current}`,
                  },
                ])
              }
            >
              Add external reference
            </Button>
          </div>
          <Button type="submit">
            {busy ? "Saving…" : "Save catalog record"}
          </Button>
        </fieldset>
      </form>
      {record && (
        <Button
          type="button"
          disabled={busy}
          variant="outline"
          onClick={() => void save(true)}
        >
          {record.archived ? "Restore record" : "Archive record"}
        </Button>
      )}
      <Button variant="outline" asChild>
        <Link href={`/app/catalog/games?kind=${kind}`}>
          Back to game catalog
        </Link>
      </Button>
    </section>
  );
}
