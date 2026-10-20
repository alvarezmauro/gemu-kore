import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getMediaManager,
  MediaError,
} from "@/server/services/catalog/physical-media";
export async function getMediaPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      data: await getMediaManager(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return {
      status:
        error instanceof PrivateAccessError
          ? error.code
          : error instanceof PermissionError
            ? ("FORBIDDEN" as const)
            : error instanceof MediaError && error.code === "NOT_FOUND"
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
