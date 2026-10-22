import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import { componentSelect } from "./components";
export function reviewComponent(id: string, tx: TransactionClient) {
  return tx.gameReleaseIncludedItem.findUnique({
    where: { id },
    select: componentSelect,
  });
}
