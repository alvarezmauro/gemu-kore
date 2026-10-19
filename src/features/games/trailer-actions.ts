"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  changeCatalogTrailer,
  TrailerError,
} from "@/server/services/catalog/trailers";
export async function changeTrailer(input: unknown) {
  try {
    await changeCatalogTrailer(
      await requirePrivateAccess(await headers()),
      input,
    );
    revalidatePath("/app/catalog/games/trailer");
    revalidatePath("/app/catalog/games");
    revalidatePath("/app/games/[id]", "page");
    return { status: "success" as const };
  } catch (error) {
    return {
      status: "error" as const,
      message:
        error instanceof TrailerError
          ? error.message
          : error instanceof PermissionError
            ? "Only administrators can change catalog trailers."
            : error instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm this change. Refresh to check the saved trailer.",
    };
  }
}
