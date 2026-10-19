import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getPlaytimeEditor,
  PlaytimeError,
} from "@/server/services/catalog/playtime";
export async function getPlaytimePageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      record: await getPlaytimeEditor(
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
            : error instanceof PlaytimeError && error.code === "NOT_FOUND"
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
