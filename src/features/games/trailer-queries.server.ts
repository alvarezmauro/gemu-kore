import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getTrailerEditor,
  TrailerError,
} from "@/server/services/catalog/trailers";
export async function getTrailerPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      record: await getTrailerEditor(
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
            : error instanceof TrailerError && error.code === "NOT_FOUND"
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
