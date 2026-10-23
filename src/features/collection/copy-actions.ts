"use server";
import { headers } from "next/headers";
import { requirePrivateAccess } from "@/server/auth/access";
import { findCollectionCopies } from "@/server/services/collection/items";
import type { CopyChoiceResult } from "./copy-choices";

export async function lookupCollectionCopies(
  input: unknown,
): Promise<CopyChoiceResult> {
  try {
    return {
      status: "success",
      data: await findCollectionCopies(
        await requirePrivateAccess(await headers()),
        input,
      ),
    };
  } catch {
    return {
      status: "error",
      message: "We couldn't find copies. Check your access and try again.",
    };
  }
}
