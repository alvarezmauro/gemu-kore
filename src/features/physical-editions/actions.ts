"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  requirePrivateAccess,
  PrivateAccessError,
  type PrivateAccessContext,
} from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  createPackagingTemplate,
  changePackagingTemplate,
  assignPackaging,
  PackagingError,
} from "@/server/services/catalog/physical-editions";
import { getGamePackagingPresentation } from "@/server/services/collection/game-presentation";
import type { ModelPresentationResult } from "@/lib/three/contracts";
function message(error: unknown) {
  return error instanceof PackagingError
    ? error.message
    : error instanceof PermissionError
      ? "Your role cannot change packaging."
      : error instanceof PrivateAccessError
        ? "Your access changed. Sign in again."
        : "We couldn't confirm this action. Refresh before trying again.";
}
async function invoke(
  work: (context: PrivateAccessContext) => Promise<unknown>,
) {
  try {
    const id = await work(await requirePrivateAccess(await headers()));
    revalidatePath("/app/catalog/games/packaging");
    revalidatePath("/app/games/[id]", "page");
    revalidatePath("/app/catalog/games");
    return { status: "success" as const, id };
  } catch (error) {
    return { status: "error" as const, message: message(error) };
  }
}
export async function createTemplate(input: unknown) {
  return invoke((context) => createPackagingTemplate(context, input));
}
export async function changeTemplate(input: unknown) {
  return invoke((context) => changePackagingTemplate(context, input));
}
export async function savePackaging(input: unknown) {
  return invoke((context) => assignPackaging(context, input));
}
export async function loadGameBox(
  input: unknown,
): Promise<ModelPresentationResult> {
  try {
    return {
      status: "success",
      data: await getGamePackagingPresentation(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}
