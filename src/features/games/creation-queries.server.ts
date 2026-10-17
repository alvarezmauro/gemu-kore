import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { getGameCreation } from "@/server/services/collection/games";
export async function getGameCreationPageData() {
  try {
    return {
      status: "authorized" as const,
      ...(await getGameCreation(await requirePrivateAccess(await headers()))),
    };
  } catch (e) {
    return {
      status:
        e instanceof PrivateAccessError
          ? e.code
          : e instanceof PermissionError
            ? ("FORBIDDEN" as const)
            : ("UNAVAILABLE" as const),
    };
  }
}
