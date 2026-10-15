import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { getCollectionFilterOptions } from "@/server/services/search/filtered";
import { SearchError } from "@/server/services/search";
export async function getSearchPageData() {
  try {
    return {
      status: "authorized" as const,
      options: await getCollectionFilterOptions(
        await requirePrivateAccess(await headers()),
      ),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof SearchError) return { status: "UNAVAILABLE" as const };
    throw error;
  }
}
