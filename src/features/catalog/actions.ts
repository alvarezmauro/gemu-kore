"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  saveCatalog,
  archiveCatalog,
  lookupCatalog,
  CatalogError,
} from "@/server/services/catalog/management";
import type { CatalogActionResult, CatalogOption } from "./contracts";
function failure(error: unknown) {
  if (error instanceof CatalogError) return error.message;
  if (error instanceof PermissionError)
    return "Only administrators can manage the catalog.";
  if (error instanceof PrivateAccessError && error.code !== "UNAVAILABLE")
    return "Your access changed. Sign in again before continuing.";
  return "We couldn't load or save the catalog. Please try again in a moment.";
}
export async function changeCatalog(
  input: unknown,
): Promise<CatalogActionResult> {
  try {
    const id = await saveCatalog(
      await requirePrivateAccess(await headers()),
      input,
    );
    revalidatePath("/app/catalog");
    revalidatePath("/app/collection");
    return { status: "success", id };
  } catch (error) {
    return { status: "error", message: failure(error) };
  }
}
export async function changeCatalogArchive(
  input: unknown,
): Promise<CatalogActionResult> {
  try {
    const id = await archiveCatalog(
      await requirePrivateAccess(await headers()),
      input,
    );
    revalidatePath("/app/catalog");
    return { status: "success", id };
  } catch (error) {
    return { status: "error", message: failure(error) };
  }
}
export async function findCatalogOptions(
  input: unknown,
): Promise<
  | { status: "success"; options: CatalogOption[] }
  | { status: "error"; message: string }
> {
  try {
    return {
      status: "success",
      options: await lookupCatalog(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return { status: "error", message: failure(error) };
  }
}
