import "server-only";
import { headers } from "next/headers";
import { requirePrivateAccess, PrivateAccessError } from "@/server/auth/access";
import { PermissionError } from "@/server/auth/permissions";
import {
  AccessoryCopyError,
  getAccessoryCreation,
  getOwnedAccessoryCopy,
} from "@/server/services/collection/accessory-copies";
function status(error: unknown) {
  return error instanceof PrivateAccessError
    ? error.code
    : error instanceof PermissionError
      ? ("FORBIDDEN" as const)
      : error instanceof AccessoryCopyError && error.code === "NOT_FOUND"
        ? ("NOT_FOUND" as const)
        : ("UNAVAILABLE" as const);
}
export async function getAccessoryCreationPageData() {
  try {
    return {
      status: "authorized" as const,
      ...(await getAccessoryCreation(
        await requirePrivateAccess(await headers()),
      )),
    };
  } catch (e) {
    return { status: status(e) };
  }
}
export async function getAccessoryCopyPageData(input: unknown) {
  try {
    return {
      status: "authorized" as const,
      ...(await getOwnedAccessoryCopy(
        await requirePrivateAccess(await headers()),
        input,
      )),
    };
  } catch (e) {
    return { status: status(e) };
  }
}
