import { changeLocation } from "./actions";
import type { LocationActionResult } from "./contracts";

export async function submitLocationChange(
  input: unknown,
): Promise<LocationActionResult> {
  try {
    return await changeLocation(input);
  } catch {
    return {
      status: "error",
      message:
        "We couldn’t confirm this change. Refresh the page before trying again.",
    };
  }
}
