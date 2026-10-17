"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  saveGameCatalog,
  archiveGameCatalog,
} from "@/server/services/catalog/games";
import { CatalogError } from "@/server/services/catalog/management";
export async function changeGameCatalog(
  input: unknown,
  archive = false,
): Promise<
  { status: "success"; id: string } | { status: "error"; message: string }
> {
  try {
    const context = await requirePrivateAccess(await headers());
    const id = archive
      ? await archiveGameCatalog(context, input)
      : await saveGameCatalog(context, input);
    for (const path of [
      "/app/catalog/games",
      "/app/catalog",
      "/app/collection",
      "/app/search",
    ])
      revalidatePath(path);
    return { status: "success", id };
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof CatalogError
          ? e.message
          : e instanceof PermissionError
            ? "Only administrators can manage the game catalog."
            : e instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm this save. Your entries are still here. Refresh to check the catalog before trying again.",
    };
  }
}
