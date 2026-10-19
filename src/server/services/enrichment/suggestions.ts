import "server-only";
import { z } from "zod";
import type { PrivateAccessContext } from "@/server/auth/access";
import { Prisma } from "@/server/db/generated/client";
import * as repository from "@/server/repositories/enrichment";
import * as catalog from "@/server/repositories/catalog/enrichment";
import {
  gameMetadataResult,
  gameSearchPage,
  providerObjectReference,
  validateProviderOutput,
} from "@/server/providers/game-metadata/contracts";
import {
  prepareEnrichment,
  rejectEnrichment,
  runIdentity,
  type ProposalField,
} from "@/features/enrichment/validation";
import type {
  EnrichmentReceipt,
  EnrichmentReview,
} from "@/features/enrichment/contracts";
import {
  authorizedRun,
  bounded,
  equal,
  guarded,
  hash,
  json,
  loadTarget,
  manualReplacement,
  parse,
  recoverExpired,
  snapshotSchema,
  targetOf,
  unchanged,
} from "./common";
import { buildProposals } from "./proposals";
import { EnrichmentError } from "./errors";

const baseUnavailable = [
  {
    field: "rating",
    reason: "Rating evidence has no typed catalog storage yet.",
  },
  {
    field: "images",
    reason:
      "Image candidates require private validated ingestion before attachment.",
  },
];
export async function getEnrichmentReview(
  context: PrivateAccessContext,
  input: unknown,
): Promise<EnrichmentReview> {
  const { runId } = parse(runIdentity, input);
  return guarded(context, async (actor, tx) => {
    let run = await recoverExpired(
      await authorizedRun(runId, actor, tx),
      tx,
      new Date(),
    );
    const current = await loadTarget(targetOf(run), tx);
    let suggestions = await repository.suggestions(run.id, tx);
    if (suggestions.length > 32) throw new EnrichmentError("UNAVAILABLE");
    if (
      !unchanged(run, current) &&
      suggestions.some((suggestion) => suggestion.reviewStatus === "PENDING")
    ) {
      await repository.decideSuggestions(
        run.id,
        suggestions
          .filter((s) => s.reviewStatus === "PENDING")
          .map((s) => s.id),
        "CONFLICT",
        null,
        new Date(),
        tx,
      );
      run = await repository.updateRun(run.id, {}, tx);
      suggestions = await repository.suggestions(run.id, tx);
    }
    const origins = new Map(
      (
        await repository.fieldOrigins(targetOf(run).kind, current.target.id, tx)
      ).map((item) => [item.fieldPath, item.origin]),
    );
    const metadata = run.result
      ? validateProviderOutput(gameMetadataResult, run.result)
      : null;
    const candidates = run.candidates
      ? validateProviderOutput(gameSearchPage, run.candidates).candidates
      : [];
    const selected = run.selectedCandidate
      ? providerObjectReference.parse(run.selectedCandidate)
      : null;
    const prepared = run.preparedChoices as {
      unavailable?: { field: string; reason: string }[];
    } | null;
    const availableFields: ProposalField[] = !metadata
      ? []
      : current.target.kind === "release"
        ? ["references"]
        : [
            "name",
            "aliases",
            "references",
            ...("data" in metadata.description ? ["description" as const] : []),
            ...("data" in metadata.playtime ? ["playtime" as const] : []),
            ...("data" in metadata.videos ? ["trailer" as const] : []),
            ...("data" in metadata.companies &&
            metadata.companies.data.some((c) => c.value.role === "DEVELOPER")
              ? ["developers" as const]
              : []),
          ];
    const companyIds = new Set<string>();
    for (const value of [
      current.fields.developers,
      ...suggestions
        .filter((s) => s.fieldPath === "developers")
        .flatMap((s) => [s.before, s.proposed]),
    ]) {
      const parsed = z
        .array(z.object({ companyId: z.uuid() }))
        .safeParse(value);
      if (parsed.success)
        for (const row of parsed.data) companyIds.add(row.companyId);
    }
    const companyNames = await catalog.companies([...companyIds], tx);
    return {
      companies: companyNames.map(({ id, name }) => ({ id, name })),
      id: run.id,
      target: current.target,
      label: current.label,
      baseRevision: run.targetBaseRevision,
      currentRevision: current.revision,
      runVersion: run.runVersion,
      fetchStatus: run.fetchStatus,
      failureCode: run.failureCode,
      attemptCount: run.attemptCount,
      reviewToken: run.reviewToken,
      candidates: candidates.map((candidate) => ({
        externalId: candidate.identity.ref.externalId,
        name: candidate.identity.name,
        classification: candidate.identity.classification,
        platforms:
          "data" in candidate.platforms
            ? candidate.platforms.data.map((platform) => platform.value.name)
            : [],
        year:
          "data" in candidate.firstRelease
            ? candidate.firstRelease.data.value.year
            : null,
        description:
          "data" in candidate.descriptionExcerpt
            ? candidate.descriptionExcerpt.data.value
            : null,
      })),
      selectedCandidate: selected
        ? {
            externalId: selected.externalId,
            name: metadata?.identity.name ?? current.label,
          }
        : null,
      availableFields,
      trailerChoices:
        metadata && "data" in metadata.videos
          ? metadata.videos.data.map((video) => ({
              externalId: video.value.ref.externalId,
              title: video.value.title,
            }))
          : [],
      companyChoices:
        metadata && "data" in metadata.companies
          ? metadata.companies.data
              .filter((company) => company.value.role === "DEVELOPER")
              .map((company) => ({
                externalId: company.value.ref.externalId,
                name: company.value.name,
              }))
          : [],
      suggestions: suggestions.map((suggestion) => ({
        id: suggestion.id,
        fieldPath: suggestion.fieldPath as ProposalField,
        current: current.fields[suggestion.fieldPath] ?? null,
        before: z.json().parse(suggestion.before),
        proposed: z.json().parse(suggestion.proposed),
        source: z.json().parse(suggestion.sourceSnapshot),
        confidence: null,
        manualReplacementRequired: manualReplacement(
          suggestion.before,
          origins.get(suggestion.fieldPath),
        ),
        status: suggestion.reviewStatus,
      })),
      unavailable: [
        ...baseUnavailable,
        ...(current.target.kind === "release"
          ? [
              {
                field: "releaseMetadata",
                reason:
                  "This provider supplies broad Game evidence; it does not prove the physical edition. Only the explicit reference mapping is currently applicable.",
              },
            ]
          : []),
        ...(prepared?.unavailable ?? []),
        ...(run.fetchStatus === "COMPLETED" && !metadata
          ? [{ field: "lookup", reason: "No matching candidates were found." }]
          : []),
      ],
      stages: [
        {
          name: "structured",
          status: metadata || run.candidates ? "COMPLETED" : "SKIPPED",
          reason: metadata || run.candidates ? null : run.failureCode,
        },
        {
          name: "web",
          status: "SKIPPED",
          reason: "No configured web evidence adapter.",
        },
        { name: "ai", status: "SKIPPED", reason: "No configured AI adapter." },
      ],
      canAccept: actor.role === "ADMIN",
      canApply:
        actor.role === "ADMIN" &&
        unchanged(run, current) &&
        Boolean(run.reviewToken) &&
        suggestions.some((s) => s.reviewStatus === "PENDING"),
      receipt: run.receipt as EnrichmentReceipt | null,
    };
  });
}

export async function prepareEnrichmentReview(
  context: PrivateAccessContext,
  input: unknown,
) {
  const choice = parse(prepareEnrichment, input);
  // Stable ordering makes equivalent retries comparable without changing display values.
  choice.fields.sort();
  choice.companyBindings.sort((a, b) =>
    a.externalId.localeCompare(b.externalId),
  );
  await guarded(context, async (actor, tx) => {
    const run = await authorizedRun(choice.runId, actor, tx);
    if (run.reviewToken) {
      const old = run.preparedChoices as { input?: unknown } | null;
      if (
        !equal(old?.input, {
          fields: choice.fields,
          companyBindings: choice.companyBindings,
          trailerExternalId: choice.trailerExternalId ?? null,
        })
      )
        throw new EnrichmentError("STALE");
      return;
    }
    if (
      run.runVersion !== choice.expectedRunVersion ||
      run.fetchStatus !== "COMPLETED" ||
      !run.result
    )
      throw new EnrichmentError("STALE");
    const target = await loadTarget(targetOf(run), tx);
    if (!unchanged(run, target)) throw new EnrichmentError("CONFLICT");
    const metadata = validateProviderOutput(gameMetadataResult, run.result);
    const developerIds =
      "data" in metadata.companies
        ? metadata.companies.data
            .filter((company) => company.value.role === "DEVELOPER")
            .map((company) => company.value.ref.externalId)
        : [];
    if (
      choice.companyBindings.some(
        (binding) => !developerIds.includes(binding.externalId),
      )
    )
      throw new EnrichmentError("INVALID_INPUT");
    const foundMappings = choice.fields.includes("developers")
      ? await catalog.mappedCompanies(developerIds, tx)
      : [];
    const mappings = foundMappings.length >= 61 ? [] : foundMappings;
    const selected = developerIds.flatMap((externalId) => {
      const explicit = choice.companyBindings.find(
        (binding) => binding.externalId === externalId,
      );
      const mappedIds = [
        ...new Set(
          mappings
            .filter((mapping) => mapping.externalId === externalId)
            .flatMap((mapping) =>
              mapping.companyId ? [mapping.companyId] : [],
            ),
        ),
      ];
      return explicit
        ? [explicit]
        : mappedIds.length === 1
          ? [{ externalId, companyId: mappedIds[0] }]
          : [];
    });
    const companies = await catalog.companies(
      [...new Set(selected.map((value) => value.companyId))],
      tx,
    );
    if (
      selected.some(
        (binding) =>
          !companies.some(
            (company) =>
              company.id === binding.companyId && !company.archivedAt,
          ),
      )
    )
      throw new EnrichmentError("INVALID_INPUT");
    const bindings = selected.map((binding) => ({
      ...binding,
      revision: companies.find((company) => company.id === binding.companyId)!
        .revision,
    }));
    const { proposals, unavailable } = buildProposals(
      target,
      metadata,
      choice,
      bindings,
    );
    // Freeze base values only from the original unchanged canonical snapshot.
    const base = snapshotSchema.parse(run.targetSnapshot);
    if (
      proposals.some(
        (proposal) =>
          !equal(proposal.before, base.fields[proposal.fieldPath] ?? null),
      )
    )
      throw new EnrichmentError("CONFLICT");
    const frozen = {
      input: {
        fields: choice.fields,
        companyBindings: choice.companyBindings,
        trailerExternalId: choice.trailerExternalId ?? null,
      },
      unavailable,
    };
    bounded({
      target: run.targetSnapshot,
      query: run.query,
      candidates: run.candidates,
      result: run.result,
      proposals,
      choices: frozen,
    });
    const reviewToken = hash({
      runId: run.id,
      pipelineVersion: run.pipelineVersion,
      snapshotSchemaVersion: run.snapshotSchemaVersion,
      revision: run.targetBaseRevision,
      choices: frozen.input,
      proposals,
    });
    await repository.createSuggestions(
      proposals.map((proposal) => ({
        id: proposal.id,
        runId: run.id,
        fieldPath: proposal.fieldPath,
        before:
          proposal.before === null ? Prisma.JsonNull : json(proposal.before),
        proposed:
          proposal.proposed === null
            ? Prisma.JsonNull
            : json(proposal.proposed),
        sourceSnapshot: json(proposal.sourceSnapshot),
        origin: proposal.origin,
      })),
      tx,
    );
    await repository.updateRun(
      run.id,
      { reviewToken, preparedChoices: json(frozen) },
      tx,
    );
  });
  return getEnrichmentReview(context, { runId: choice.runId });
}

export async function rejectEnrichmentSuggestions(
  context: PrivateAccessContext,
  input: unknown,
) {
  const command = parse(rejectEnrichment, input);
  await guarded(context, async (actor, tx) => {
    const run = await authorizedRun(command.runId, actor, tx);
    const all = await repository.suggestions(run.id, tx);
    const selected = all.filter((row) =>
      command.suggestionIds.includes(row.id),
    );
    if (selected.length !== command.suggestionIds.length)
      throw new EnrichmentError("INVALID_INPUT");
    if (selected.every((row) => row.reviewStatus === "REJECTED")) return;
    if (
      run.runVersion !== command.expectedRunVersion ||
      selected.some((row) => row.reviewStatus !== "PENDING")
    )
      throw new EnrichmentError("STALE");
    await repository.decideSuggestions(
      run.id,
      command.suggestionIds,
      "REJECTED",
      actor.userId,
      new Date(),
      tx,
    );
    await repository.updateRun(run.id, {}, tx);
  });
  return getEnrichmentReview(context, { runId: command.runId });
}
