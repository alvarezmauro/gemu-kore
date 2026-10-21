import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { getDashboard } from "@/server/services/collection/dashboard";
export async function getDashboardPageData() {
  try {
    return {
      status: "authorized" as const,
      data: await getDashboard(await requirePrivateAccess(await headers())),
    };
  } catch (e) {
    if (e instanceof PrivateAccessError) return { status: e.code };
    if (e instanceof PermissionError) return { status: "DENIED" as const };
    return { status: "UNAVAILABLE" as const };
  }
}
