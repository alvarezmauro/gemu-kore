import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { getConsoleCreation } from "@/server/services/collection/consoles";
import { ConsoleError } from "@/server/services/collection/consoles";
import { getOwnedConsole } from "@/server/services/collection/console-management";
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
export async function getOwnedConsolePageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getOwnedConsole(
        await requirePrivateAccess(await headers()),
        input,
      )),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof ConsoleError && error.code === "NOT_FOUND")
      return { status: "NOT_FOUND" as const };
    return { status: "UNAVAILABLE" as const };
  }
}
