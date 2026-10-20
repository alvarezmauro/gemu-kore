import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  getPackagingManager,
  PackagingError,
} from "@/server/services/catalog/physical-editions";
export async function getPackagingPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      data: await getPackagingManager(
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
            : error instanceof PackagingError && error.code === "NOT_FOUND"
              ? ("NOT_FOUND" as const)
              : ("UNAVAILABLE" as const),
    };
  }
}
