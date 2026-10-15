import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getCatalogManagement,
  CatalogError,
} from "@/server/services/catalog/management";
export async function getCatalogPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getCatalogManagement(
        await requirePrivateAccess(await headers()),
        input,
      )),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof PermissionError)
      return { status: "FORBIDDEN" as const };
    if (error instanceof CatalogError)
      return {
        status:
          error.code === "NOT_FOUND"
            ? ("NOT_FOUND" as const)
            : ("UNAVAILABLE" as const),
      };
    throw error;
  }
}
