import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type { GameMetadataConfiguration } from "../../config/game-metadata";
import {
  gameFetchInput,
  gameSearchInput,
  type GameFetchInput,
  type GameMetadataProvider,
  type GameSearchInput,
  type ProviderContext,
} from "./contracts";
import {
  checkOperation,
  DataScheduler,
  defaultClock,
  failure,
  ProviderFailure,
  requestJson,
  runOperation,
  untilAbort,
  type Operation,
  type ProviderClock,
  type Transport,
} from "./http";
import { mapGame, mapSearch, parseGameRows, providerId } from "./igdb-mapping";

const identityFields = [
  "id",
  "name",
  "url",
  "updated_at",
  "alternative_names.name",
  "game_type.type",
  "parent_game",
  "version_parent",
  "platforms.name",
  "platforms.url",
  "platforms.updated_at",
  "first_release_date",
  "summary",
].join(",");
const detailFields = [
  identityFields,
  "release_dates.game",
  "release_dates.platform.name",
  "release_dates.date_format.format",
  "release_dates.release_region.region",
  "release_dates.status.name",
  "release_dates.date",
  "release_dates.y",
  "release_dates.m",
  "release_dates.d",
  "release_dates.updated_at",
  "involved_companies.game",
  "involved_companies.company.name",
  "involved_companies.company.url",
  "involved_companies.company.updated_at",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.porting",
  "involved_companies.supporting",
  "involved_companies.updated_at",
  ...["cover", "screenshots", "artworks"].flatMap((key) =>
    ["game", "image_id", "width", "height"].map((field) => `${key}.${field}`),
  ),
  "videos.game",
  "videos.video_id",
  "videos.name",
  "rating",
  "rating_count",
  "aggregated_rating",
  "aggregated_rating_count",
  "total_rating",
  "total_rating_count",
].join(",");
const tokenSchema = z.object({
  access_token: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[A-Za-z0-9._~-]+$/),
  expires_in: z.number().int().positive().max(315360000),
  token_type: z.string().refine((value) => value.toLowerCase() === "bearer"),
});
const cursorSchema = z.strictObject({
  version: z.literal(1),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  offset: z.number().int().min(1).max(1000),
});

type Dependencies = { transport?: Transport; clock?: ProviderClock };
type Token = { value: string; expiresAt: number };
type TokenFlight = {
  promise: Promise<Token>;
  controller: AbortController;
  waiters: number;
};

function fingerprint(input: GameSearchInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        input.query,
        input.platform?.externalId ?? null,
        input.year ?? null,
        input.limit,
      ]),
    )
    .digest("hex");
}
function offset(input: GameSearchInput): number {
  if (!input.cursor) return 0;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(input.cursor)) throw new Error();
    const decoded = Buffer.from(input.cursor, "base64url");
    if (decoded.toString("base64url") !== input.cursor) throw new Error();
    const cursor = cursorSchema.parse(JSON.parse(decoded.toString("utf8")));
    if (cursor.fingerprint !== fingerprint(input)) throw new Error();
    return cursor.offset;
  } catch {
    throw new ProviderFailure("INVALID_INPUT");
  }
}
function nextCursor(input: GameSearchInput, next: number): string | null {
  return next <= 1000
    ? Buffer.from(
        JSON.stringify({
          version: 1,
          fingerprint: fingerprint(input),
          offset: next,
        }),
      ).toString("base64url")
    : null;
}

// Not an authorization boundary. The eventual service must authorize public-catalog
// lookup terms and review scope before using this server-only capability.
export function createIgdbGameMetadataProvider(
  configuration: GameMetadataConfiguration | null,
  dependencies: Dependencies = {},
): GameMetadataProvider {
  const transport: Transport =
    dependencies.transport ?? ((url, init) => fetch(url, init));
  const clock = dependencies.clock ?? defaultClock;
  const scheduler = new DataScheduler(clock);
  let cachedToken: Token | undefined;
  let tokenFlight: TokenFlight | undefined;

  async function token(operation: Operation): Promise<Token> {
    checkOperation(operation, clock);
    if (cachedToken && cachedToken.expiresAt > clock.now()) return cachedToken;
    if (!configuration) throw new ProviderFailure("NOT_CONFIGURED");
    if (!tokenFlight) {
      if (++operation.tokenAttempts > 2)
        throw new ProviderFailure("AUTHENTICATION_FAILED");
      const controller = new AbortController();
      // Acquisition is shared; each waiter cancels independently. No waiters -> abort.
      const context = {
        signal: controller.signal,
        deadlineAt: Math.min(operation.deadlineAt, clock.now() + 8000),
      };
      const flight: TokenFlight = {
        controller,
        waiters: 0,
        promise: Promise.resolve({ value: "", expiresAt: 0 }),
      };
      tokenFlight = flight;
      flight.promise = (async () => {
        const body = new URLSearchParams({
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          grant_type: "client_credentials",
        });
        const response = await requestJson(
          transport,
          clock,
          context,
          "https://id.twitch.tv/oauth2/token",
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: body.toString(),
          },
          64 * 1024,
        );
        if (response.status === 429)
          throw new ProviderFailure("RATE_LIMITED", response.retryAfterSeconds);
        if (response.status >= 500) throw new ProviderFailure("UNAVAILABLE");
        if (response.status !== 200)
          throw new ProviderFailure("AUTHENTICATION_FAILED");
        const parsed = tokenSchema.safeParse(response.data);
        if (!parsed.success) throw new ProviderFailure("INVALID_RESPONSE");
        const margin = Math.min(60, parsed.data.expires_in / 10);
        const value = {
          value: parsed.data.access_token,
          expiresAt: clock.now() + (parsed.data.expires_in - margin) * 1000,
        };
        if (controller.signal.aborted) throw new ProviderFailure("CANCELLED");
        cachedToken = value;
        return value;
      })().finally(() => {
        if (tokenFlight === flight) tokenFlight = undefined;
      });
    }
    const flight = tokenFlight;
    flight.waiters++;
    try {
      return await untilAbort(flight.promise, operation.signal);
    } finally {
      if (--flight.waiters === 0 && tokenFlight === flight) {
        flight.controller.abort();
        tokenFlight = undefined;
      }
    }
  }

  async function request(
    operation: Operation,
    endpoint: "games" | "game_time_to_beats",
    body: string,
  ): Promise<unknown> {
    if (!configuration) throw new ProviderFailure("NOT_CONFIGURED");
    for (let attempt = 0; attempt < 2; attempt++) {
      checkOperation(operation, clock);
      const current = await token(operation);
      if (
        operation.dataAttempts >= 6 ||
        operation.dataAttempts + operation.tokenAttempts >= 8
      )
        throw new ProviderFailure("UNAVAILABLE");
      let response;
      try {
        response = await scheduler.run(operation, async () => {
          operation.dataAttempts++;
          return requestJson(
            transport,
            clock,
            operation,
            `https://api.igdb.com/v4/${endpoint}`,
            {
              headers: {
                "Client-ID": configuration.clientId,
                Authorization: `Bearer ${current.value}`,
                Accept: "application/json",
                "Content-Type": "text/plain",
              },
              body,
            },
            2 * 1024 * 1024,
          );
        });
      } catch (error) {
        if (
          !(error instanceof ProviderFailure) ||
          error.code !== "UNAVAILABLE" ||
          attempt > 0
        )
          throw error;
        await clock.sleep(250, operation.signal);
        continue;
      }
      if (response.status === 401) {
        if (operation.refreshed || attempt > 0)
          throw new ProviderFailure("AUTHENTICATION_FAILED");
        operation.refreshed = true;
        // A late 401 must not evict a newer token minted for another caller.
        if (cachedToken === current) cachedToken = undefined;
        continue;
      }
      if (response.status === 403)
        throw new ProviderFailure("AUTHENTICATION_FAILED");
      if (response.status === 404) throw new ProviderFailure("NOT_FOUND");
      if (response.status === 429 || response.status >= 500) {
        const seconds = response.retryAfterSeconds ?? 1;
        if (response.status === 429) scheduler.coolDown(seconds);
        const code = response.status === 429 ? "RATE_LIMITED" : "UNAVAILABLE";
        if (attempt > 0 || clock.now() + seconds * 1000 >= operation.deadlineAt)
          throw new ProviderFailure(code, response.retryAfterSeconds);
        await clock.sleep(seconds * 1000, operation.signal);
        continue;
      }
      if (response.status !== 200)
        throw new ProviderFailure("INVALID_RESPONSE");
      return response.data;
    }
    throw new ProviderFailure("UNAVAILABLE");
  }

  return {
    id: "IGDB",
    async search(input: GameSearchInput, context: ProviderContext) {
      const parsed = gameSearchInput.safeParse(input);
      if (!parsed.success) return failure("INVALID_INPUT");
      return runOperation(context, clock, async (operation) => {
        const query = parsed.data;
        if (query.platform) {
          if (query.platform.objectType !== "PLATFORM")
            throw new ProviderFailure("INVALID_INPUT");
          providerId(query.platform.externalId);
        }
        const position = offset(query);
        if (!configuration) throw new ProviderFailure("NOT_CONFIGURED");
        // APICalypse quoted literals use backslash escaping, never raw query syntax.
        const literal = query.query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const filters: string[] = [];
        if (query.platform)
          filters.push(`platforms = (${query.platform.externalId})`);
        if (query.year) {
          const start = new Date(0);
          start.setUTCFullYear(query.year, 0, 1);
          const end = new Date(0);
          end.setUTCFullYear(query.year + 1, 0, 1);
          filters.push(
            `first_release_date >= ${Math.floor(start.getTime() / 1000)} & first_release_date < ${Math.floor(end.getTime() / 1000)}`,
          );
        }
        const body = `fields ${identityFields}; search "${literal}"; ${filters.length ? `where ${filters.join(" & ")}; ` : ""}limit ${query.limit}; offset ${position};`;
        const rows = parseGameRows(
          await request(operation, "games", body),
          query.limit,
        );
        checkOperation(operation, clock);
        return mapSearch(
          rows,
          new Date(clock.wallNow()).toISOString(),
          rows.length === query.limit
            ? nextCursor(query, position + rows.length)
            : null,
        );
      });
    },
    async fetch(input: GameFetchInput, context: ProviderContext) {
      const parsed = gameFetchInput.safeParse(input);
      if (!parsed.success || parsed.data.game.objectType !== "GAME")
        return failure("INVALID_INPUT");
      return runOperation(context, clock, async (operation) => {
        const id = providerId(parsed.data.game.externalId);
        if (!configuration) throw new ProviderFailure("NOT_CONFIGURED");
        const rows = parseGameRows(
          await request(
            operation,
            "games",
            `fields ${detailFields}; where id = ${id}; limit 1;`,
          ),
          1,
        );
        if (!rows.length) throw new ProviderFailure("NOT_FOUND");
        if (rows[0].id !== Number(id))
          throw new ProviderFailure("INVALID_RESPONSE");
        let playtime: unknown;
        try {
          playtime = await request(
            operation,
            "game_time_to_beats",
            `fields id,game_id,hastily,normally,completely,count,updated_at; where game_id = ${id}; limit 1;`,
          );
        } catch (error) {
          // Optional-section failure retains the core evidence. Cancellation/deadline
          // and credential failures still fail the operation, rather than hiding them.
          if (
            !(error instanceof ProviderFailure) ||
            ![
              "UNAVAILABLE",
              "NOT_FOUND",
              "RATE_LIMITED",
              "INVALID_RESPONSE",
            ].includes(error.code)
          )
            throw error;
        }
        checkOperation(operation, clock);
        return mapGame(
          rows[0],
          playtime,
          new Date(clock.wallNow()).toISOString(),
        );
      });
    },
  };
}
