import { changeOwnedGame } from "./management-actions";
import type { Result } from "./creation-contracts";
export async function submitGameChange(input: unknown): Promise<Result<null>> {
  try {
    return await changeOwnedGame(input);
  } catch {
    return {
      status: "error",
      message:
        "We couldn't confirm this change. Refresh to check the latest game before trying again.",
    };
  }
}
