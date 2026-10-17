import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { getGameCatalog } from "@/server/services/catalog/games";
import { CatalogError } from "@/server/services/catalog/management";
export async function getGameCatalogPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getGameCatalog(
        await requirePrivateAccess(await headers()),
        input,
      )),
    };
  } catch (e) {
    if (e instanceof PrivateAccessError) return { status: e.code };
    if (e instanceof PermissionError) return { status: "FORBIDDEN" as const };
    return {
      status:
        e instanceof CatalogError && e.code === "NOT_FOUND"
          ? ("NOT_FOUND" as const)
          : ("UNAVAILABLE" as const),
    };
  }
}
