import "server-only";

import type {
  DefectItemOption,
  DefectSummary,
} from "@/features/defects/contracts";
import { defectItemId, defectMutation } from "@/features/defects/validation";
import type { PrivateAccessContext } from "../../auth/access";
import { requirePermission } from "../../auth/permissions";
import { withTransaction } from "../../db/transaction";
import { canPerform } from "../../policies/permissions";
import {
  advanceDefectItem,
  findDefectItem,
  findItemDefect,
  insertDefect,
  listDefectItemOptions,
  listItemDefects,
  lockDefectItem,
  readDefectPublicationPolicy,
  removeDefectRecord,
  updateDefectRecord,
} from "../../repositories/collection/defects";

export class DefectError extends Error {
  constructor(
    public readonly code:
      "INVALID_INPUT" | "NOT_FOUND" | "STALE" | "UNAVAILABLE",
  ) {
    super(
      {
        INVALID_INPUT:
          "Check the defect details. A title is required (up to 200 characters); descriptions and repair notes can contain up to 4,000 characters.",
        NOT_FOUND:
          "This collection item or defect no longer exists. Refresh the page and try again.",
        STALE:
          "This copy changed while you were editing. Close the form, refresh the page and try again.",
        UNAVAILABLE:
          "Defects are unavailable right now. Please try again in a moment.",
      }[code],
    );
    this.name = "DefectError";
  }
}
function itemOption(
  item: Awaited<ReturnType<typeof listDefectItemOptions>>[number],
): DefectItemOption {
  let name: string;
  if (item.type === "CONSOLE" && item.ownedConsole)
    name = `${item.ownedConsole.consoleModel.platform.name} · ${item.ownedConsole.consoleModel.name}`;
  else if (item.type === "GAME" && item.ownedGame) {
    const release = item.ownedGame.gameRelease;
    name = `${release.game.name} · ${release.platform.name}${release.editionName ? ` · ${release.editionName}` : ""}`;
  } else if (item.type === "ACCESSORY" && item.ownedAccessory)
    name = `${item.ownedAccessory.accessoryVariant.accessory.name} · ${item.ownedAccessory.accessoryVariant.name}`;
  else throw new DefectError("UNAVAILABLE");
  return { id: item.id, label: `${name} · Copy ${item.id.slice(0, 8)}` };
}
function defectSummary(
  defect: Awaited<ReturnType<typeof listItemDefects>>[number],
): DefectSummary {
  return {
    id: defect.id,
    collectionItemId: defect.collectionItemId,
    title: defect.title,
    description: defect.description,
    severity: defect.severity,
    status: defect.status,
    resolvedAt: defect.resolvedAt?.toISOString() ?? null,
    repairNote: defect.repairNote,
    createdAt: defect.createdAt.toISOString(),
    updatedAt: defect.updatedAt.toISOString(),
  };
}

export async function getDefectManagement(
  context: PrivateAccessContext,
  itemId?: unknown,
) {
  const current = await requirePermission(context, "private.read");
  if (itemId !== undefined && !defectItemId.safeParse(itemId).success)
    throw new DefectError("NOT_FOUND");
  try {
    // One snapshot keeps the aggregate revision aligned with its defect list.
    return await withTransaction(
      async (transaction) => {
        const items = (await listDefectItemOptions(transaction)).map(
          itemOption,
        );
        const selectedId =
          itemId === undefined ? items[0]?.id : (itemId as string);
        const item = selectedId
          ? await findDefectItem(selectedId, transaction)
          : null;
        if (selectedId && !item) throw new DefectError("NOT_FOUND");
        return {
          items,
          selected: item
            ? { ...itemOption(item), revision: item.revision }
            : null,
          defects: item
            ? (await listItemDefects(item.id, transaction)).map(defectSummary)
            : [],
          canManage: canPerform(current.role, "collection.manage"),
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  } catch (error) {
    if (error instanceof DefectError) throw error;
    throw new DefectError("UNAVAILABLE");
  }
}

export async function mutateDefect(
  context: PrivateAccessContext,
  input: unknown,
): Promise<void> {
  await withTransaction(
    async (transaction) => {
      await requirePermission(context, "collection.manage", transaction);
      const parsed = defectMutation.safeParse(input);
      if (!parsed.success) throw new DefectError("INVALID_INPUT");
      const data = parsed.data;
      await lockDefectItem(data.collectionItemId, transaction);
      const current = await requirePermission(
        context,
        "collection.manage",
        transaction,
      );
      const item = await findDefectItem(data.collectionItemId, transaction);
      if (!item) throw new DefectError("NOT_FOUND");
      if (item.revision !== data.expectedRevision)
        throw new DefectError("STALE");
      const previous =
        data.operation === "create"
          ? null
          : await findItemDefect(data.id, item.id, transaction);
      if (data.operation !== "create" && !previous)
        throw new DefectError("NOT_FOUND");
      if (data.operation === "delete")
        await removeDefectRecord(data.id, transaction);
      else {
        const fields = {
          title: data.title,
          description: data.description,
          severity: data.severity,
          status: data.status,
          resolvedAt:
            data.status === "REPAIRED"
              ? (previous?.resolvedAt ?? new Date())
              : null,
          repairNote: data.repairNote,
        };
        if (data.operation === "create")
          await insertDefect(item.id, fields, transaction);
        else await updateDefectRecord(data.id, fields, transaction);
      }
      const policy = await readDefectPublicationPolicy(transaction);
      const result = await advanceDefectItem(
        item.id,
        item.revision,
        current.userId,
        item.publicationStatus === "PUBLISHED" && policy.showDefects,
        transaction,
      );
      if (result.count !== 1) throw new DefectError("STALE");
    },
    { isolationLevel: "ReadCommitted" },
  );
}
