import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import {
  MediaError,
  getMediaManagement,
} from "@/server/services/collection/media";
export async function getMediaPageData(itemId?: unknown, page?: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getMediaManagement(
        await requirePrivateAccess(await headers()),
        itemId,
        page,
      )),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof MediaError)
      return {
        status:
          error.code === "NOT_FOUND"
            ? ("NOT_FOUND" as const)
            : ("UNAVAILABLE" as const),
      };
    throw error;
  }
}
