import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import {
  DefectError,
  getDefectManagement,
} from "@/server/services/collection/defects";
export async function getDefectsPageData(itemId?: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getDefectManagement(
        await requirePrivateAccess(await headers()),
        itemId,
      )),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof DefectError)
      return {
        status:
          error.code === "NOT_FOUND"
            ? ("NOT_FOUND" as const)
            : ("UNAVAILABLE" as const),
      };
    throw error;
  }
}
