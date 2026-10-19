"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  mutateScreenshot,
  ScreenshotError,
} from "@/server/services/catalog/screenshots";
export async function changeScreenshot(input: unknown) {
  try {
    await mutateScreenshot(await requirePrivateAccess(await headers()), input);
    for (const path of ["/app/catalog/games/screenshots", "/app/catalog/games"])
      revalidatePath(path);
    revalidatePath("/app/games/[id]", "page");
    return { status: "success" as const };
  } catch (e) {
    return {
      status: "error" as const,
      message:
        e instanceof ScreenshotError
          ? e.message
          : e instanceof PermissionError
            ? "Only administrators can change screenshots."
            : e instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm this change. Refresh to check the gallery.",
    };
  }
}
