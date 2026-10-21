"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  AccessoryCopyError,
  findAccessories,
  findAccessoryVariants,
  refreshAccessorySelection,
  createAccessoryCopy,
  mutateAccessoryCopy,
} from "@/server/services/collection/accessory-copies";
import type { Result } from "./copy-contracts";
async function run<T>(
  work: (
    context: Awaited<ReturnType<typeof requirePrivateAccess>>,
  ) => Promise<T>,
): Promise<Result<T>> {
  try {
    return {
      status: "success",
      data: await work(await requirePrivateAccess(await headers())),
    };
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof AccessoryCopyError
          ? e.message
          : e instanceof PermissionError
            ? "Your account cannot manage accessories right now."
            : e instanceof PrivateAccessError
              ? "Your access changed. Sign in again."
              : "We couldn't confirm the result. Keep this page open and check the latest copy before trying again.",
    };
  }
}
function invalidate() {
  revalidatePath("/app/accessories/[id]", "page");
  for (const path of [
    "/app/collection",
    "/app/search",
    "/app/media",
    "/app/defects",
    "/app/locations",
  ])
    revalidatePath(path);
}
export async function lookupAccessories(input: unknown) {
  return run((context) => findAccessories(context, input));
}
export async function lookupAccessoryVariants(input: unknown) {
  return run((context) => findAccessoryVariants(context, input));
}
export async function refreshSelectedAccessory(input: unknown) {
  return run((context) => refreshAccessorySelection(context, input));
}
export async function saveAccessoryCopy(input: unknown) {
  const result = await run(async (context) => ({
    id: await createAccessoryCopy(context, input),
  }));
  if (result.status === "success") invalidate();
  return result;
}
export async function changeAccessoryCopy(input: unknown) {
  const result = await run(async (context) => {
    await mutateAccessoryCopy(context, input);
    return null;
  });
  if (result.status === "success") invalidate();
  return result;
}
