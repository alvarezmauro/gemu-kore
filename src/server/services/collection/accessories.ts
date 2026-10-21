import "server-only";
import type { PrivateAccessContext } from "@/server/auth/access";
import { PrivateAccessError } from "@/server/auth/access";
import { PermissionError, requirePermission } from "@/server/auth/permissions";
import { withTransaction } from "@/server/db/transaction";
import { ownedAccessory } from "@/server/repositories/collection/accessories";
import { accessoryDomainDto } from "../catalog/accessories";
import { CatalogError } from "../catalog/management";
import { accessoryIdentity } from "@/features/accessories/validation";
// Domain identity only. Personal-copy CRUD and presentation belong to later tasks.
export async function getOwnedAccessoryDomain(
  context: PrivateAccessContext,
  input: unknown,
) {
  try {
    return await withTransaction(
      async (tx) => {
        await requirePermission(context, "private.read", tx);
        const p = accessoryIdentity.safeParse(input);
        if (!p.success) throw new CatalogError("NOT_FOUND");
        const copy = await ownedAccessory(p.data.id, tx);
        if (!copy?.ownedAccessory) throw new CatalogError("NOT_FOUND");
        return {
          ...accessoryDomainDto(copy.ownedAccessory.accessoryVariant),
          copy: { id: copy.id, revision: copy.revision },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (e) {
    if (
      e instanceof CatalogError ||
      e instanceof PermissionError ||
      e instanceof PrivateAccessError
    )
      throw e;
    throw new CatalogError("UNAVAILABLE");
  }
}
