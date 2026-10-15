import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { getCollectionFilterOptions } from "@/server/services/search/filtered";
import { SearchError } from "@/server/services/search";
import { canPerform } from "@/server/policies/permissions";
export async function getSearchPageData() {
  try {
    const context = await requirePrivateAccess(await headers());
    return {
      status: "authorized" as const,
      options: await getCollectionFilterOptions(context),
      canAddConsole: canPerform(context.role, "collection.manage"),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof SearchError) return { status: "UNAVAILABLE" as const };
    throw error;
  }
}
