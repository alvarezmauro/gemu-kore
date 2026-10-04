import "server-only";

import { getDatabase } from "@/server/db/client";
import type { TransactionClient } from "@/server/db/transaction";

// Private aggregate identity only. A service owns authorization, category
// validation and presentation mapping; this is not a public-eligibility query.
export function findCollectionItemIdentity(
  id: string,
  database: TransactionClient = getDatabase(),
) {
  return database.collectionItem.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      revision: true,
      ownedConsole: { select: { consoleModelId: true } },
      ownedGame: { select: { gameReleaseId: true } },
      ownedAccessory: { select: { accessoryVariantId: true } },
    },
  });
}
