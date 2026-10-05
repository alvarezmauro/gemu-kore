import { changeDefect } from "./actions";
import type { DefectActionResult } from "./contracts";
export async function submitDefectChange(
  input: unknown,
): Promise<DefectActionResult> {
  try {
    return await changeDefect(input);
  } catch {
    return {
      status: "error",
      message:
        "We couldn’t confirm this change. Refresh the page before trying again.",
    };
  }
}
