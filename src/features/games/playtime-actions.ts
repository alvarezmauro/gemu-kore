"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  changeCatalogPlaytime,
  PlaytimeError,
} from "@/server/services/catalog/playtime";
export async function changePlaytime(input: unknown) {
  try {
    await changeCatalogPlaytime(
      await requirePrivateAccess(await headers()),
      input,
    );
    revalidatePath("/app/catalog/games/playtime");
    revalidatePath("/app/catalog/games");
    revalidatePath("/app/games/[id]", "page");
    return { status: "success" as const };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof PlaytimeError
          ? error.message
          : error instanceof PermissionError
            ? "Only administrators can change catalog playtime estimates."
            : error instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm this change. Refresh to check the saved estimates.",
    };
  }
}
