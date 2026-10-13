"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { MediaError, mutateMedia } from "@/server/services/collection/media";
import type { MediaActionResult } from "./contracts";
export async function changeMedia(input: unknown): Promise<MediaActionResult> {
  try {
    await mutateMedia(await requirePrivateAccess(await headers()), input);
  } catch (error) {
    if (error instanceof MediaError)
      return { status: "error", message: error.message };
    if (error instanceof PermissionError)
      return {
        status: "error",
        message: "Your account can view photos but cannot change them.",
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
  revalidatePath("/app/media");
  revalidatePath("/app/defects");
  return { status: "success", message: "Photos saved." };
}
