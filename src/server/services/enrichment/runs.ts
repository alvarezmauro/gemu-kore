import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrivateAccessContext } from "@/server/auth/access";
import { getAccessoryMetadataProvider } from "@/server/providers/accessory-metadata";
import type { AccessoryMetadataProvider } from "@/server/providers/accessory-metadata/contracts";
import {
  retrieve,
  selectedReference,
  resultData,
  searchData,
} from "./provider-data";
import { targetPointer } from "@/server/repositories/catalog/enrichment";
import { getGameMetadataProvider } from "@/server/providers/game-metadata";
import {
  type GameMetadataProvider,
  type ProviderErrorCode,
} from "@/server/providers/game-metadata/contracts";
import * as repository from "@/server/repositories/enrichment";
import {
  chooseEnrichmentCandidate,
  runCommand,
  startEnrichment,
} from "@/features/enrichment/validation";
import {
  authorizedRun,
  bounded,
  equal,
  guarded,
  hash,
  json,
  loadTarget,
  parse,
  recoverExpired,
  targetOf,
  unchanged,
} from "./common";
import { EnrichmentError } from "./errors";
import { getEnrichmentReview } from "./suggestions";

const active = new Map<string, AbortController>();
const providerCodes = new Set<ProviderErrorCode>([
  "NOT_CONFIGURED",
  "INVALID_INPUT",
  "NOT_FOUND",
  "AUTHENTICATION_FAILED",
  "RATE_LIMITED",
  "TIMEOUT",
  "CANCELLED",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
]);
const retryable = new Set([
  "NOT_CONFIGURED",
  "RATE_LIMITED",
  "TIMEOUT",
  "CANCELLED",
  "UNAVAILABLE",
]);
const querySchema = z.strictObject({ query: z.string().min(2).max(200) });
type Claim = { run: repository.Run; token: string };
function completedAttempts(run: repository.Run, code: string, now: Date) {
  const attempts = z.array(z.json()).parse(run.attempts);
  const last = attempts.at(-1);
  if (last && typeof last === "object" && !Array.isArray(last))
    attempts[attempts.length - 1] = {
      ...last,
      code,
      completedAt: now.toISOString(),
    };
  return json(attempts);
}
async function admit(
  userId: string,
  fresh: boolean,
  now: Date,
  tx: Parameters<typeof repository.admission>[3],
) {
  const limits = await repository.admission(
    userId,
    new Date(now.getTime() - 3600000),
    now,
    tx,
  );
  if (limits.active) throw new EnrichmentError("IN_PROGRESS");
  if (fresh && limits.recent >= 20) throw new EnrichmentError("RATE_LIMITED");
}
export function createEnrichmentRunner(
  getProvider: () => GameMetadataProvider = getGameMetadataProvider,
  getAccessoryProvider: () => AccessoryMetadataProvider = getAccessoryMetadataProvider,
) {
  async function execute(
    context: PrivateAccessContext,
    claim: Claim,
    deadlineAt: number,
    signal?: AbortSignal,
  ) {
    const { run, token } = claim;
    const controller = new AbortController();
    active.set(token, controller);
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      Math.max(1, deadlineAt - performance.now()),
    );
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    let data: unknown;
    let code: string | null = null;
    try {
      const selected = run.selectedCandidate ? selectedReference(run) : null;
      const providerContext = {
        signal: controller.signal,
        deadlineAt,
      };
      // Race also bounds non-cooperative adapters; generation checks fence late results.
      let removeAbort = () => {};
      try {
        const aborted = new Promise<never>((_, reject) => {
          const abort = () => reject(new Error("Aborted"));
          removeAbort = () =>
            controller.signal.removeEventListener("abort", abort);
          controller.signal.addEventListener("abort", abort, { once: true });
          if (controller.signal.aborted) abort();
        });
        const result = await Promise.race([
          aborted,
          retrieve(
            run,
            querySchema.parse(run.query).query,
            providerContext,
            getProvider,
            getAccessoryProvider,
          ),
        ]);
        if (!result.ok)
          code = providerCodes.has(result.error.code)
            ? result.error.code
            : "INVALID_RESPONSE";
        else if (selected) {
          const metadata = resultData(run, result.data);
          if (!equal(metadata.identity.ref, selected))
            throw new Error("Mismatched identity");
          data = metadata;
        } else data = searchData(run, result.data);
        if (data)
          bounded({
            target: run.targetSnapshot,
            query: run.query,
            candidates: run.candidates,
            result: data,
          });
      } finally {
        removeAbort();
      }
    } catch {
      code = controller.signal.aborted
        ? timedOut
          ? "TIMEOUT"
          : "CANCELLED"
        : "INVALID_RESPONSE";
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      active.delete(token);
    }
    try {
      await guarded(
        context,
        async (actor, tx) => {
          const current = await recoverExpired(
            await authorizedRun(run.id, actor, tx),
            tx,
            new Date(),
          );
          if (
            current.operationToken !== token ||
            current.fetchStatus !== "RUNNING"
          )
            return;
          const now = new Date();
          if (performance.now() >= deadlineAt) code = "TIMEOUT";
          if (signal?.aborted) code = "CANCELLED";
          if (!unchanged(current, await loadTarget(targetOf(current), tx)))
            code = "CONFLICT";
          if (code) {
            await repository.updateRun(
              run.id,
              {
                fetchStatus: "FAILED",
                failureCode: code,
                completedAt: now,
                operationToken: null,
                leaseUntil: null,
                attempts: completedAttempts(current, code, now),
              },
              tx,
            );
            return;
          }
          bounded({
            target: current.targetSnapshot,
            query: current.query,
            candidates: current.candidates,
            result: data,
          });
          if (performance.now() >= deadlineAt)
            throw new EnrichmentError("TIMEOUT");
          if (current.selectedCandidate) {
            await repository.updateRun(
              run.id,
              {
                result: json(data),
                fetchStatus: "COMPLETED",
                completedAt: now,
                operationToken: null,
                leaseUntil: null,
                attempts: completedAttempts(current, "COMPLETED", now),
              },
              tx,
            );
          } else {
            const page = searchData(current, data);
            await repository.updateRun(
              run.id,
              {
                candidates: json(page),
                fetchStatus: page.candidates.length
                  ? "NEEDS_SELECTION"
                  : "COMPLETED",
                completedAt: page.candidates.length ? null : now,
                operationToken: null,
                leaseUntil: null,
                attempts: completedAttempts(
                  current,
                  page.candidates.length ? "NEEDS_SELECTION" : "COMPLETED",
                  now,
                ),
              },
              tx,
            );
          }
        },
        false,
        code ? undefined : deadlineAt,
      );
    } catch (error) {
      if (!(error instanceof EnrichmentError) || error.code !== "TIMEOUT")
        throw error;
      // A deadline can roll back publication. Retain only the fenced failure in a short cleanup transaction.
      await guarded(context, async (actor, tx) => {
        const current = await authorizedRun(run.id, actor, tx);
        if (
          current.operationToken !== token ||
          current.fetchStatus !== "RUNNING"
        )
          return;
        const now = new Date();
        await repository.updateRun(
          run.id,
          {
            fetchStatus: "FAILED",
            failureCode: "TIMEOUT",
            operationToken: null,
            leaseUntil: null,
            completedAt: now,
            attempts: completedAttempts(current, "TIMEOUT", now),
          },
          tx,
        );
      });
    }
  }
  async function start(
    context: PrivateAccessContext,
    input: unknown,
    signal?: AbortSignal,
  ) {
    const deadlineAt = performance.now() + 45000;
    const command = parse(startEnrichment, input);
    const fingerprint = hash({
      target: command.target,
      expectedRevision: command.expectedRevision,
      query: command.query,
    });
    const claim = await guarded(
      context,
      async (actor, tx): Promise<Claim | { run: repository.Run }> => {
        const previous = await repository.findRequest(command.requestKey, tx);
        if (previous) {
          if (
            previous.requestedById !== actor.userId ||
            previous.fingerprint !== fingerprint
          )
            throw new EnrichmentError("INVALID_INPUT");
          return { run: await recoverExpired(previous, tx, new Date()) };
        }
        const target = await loadTarget(command.target, tx);
        if (target.archived || target.revision !== command.expectedRevision)
          throw new EnrichmentError("CONFLICT");
        const now = new Date();
        await admit(actor.userId, true, now, tx);
        bounded(target);
        const refs = z
          .array(
            z.object({
              provider: z.string(),
              providerObjectType: z.string().nullable(),
              externalId: z.string().nullable(),
            }),
          )
          .parse(target.fields.references);
        const accessory =
          command.target.kind === "accessory" ||
          command.target.kind === "variant";
        const provider = accessory ? "WIKIDATA" : "IGDB";
        const objectType = accessory ? "ITEM" : "GAME";
        const accepted = refs.filter(
          (ref) =>
            ref.provider.toUpperCase() === provider &&
            ref.providerObjectType?.toUpperCase() === objectType &&
            ref.externalId &&
            (accessory ? /^Q[1-9][0-9]{0,15}$/ : /^[1-9][0-9]{0,15}$/).test(
              ref.externalId,
            ),
        );
        const selected =
          accepted.length === 1
            ? {
                provider,
                objectType,
                externalId: accepted[0].externalId!,
              }
            : null;
        const token = randomUUID();
        const run = await repository.createRun(
          {
            requestKey: command.requestKey,
            requestedById: actor.userId,
            ...targetPointer(command.target.kind, target.target.id),
            targetBaseRevision: target.revision,
            targetSnapshot: json(target),
            query: json({ query: command.query }),
            fingerprint,
            provider,
            fetchStatus: "RUNNING",
            attemptCount: 1,
            attempts: json([{ number: 1, startedAt: now.toISOString() }]),
            operationToken: token,
            leaseUntil: new Date(now.getTime() + 90000),
            ...(selected ? { selectedCandidate: json(selected) } : {}),
          },
          tx,
        );
        return { run, token };
      },
    );
    if ("token" in claim) await execute(context, claim, deadlineAt, signal);
    return getEnrichmentReview(context, { runId: claim.run.id });
  }
  async function selectCandidate(
    context: PrivateAccessContext,
    input: unknown,
    signal?: AbortSignal,
  ) {
    const deadlineAt = performance.now() + 45000;
    const command = parse(chooseEnrichmentCandidate, input);
    const claim = await guarded(
      context,
      async (actor, tx): Promise<Claim | null> => {
        const run = await recoverExpired(
          await authorizedRun(command.runId, actor, tx),
          tx,
          new Date(),
        );
        if (run.selectedCandidate) {
          if (selectedReference(run).externalId !== command.externalId)
            throw new EnrichmentError("STALE");
          return null;
        }
        if (
          run.runVersion !== command.expectedRunVersion ||
          run.fetchStatus !== "NEEDS_SELECTION" ||
          !run.candidates
        )
          throw new EnrichmentError("STALE");
        const candidate = searchData(run).candidates.find(
          (c) => c.identity.ref.externalId === command.externalId,
        );
        if (!candidate) throw new EnrichmentError("INVALID_INPUT");
        if (!unchanged(run, await loadTarget(targetOf(run), tx)))
          throw new EnrichmentError("CONFLICT");
        const now = new Date();
        await admit(run.requestedById ?? actor.userId, false, now, tx);
        const token = randomUUID();
        const claimed = await repository.updateRun(
          run.id,
          {
            selectedCandidate: json(candidate.identity.ref),
            fetchStatus: "RUNNING",
            completedAt: null,
            failureCode: null,
            operationToken: token,
            leaseUntil: new Date(now.getTime() + 90000),
          },
          tx,
        );
        return { run: claimed, token };
      },
    );
    if (claim) await execute(context, claim, deadlineAt, signal);
    return getEnrichmentReview(context, { runId: command.runId });
  }
  async function retry(
    context: PrivateAccessContext,
    input: unknown,
    signal?: AbortSignal,
  ) {
    const deadlineAt = performance.now() + 45000;
    const command = parse(runCommand, input);
    const claim = await guarded(
      context,
      async (actor, tx): Promise<Claim | null> => {
        const original = await authorizedRun(command.runId, actor, tx);
        const run = await recoverExpired(original, tx, new Date());
        if (command.expectedRunVersion < original.runVersion) return null;
        if (
          command.expectedRunVersion !== original.runVersion ||
          run.fetchStatus !== "FAILED" ||
          !retryable.has(run.failureCode ?? "") ||
          run.attemptCount >= 3
        )
          throw new EnrichmentError("STALE");
        if (!unchanged(run, await loadTarget(targetOf(run), tx)))
          throw new EnrichmentError("CONFLICT");
        const now = new Date();
        await admit(run.requestedById ?? actor.userId, false, now, tx);
        const token = randomUUID();
        const attempts = z.array(z.json()).parse(run.attempts);
        attempts.push({
          number: run.attemptCount + 1,
          startedAt: now.toISOString(),
        });
        return {
          run: await repository.updateRun(
            run.id,
            {
              fetchStatus: "RUNNING",
              failureCode: null,
              completedAt: null,
              operationToken: token,
              leaseUntil: new Date(now.getTime() + 90000),
              attemptCount: run.attemptCount + 1,
              attempts: json(attempts),
            },
            tx,
          ),
          token,
        };
      },
    );
    if (claim) await execute(context, claim, deadlineAt, signal);
    return getEnrichmentReview(context, { runId: command.runId });
  }
  async function cancel(context: PrivateAccessContext, input: unknown) {
    const command = parse(runCommand, input);
    const token = await guarded(context, async (actor, tx) => {
      const run = await authorizedRun(command.runId, actor, tx);
      if (run.fetchStatus === "FAILED" && run.failureCode === "CANCELLED")
        return null;
      if (
        command.expectedRunVersion !== run.runVersion ||
        !["RUNNING", "PENDING", "NEEDS_SELECTION"].includes(run.fetchStatus)
      )
        throw new EnrichmentError("STALE");
      const now = new Date();
      await repository.updateRun(
        run.id,
        {
          fetchStatus: "FAILED",
          failureCode: "CANCELLED",
          operationToken: null,
          leaseUntil: null,
          completedAt: now,
          attempts: completedAttempts(run, "CANCELLED", now),
        },
        tx,
      );
      return run.operationToken;
    });
    if (token) active.get(token)?.abort();
    return getEnrichmentReview(context, { runId: command.runId });
  }
  return { start, selectCandidate, retry, cancel };
}
