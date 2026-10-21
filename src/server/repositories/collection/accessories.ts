import "server-only";
import type { TransactionClient } from "@/server/db/transaction";
import { variantSelect } from "../catalog/accessories";
export function ownedAccessory(id: string, tx: TransactionClient) {
  return tx.collectionItem.findFirst({
    where: { id, type: "ACCESSORY" },
    select: {
      id: true,
      revision: true,
      ownedAccessory: {
        select: { accessoryVariant: { select: variantSelect } },
      },
    },
  });
}
