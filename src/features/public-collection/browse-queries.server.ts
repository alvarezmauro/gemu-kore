import "server-only";
import { getPublicCollection } from "./queries.server";
import { PublicCollectionError } from "@/server/services/public-collection/common";
import {
  parsePublicBrowse,
  type PublicCategory,
  type PublicBrowseParams,
} from "./browsing";

export async function getPublicBrowsePage(
  params: PublicBrowseParams,
  category: PublicCategory,
) {
  const parsed = parsePublicBrowse(params, category);
  try {
    // Passing invalid input through the service preserves policy-first denial:
    // a disabled collection returns NOT_FOUND even for malformed controls.
    const data = await getPublicCollection(parsed?.input ?? null);
    if (!parsed) return { status: "INVALID_INPUT" as const };
    return {
      status: "ready" as const,
      data,
      input: parsed.input,
      page: parsed.page,
    };
  } catch (error) {
    return {
      location: parsed,
      status:
        error instanceof PublicCollectionError && error.code !== "STALE"
          ? error.code
          : ("UNAVAILABLE" as const),
    };
  }
}
