import { changeMedia } from "./actions";
import type { MediaActionResult } from "./contracts";
export async function submitMediaChange(
  input: unknown,
): Promise<MediaActionResult> {
  try {
    return await changeMedia(input);
  } catch {
    return {
      status: "error",
      message:
        "We couldn't confirm this change. Refresh the page before trying again.",
    };
  }
}
