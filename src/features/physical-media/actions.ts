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
  createPhysicalMediaTemplate,
  changePhysicalMediaTemplate,
  assignPhysicalMedia,
  MediaError,
} from "@/server/services/catalog/physical-media";
import { getGameCartridgePresentation } from "@/server/services/collection/media-presentation";
import type { ModelPresentationResult } from "@/lib/three/contracts";
function message(error: unknown) {
  return error instanceof MediaError
    ? error.message
    : error instanceof PermissionError
      ? "Your role cannot change cartridge artwork."
      : error instanceof PrivateAccessError
        ? "Your access changed. Sign in again."
        : "We couldn't confirm this action. Refresh before trying again.";
}
async function invoke(
  work: (context: PrivateAccessContext) => Promise<unknown>,
) {
  try {
    const id = await work(await requirePrivateAccess(await headers()));
    revalidatePath("/app/catalog/games/cartridges");
    revalidatePath("/app/games/[id]", "page");
    revalidatePath("/app/catalog/games");
    return { status: "success" as const, id };
  } catch (error) {
    return { status: "error" as const, message: message(error) };
  }
}
export async function createTemplate(input: unknown) {
  return invoke((context) => createPhysicalMediaTemplate(context, input));
}
export async function changeTemplate(input: unknown) {
  return invoke((context) => changePhysicalMediaTemplate(context, input));
}
export async function saveCartridge(input: unknown) {
  return invoke((context) => assignPhysicalMedia(context, input));
}
export async function loadGameCartridge(
  input: unknown,
): Promise<ModelPresentationResult> {
  try {
    return {
      status: "success",
      data: await getGameCartridgePresentation(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}
