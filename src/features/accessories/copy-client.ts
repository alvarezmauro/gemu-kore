import { changeAccessoryCopy } from "./copy-actions";
import type { Result } from "./copy-contracts";
export async function submitAccessoryChange(
  input: unknown,
): Promise<Result<null>> {
  try {
    return await changeAccessoryCopy(input);
  } catch {
    return {
      status: "error",
      message:
        "We couldn't confirm this change. Refresh to check the latest copy before trying again.",
    };
  }
}
