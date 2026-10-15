import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { getConsoleCreation } from "@/server/services/collection/consoles";
export async function getConsoleCreationPageData() {
  try {
    return {
      status: "authorized" as const,
      ...(await getConsoleCreation(
        await requirePrivateAccess(await headers()),
      )),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof PermissionError)
      return { status: "FORBIDDEN" as const };
    return { status: "UNAVAILABLE" as const };
  }
}
