"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { LocationError, mutateLocation } from "@/server/services/locations";
import type { LocationActionResult } from "./contracts";

export async function changeLocation(
  input: unknown,
): Promise<LocationActionResult> {
  try {
    await mutateLocation(await requirePrivateAccess(await headers()), input);
  } catch (error) {
    if (error instanceof LocationError)
      return { status: "error", message: error.message };
    if (error instanceof PermissionError)
      return {
        status: "error",
        message: "Your account can view locations but cannot change them.",
      };
    if (error instanceof PrivateAccessError && error.code !== "UNAVAILABLE")
      return {
        status: "error",
        message:
          "Your access has changed. Sign in again before making changes.",
      };
    return {
      status: "error",
      message: "We couldn't save this change. Please try again in a moment.",
    };
  }
  revalidatePath("/app/locations");
  return { status: "success", message: "Location updated." };
}
