import "server-only";
import { Prisma } from "../db/generated/client";
import type { TransactionClient } from "../db/transaction";

const runSelect = {
  id: true,
  requestKey: true,
  requestedById: true,
  gameId: true,
  gameReleaseId: true,
  accessoryId: true,
  accessoryVariantId: true,
  targetBaseRevision: true,
  targetSnapshot: true,
  query: true,
  fingerprint: true,
  provider: true,
  pipelineVersion: true,
  snapshotSchemaVersion: true,
  fetchStatus: true,
  runVersion: true,
  attemptCount: true,
  attempts: true,
  operationToken: true,
  leaseUntil: true,
  selectedCandidate: true,
  candidates: true,
  result: true,
  reviewToken: true,
  preparedChoices: true,
  receipt: true,
  failureCode: true,
  startedAt: true,
  completedAt: true,
} as const;
export function findRun(id: string, tx: TransactionClient) {
  return tx.enrichmentRun.findUnique({ where: { id }, select: runSelect });
}
export function findRequest(requestKey: string, tx: TransactionClient) {
  return tx.enrichmentRun.findUnique({
    where: { requestKey },
    select: runSelect,
  });
}
export type Run = NonNullable<Awaited<ReturnType<typeof findRun>>>;
export function createRun(
  data: Prisma.EnrichmentRunUncheckedCreateInput,
  tx: TransactionClient,
) {
  return tx.enrichmentRun.create({ data, select: runSelect });
}
export function updateRun(
  id: string,
  data: Prisma.EnrichmentRunUncheckedUpdateInput,
  tx: TransactionClient,
) {
  return tx.enrichmentRun.update({
    where: { id },
    data: { ...data, runVersion: { increment: 1 } },
    select: runSelect,
  });
}
export async function admission(
  requester: string,
  since: Date,
  now: Date,
  tx: TransactionClient,
) {
  // All service callers hold the shared catalog/workflow guard before admission.
  const [active, recent] = await Promise.all([
    tx.enrichmentRun.count({
      where: {
        requestedById: requester,
        fetchStatus: "RUNNING",
        leaseUntil: { gt: now },
      },
    }),
    tx.enrichmentRun.count({
      where: { requestedById: requester, startedAt: { gte: since } },
    }),
  ]);
  return { active, recent };
}
const suggestionSelect = {
  id: true,
  runId: true,
  fieldPath: true,
  before: true,
  proposed: true,
  sourceSnapshot: true,
  origin: true,
  reviewStatus: true,
  reviewedAt: true,
  confidence: true,
  confidenceMethod: true,
  change: { select: { id: true, rootRevision: true } },
} as const;
export function suggestions(runId: string, tx: TransactionClient) {
  return tx.enrichmentSuggestion.findMany({
    where: { runId },
    select: suggestionSelect,
    orderBy: { id: "asc" },
    take: 33,
  });
}
export type Suggestion = Awaited<ReturnType<typeof suggestions>>[number];
export async function createSuggestions(
  data: Prisma.EnrichmentSuggestionCreateManyInput[],
  tx: TransactionClient,
) {
  if (data.length) await tx.enrichmentSuggestion.createMany({ data });
}
export function decideSuggestions(
  runId: string,
  ids: string[],
  status: "ACCEPTED" | "REJECTED" | "CONFLICT",
  reviewerId: string | null,
  now: Date,
  tx: TransactionClient,
) {
  return tx.enrichmentSuggestion.updateMany({
    where: { runId, id: { in: ids }, reviewStatus: "PENDING" },
    data: { reviewStatus: status, reviewedById: reviewerId, reviewedAt: now },
  });
}
export function fieldOrigins(
  kind: "game" | "release",
  id: string,
  fields: string[],
  tx: TransactionClient,
) {
  return tx.metadataChange.findMany({
    where: {
      ...(kind === "game" ? { gameId: id } : { gameReleaseId: id }),
      fieldPath: { in: fields },
    },
    distinct: ["fieldPath"],
    select: {
      fieldPath: true,
      origin: true,
      after: true,
      snapshotSchemaVersion: true,
    },
    orderBy: { rootRevision: "desc" },
    take: Math.min(fields.length, 32),
  });
}

export function searchCompanies(query: string, tx: TransactionClient) {
  const literal = query.replace(/[\\%_]/g, "\\$&");
  return tx.company.findMany({
    where: {
      archivedAt: null,
      name: { contains: literal, mode: "insensitive" },
    },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 25,
  });
}
