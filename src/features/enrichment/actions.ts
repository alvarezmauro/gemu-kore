"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  requirePrivateAccess,
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getEnrichmentTarget,
  findEnrichmentCompanies,
  enrichmentRunner,
  EnrichmentError,
  getEnrichmentReview,
  prepareEnrichmentReview,
  rejectEnrichmentSuggestions,
  applyEnrichmentSuggestions,
} from "@/server/services/enrichment";

async function invoke<T>(work: (context: PrivateAccessContext) => Promise<T>) {
  try {
    return {
      status: "success" as const,
      data: await work(await requirePrivateAccess(await headers())),
    };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof EnrichmentError
          ? error.message
          : error instanceof PermissionError
            ? "Your role cannot perform this enrichment action."
            : error instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm this enrichment action. Refresh the review before trying again.",
    };
  }
}
export async function startLookup(input: unknown) {
  return invoke((context) => enrichmentRunner.start(context, input));
}
export async function selectCandidate(input: unknown) {
  return invoke((context) => enrichmentRunner.selectCandidate(context, input));
}
export async function retryLookup(input: unknown) {
  return invoke((context) => enrichmentRunner.retry(context, input));
}
export async function cancelLookup(input: unknown) {
  return invoke((context) => enrichmentRunner.cancel(context, input));
}
export async function readReview(input: unknown) {
  return invoke((context) => getEnrichmentReview(context, input));
}
export async function prepareReview(input: unknown) {
  return invoke((context) => prepareEnrichmentReview(context, input));
}
export async function rejectSuggestions(input: unknown) {
  return invoke((context) => rejectEnrichmentSuggestions(context, input));
}
export async function applySuggestions(input: unknown) {
  return invoke(async (context) => {
    const receipt = await applyEnrichmentSuggestions(context, input);
    revalidatePath("/app/catalog/games");
    revalidatePath("/app/games/[id]", "page");
    return receipt;
  });
}

export async function loadTarget(input: unknown) {
  return invoke((context) => getEnrichmentTarget(context, input));
}
export async function findCompanies(input: unknown) {
  return invoke((context) => findEnrichmentCompanies(context, input));
}
