import "server-only";
import { z } from "zod";
import {
  defaultClock,
  DataScheduler,
  failure,
  ProviderFailure,
  requestJson,
  runOperation,
  type ProviderClock,
  type Transport,
} from "../game-metadata/http";
import {
  accessoryMetadataResult,
  accessoryReference,
  accessorySearchPage,
  itemId,
  type AccessoryMetadataProvider,
  type AccessoryMetadataResult,
} from "./contracts";
const endpoint = "https://www.wikidata.org/w/api.php";
const term = z.object({
  language: z.enum(["en", "mul"]),
  value: z.string().trim().min(1).max(16000),
});
const entity = z.object({
  id: itemId,
  labels: z.object({ en: term.optional(), mul: term.optional() }).default({}),
  descriptions: z.unknown().optional(),
  claims: z.record(z.string(), z.unknown()).default({}),
  modified: z.iso.datetime().optional(),
  missing: z.unknown().optional(),
});
const statement = z.object({
  rank: z.enum(["normal", "preferred", "deprecated"]),
  qualifiers: z.record(z.string(), z.unknown()).optional(),
  mainsnak: z.object({
    snaktype: z.string(),
    datatype: z.string().optional(),
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});
const ref = (id: string) => ({
  provider: "WIKIDATA" as const,
  objectType: "ITEM" as const,
  externalId: id,
});
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ProviderFailure("INVALID_RESPONSE");
  return result.data;
}
function plain(value: string, max: number) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
export function createWikidataAccessoryProvider(
  configuration: { userAgent: string } | null,
  options: { transport?: Transport; clock?: ProviderClock } = {},
): AccessoryMetadataProvider {
  const transport = options.transport ?? fetch,
    clock = options.clock ?? defaultClock,
    scheduler = new DataScheduler(clock);
  async function request(
    params: Record<string, string>,
    context: Parameters<AccessoryMetadataProvider["search"]>[1],
  ) {
    return scheduler.run(context, async () => {
      const response = await requestJson(
        transport,
        clock,
        context,
        endpoint,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": configuration!.userAgent,
          },
          body: new URLSearchParams({
            ...params,
            format: "json",
            maxlag: "5",
          }).toString(),
        },
        512 * 1024,
      );
      if (response.status === 429 || response.status === 503) {
        scheduler.coolDown(response.retryAfterSeconds ?? 5);
        throw new ProviderFailure("RATE_LIMITED", response.retryAfterSeconds);
      }
      if (response.status === 404) throw new ProviderFailure("NOT_FOUND");
      if (response.status !== 200)
        throw new ProviderFailure(
          response.status >= 500 ? "UNAVAILABLE" : "INVALID_RESPONSE",
        );
      const error = z
        .object({ error: z.object({ code: z.string() }) })
        .safeParse(response.data);
      if (error.success)
        throw new ProviderFailure(
          ["maxlag", "ratelimited"].includes(error.data.error.code)
            ? "RATE_LIMITED"
            : "INVALID_RESPONSE",
        );
      return response.data;
    });
  }
  return {
    id: "WIKIDATA",
    async search(input, context) {
      if (!configuration) return failure("NOT_CONFIGURED");
      return runOperation(context, clock, async (operation) => {
        const search = parse(
          z.strictObject({
            query: z
              .string()
              .trim()
              .min(2)
              .max(200)
              .refine((v) => !/[\u0000-\u001f\u007f]/.test(v)),
            limit: z.number().int().min(1).max(20),
          }),
          input,
        );
        const data = parse(
          z.object({
            search: z
              .array(
                z.object({
                  id: itemId,
                  label: z.string().trim().min(1).max(200),
                  description: z.string().max(16000).optional(),
                }),
              )
              .max(20),
            "search-continue": z.number().optional(),
          }),
          await request(
            {
              action: "wbsearchentities",
              search: search.query,
              language: "en",
              uselang: "en",
              type: "item",
              limit: String(search.limit),
            },
            operation,
          ),
        );
        return parse(accessorySearchPage, {
          schemaVersion: 1,
          provider: "WIKIDATA",
          retrievedAt: new Date(clock.wallNow()).toISOString(),
          candidates: data.search.map((row) => ({
            identity: {
              ref: ref(row.id),
              name: plain(row.label, 200),
              evidenceIds: [`${row.id}:identity`],
            },
            description: row.description ? plain(row.description, 16000) : null,
          })),
          diagnostics: data["search-continue"]
            ? [{ section: "search", code: "LIMIT_REACHED" }]
            : [],
        });
      });
    },
    async fetch(input, context) {
      if (!configuration) return failure("NOT_CONFIGURED");
      return runOperation(context, clock, async (operation) => {
        const selected = parse(
          z.strictObject({ item: accessoryReference }),
          input,
        ).item;
        const response = parse(
          z.object({ entities: z.record(z.string(), z.unknown()) }),
          await request(
            {
              action: "wbgetentities",
              ids: selected.externalId,
              props: "labels|descriptions|claims|info",
              languages: "en|mul",
              languagefallback: "1",
            },
            operation,
          ),
        );
        const raw = response.entities[selected.externalId];
        if (!raw || (typeof raw === "object" && "missing" in raw))
          throw new ProviderFailure("NOT_FOUND");
        const record = parse(entity, raw);
        if (
          record.id !== selected.externalId ||
          !(record.labels.en ?? record.labels.mul)
        )
          throw new ProviderFailure("INVALID_RESPONSE");
        const retrievedAt = new Date(clock.wallNow()).toISOString(),
          sourceUrl = `https://www.wikidata.org/wiki/${record.id}`;
        const evidence: AccessoryMetadataResult["evidence"] = [],
          diagnostics: AccessoryMetadataResult["diagnostics"] = [];
        const description = z
          .object({ en: term.optional() })
          .safeParse(record.descriptions ?? {});
        const cleanDescription =
          description.success && description.data.en
            ? plain(description.data.en.value, 16000)
            : null;
        if (!description.success || (description.data.en && !cleanDescription))
          diagnostics.push({
            section: "description",
            code: "INVALID_OPTIONAL",
          });
        function source(
          fieldPath: string,
          property?: string,
          normalization: "NONE" | "PLAIN_TEXT" | "PARTIAL_DATE" = "NONE",
        ) {
          const id = `${record.id}:${fieldPath}`;
          if (!evidence.some((e) => e.id === id))
            evidence.push({
              id,
              fieldPath,
              sourceUrl: sourceUrl + (property ? `#${property}` : ""),
              retrievedAt,
              sourceUpdatedAt: record.modified ?? null,
              normalization,
            });
          return [id];
        }
        function values(
          property: string,
          field: string,
          allowQualified = false,
        ): unknown[] {
          const input = record.claims[property] ?? [];
          if (!Array.isArray(input)) {
            diagnostics.push({ section: field, code: "INVALID_OPTIONAL" });
            return [];
          }
          const all = input,
            rows = all.slice(0, 100).map((v) => statement.safeParse(v));
          if (all.length > 100)
            diagnostics.push({ section: field, code: "LIMIT_REACHED" });
          if (rows.some((r) => !r.success))
            diagnostics.push({ section: field, code: "INVALID_OPTIONAL" });
          const expectedType: Record<string, string> = {
            P577: "time",
            P176: "wikibase-item",
            P1651: "external-id",
            P18: "commonsMedia",
            P393: "string",
            P528: "string",
            P444: "string",
          };
          if (
            rows.some(
              (r) =>
                r.success &&
                r.data.mainsnak.datatype !== expectedType[property],
            )
          )
            diagnostics.push({ section: field, code: "INVALID_OPTIONAL" });
          const usable = rows.flatMap((r) =>
            r.success &&
            r.data.rank !== "deprecated" &&
            r.data.mainsnak.datatype === expectedType[property]
              ? [r.data]
              : [],
          );
          const preferred = usable.filter((r) => r.rank === "preferred"),
            ranked = preferred.length ? preferred : usable;
          if (
            !allowQualified &&
            ranked.some((r) => r.qualifiers && Object.keys(r.qualifiers).length)
          )
            diagnostics.push({ section: field, code: "UNSUPPORTED_SCOPE" });
          return ranked
            .filter(
              (r) =>
                r.mainsnak.snaktype === "value" &&
                (allowQualified ||
                  !r.qualifiers ||
                  !Object.keys(r.qualifiers).length),
            )
            .flatMap((r) =>
              r.mainsnak.datavalue ? [r.mainsnak.datavalue.value] : [],
            );
        }
        function unique<T>(rows: T[]) {
          return [...new Set(rows)];
        }
        const yearValues = values("P577", "releaseYear"),
          validYears = yearValues.flatMap((v) => {
            const d = z
              .object({
                time: z.string().regex(/^\+\d{4}-\d{2}-\d{2}T00:00:00Z$/),
                precision: z.number().int().min(9).max(11),
                before: z.literal(0),
                after: z.literal(0),
                calendarmodel: z.literal(
                  "http://www.wikidata.org/entity/Q1985727",
                ),
              })
              .refine((value) => {
                const year = Number(value.time.slice(1, 5)),
                  month = Number(value.time.slice(6, 8)),
                  day = Number(value.time.slice(9, 11));
                if (
                  year < 1 ||
                  month > 12 ||
                  day > 31 ||
                  (value.precision > 9 && month < 1) ||
                  (value.precision === 11 && day < 1)
                )
                  return false;
                if (month === 0) return day === 0;
                const leap =
                  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
                return (
                  day <=
                  [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
                    month - 1
                  ]
                );
              })
              .safeParse(v);
            return d.success && Number(d.data.time.slice(1, 5)) > 0
              ? [Number(d.data.time.slice(1, 5))]
              : [];
          }),
          years = unique(validYears);
        if (yearValues.length !== validYears.length && yearValues.length)
          diagnostics.push({
            section: "releaseYear",
            code: "INVALID_OPTIONAL",
          });
        const producerValues = values("P176", "producer"),
          producerIds = unique(
            producerValues.flatMap((v) => {
              const p = z.object({ id: itemId }).safeParse(v);
              return p.success ? [p.data.id] : [];
            }),
          );
        if (
          producerIds.length !== producerValues.length ||
          producerIds.length > 10
        )
          diagnostics.push({ section: "producer", code: "LIMIT_REACHED" });
        let producerRows: {
          value: { ref: ReturnType<typeof ref>; name: string };
          evidenceIds: string[];
        }[] = [];
        if (producerIds.length) {
          try {
            const related = parse(
              z.object({ entities: z.record(z.string(), z.unknown()) }),
              await request(
                {
                  action: "wbgetentities",
                  ids: producerIds.slice(0, 10).join("|"),
                  props: "labels",
                  languages: "en|mul",
                  languagefallback: "1",
                },
                operation,
              ),
            );
            producerRows = producerIds.slice(0, 10).flatMap((id) => {
              const label = z
                .object({
                  id: itemId,
                  labels: z.object({
                    en: term.optional(),
                    mul: term.optional(),
                  }),
                })
                .safeParse(related.entities[id]);
              return label.success &&
                label.data.id === id &&
                plain(
                  (label.data.labels.en ?? label.data.labels.mul)?.value ?? "",
                  200,
                )
                ? [
                    {
                      value: {
                        ref: ref(id),
                        name: plain(
                          (label.data.labels.en ?? label.data.labels.mul)!
                            .value,
                          200,
                        ),
                      },
                      evidenceIds: source("producer", "P176"),
                    },
                  ]
                : [];
            });
          } catch (error) {
            if (
              error instanceof ProviderFailure &&
              ["CANCELLED", "TIMEOUT"].includes(error.code)
            )
              throw error;
            diagnostics.push({ section: "producer", code: "INVALID_OPTIONAL" });
          }
        }
        if (producerRows.length < producerIds.length)
          diagnostics.push({ section: "producer", code: "INVALID_OPTIONAL" });
        const youtube = unique(
          values("P1651", "video").flatMap((v) =>
            typeof v === "string" && /^[A-Za-z0-9_-]{11}$/.test(v) ? [v] : [],
          ),
        );
        const observations: AccessoryMetadataResult["observations"] = [];
        for (const [property, label] of [
          ["P18", "Product image (source file page)"],
          ["P393", "Edition observation"],
          ["P528", "Catalog code observation"],
          ["P444", "Rating observation (scale unverified)"],
        ] as const) {
          const rows = values(property, "observations", true);
          for (const value of rows.slice(0, 5)) {
            const parsed =
              typeof value === "string"
                ? value
                : z.object({ text: z.string() }).safeParse(value);
            const text =
              typeof parsed === "string"
                ? parsed
                : parsed.success
                  ? parsed.data.text
                  : null;
            if (text && text.trim()) {
              const value = plain(text, 1000),
                link =
                  property === "P18"
                    ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(text)}`
                    : sourceUrl + `#${property}`;
              if (!value || link.length > 2048) {
                diagnostics.push({
                  section: "observations",
                  code: "INVALID_OPTIONAL",
                });
                continue;
              }
              observations.push({
                label,
                value,
                sourceUrl: link,
                evidenceIds: source(`observation:${property}`, property),
              });
            }
          }
        }
        const result = {
          schemaVersion: 1,
          provider: "WIKIDATA",
          mappingVersion: "1",
          retrievedAt,
          identity: {
            ref: selected,
            name: plain((record.labels.en ?? record.labels.mul)!.value, 200),
            evidenceIds: source("identity"),
          },
          description: cleanDescription
            ? {
                state: "present",
                data: {
                  value: cleanDescription,
                  evidenceIds: source("description", undefined, "PLAIN_TEXT"),
                },
              }
            : {
                state:
                  description.success && !description.data.en
                    ? "absent"
                    : "invalid",
              },
          releaseYear:
            years.length === 1 && validYears.length === yearValues.length
              ? {
                  state: "present",
                  data: {
                    value: years[0],
                    evidenceIds: source("releaseYear", "P577", "PARTIAL_DATE"),
                  },
                }
              : { state: yearValues.length ? "invalid" : "absent" },
          producers: producerRows.length
            ? {
                state:
                  producerRows.length === producerIds.length
                    ? "present"
                    : "limited",
                data: producerRows,
              }
            : { state: producerIds.length ? "invalid" : "absent" },
          videos: youtube.length
            ? {
                state: youtube.length > 20 ? "limited" : "present",
                data: youtube.slice(0, 20).map((id) => ({
                  value: {
                    externalId: id,
                    title: null,
                    video: { provider: "YOUTUBE", id },
                  },
                  evidenceIds: source("video", "P1651"),
                })),
              }
            : { state: "absent" },
          observations,
          evidence,
          diagnostics: [
            ...new Map(
              diagnostics.map((d) => [`${d.section}:${d.code}`, d]),
            ).values(),
          ],
        };
        return parse(accessoryMetadataResult, result);
      });
    },
  };
}
