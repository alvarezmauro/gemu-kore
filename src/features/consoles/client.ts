import { changeOwnedConsole } from "./actions";
import type { ConsoleResult } from "./contracts";
export async function submitConsoleChange(
  input: unknown,
): Promise<ConsoleResult<null>> {
  try {
    return await changeOwnedConsole(input);
  } catch {
    return {
      status: "error",
      message:
        "We couldn't confirm this change. Refresh to check the latest console before trying again.",
    };
  }
}
