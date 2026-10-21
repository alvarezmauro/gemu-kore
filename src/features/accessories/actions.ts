"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import { CatalogError } from "@/server/services/catalog/management";
import {
  saveAccessoryCatalog,
  archiveAccessoryCatalog,
  getAccessoryCompatibilityDraft,
} from "@/server/services/catalog/accessories";
function failure(e: unknown) {
  return e instanceof CatalogError
    ? e.message
    : e instanceof PermissionError
      ? "Only administrators can manage the accessory catalog."
      : e instanceof PrivateAccessError
        ? "Your access changed. Sign in again."
        : "We couldn't confirm this save. Your entries are still here. Refresh to check the catalog before trying again.";
}
export async function changeAccessoryCatalog(input: unknown, archive = false) {
  try {
    const context = await requirePrivateAccess(await headers());
    const id = archive
      ? await archiveAccessoryCatalog(context, input)
      : await saveAccessoryCatalog(context, input);
    for (const path of [
      "/app/catalog/accessories",
      "/app/collection",
      "/app/search",
    ])
      revalidatePath(path);
    return { status: "success" as const, id };
  } catch (e) {
    return { status: "error" as const, message: failure(e) };
  }
}
export async function loadAccessoryCompatibility(input: unknown) {
  try {
    return {
      status: "success" as const,
      draft: await getAccessoryCompatibilityDraft(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (e) {
    return { status: "error" as const, message: failure(e) };
  }
}
