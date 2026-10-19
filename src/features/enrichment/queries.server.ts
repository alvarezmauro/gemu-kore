import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  EnrichmentError,
  getEnrichmentReview,
  getEnrichmentTarget,
} from "@/server/services/enrichment";
export async function getEnrichmentPageData(
  query: Record<string, string | string[] | undefined>,
) {
  try {
    const context = await requirePrivateAccess(await headers());
    if (query.runId !== undefined) {
      const review = await getEnrichmentReview(context, { runId: query.runId });
      // Archived/stale reviews remain readable. A new lookup independently validates a fresh target.
      return {
        status: "authorized" as const,
        review,
        target: {
          target: review.target,
          label: review.label,
          revision: review.currentRevision,
          query: (review.selectedCandidate?.name ?? review.label).slice(0, 200),
        },
      };
    }
    const target = await getEnrichmentTarget(context, {
      kind: query.kind,
      id: query.id,
    });
    return { status: "authorized" as const, target, review: null };
  } catch (error) {
    return {
      status:
        error instanceof PrivateAccessError
          ? error.code
          : error instanceof PermissionError
            ? ("FORBIDDEN" as const)
            : error instanceof EnrichmentError &&
                ["NOT_FOUND", "INVALID_INPUT"].includes(error.code)
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
