import "server-only";

import { headers } from "next/headers";
import { PrivateAccessError, requirePrivateAccess } from "@/server/auth/access";
import { getLocations, LocationError } from "@/server/services/locations";

export async function getLocationsPageData() {
  try {
    return {
      status: "authorized" as const,
      ...(await getLocations(await requirePrivateAccess(await headers()))),
    };
  } catch (error) {
    if (error instanceof PrivateAccessError) return { status: error.code };
    if (error instanceof LocationError)
      return { status: "UNAVAILABLE" as const };
    throw error;
  }
}
