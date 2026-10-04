import "server-only";

import {
  locationEntries,
  type LocationSummary,
} from "@/features/locations/contracts";
import { locationMutation } from "@/features/locations/validation";
import type { PrivateAccessContext } from "../auth/access";
import { requirePermission } from "../auth/permissions";
import { withTransaction } from "../db/transaction";
import { Prisma } from "../db/generated/client";
import { canPerform } from "../policies/permissions";
import {
  insertLocation,
  listLocationRecords,
  lockLocationHierarchy,
  normalizeLocationName,
  removeLocation,
  updateLocationRecord,
} from "../repositories/locations";

export class LocationError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "CONFLICT"
      | "CYCLE"
      | "IN_USE"
      | "STALE"
      | "UNAVAILABLE",
  ) {
    const messages = {
      INVALID_INPUT:
        "Check the location details. Names are required (up to 200 characters), and descriptions can contain up to 2,000 characters.",
      NOT_FOUND:
        "This location or its parent no longer exists. Refresh the page and try again.",
      CONFLICT:
        "A location with this name already exists under that parent. Choose another name or parent.",
      CYCLE:
        "A location cannot be placed inside itself or one of its children.",
      IN_USE:
        "Move this location's children and items elsewhere before deleting it.",
      STALE:
        "This location changed while you were editing. Close this form, refresh the page and try again.",
      UNAVAILABLE:
        "Locations are unavailable right now. Please try again in a moment.",
    };
    super(messages[code]);
    this.name = "LocationError";
  }
}

function summary(
  record: Awaited<ReturnType<typeof listLocationRecords>>[number],
): LocationSummary {
  const { _count, updatedAt, ...location } = record;
  return {
    ...location,
    updatedAt: updatedAt.toISOString(),
    childCount: _count.children,
    itemCount: _count.items,
  };
}
function entries(records: Awaited<ReturnType<typeof listLocationRecords>>) {
  try {
    return locationEntries(records.map(summary));
  } catch {
    throw new LocationError("UNAVAILABLE");
  }
}

export async function getLocations(context: PrivateAccessContext) {
  const current = await requirePermission(context, "private.read");
  try {
    return {
      locations: entries(await listLocationRecords()),
      canManage: canPerform(current.role, "collection.manage"),
    };
  } catch {
    throw new LocationError("UNAVAILABLE");
  }
}

export async function mutateLocation(
  context: PrivateAccessContext,
  input: unknown,
): Promise<void> {
  try {
    await withTransaction(
      async (transaction) => {
        await lockLocationHierarchy(transaction);
        await requirePermission(context, "collection.manage", transaction);
        const parsed = locationMutation.safeParse(input);
        if (!parsed.success) throw new LocationError("INVALID_INPUT");
        const data = parsed.data;
        const locations = entries(await listLocationRecords(transaction));
        const current =
          data.operation === "create"
            ? undefined
            : locations.find((location) => location.id === data.id);
        if (data.operation !== "create") {
          if (!current) throw new LocationError("NOT_FOUND");
          if (current.updatedAt !== data.updatedAt)
            throw new LocationError("STALE");
        }
        // Monotonic millisecond tokens also protect edits committed within the same millisecond.
        const changedAt = (previous: string) =>
          new Date(Math.max(Date.now(), Date.parse(previous) + 1));
        if (data.operation === "delete") {
          if (current!.childCount || current!.itemCount)
            throw new LocationError("IN_USE");
          await removeLocation(data.id, transaction);
          return;
        }
        if (data.operation === "reorder") {
          const siblings = locations.filter(
            (location) => location.parentId === current!.parentId,
          );
          const index = siblings.findIndex(
            (location) => location.id === data.id,
          );
          const other = index + (data.direction === "up" ? -1 : 1);
          if (other < 0 || other >= siblings.length) return;
          [siblings[index], siblings[other]] = [
            siblings[other],
            siblings[index],
          ];
          for (const [sortOrder, location] of siblings.entries()) {
            if (sortOrder !== location.sortOrder)
              await updateLocationRecord(
                location.id,
                { sortOrder, updatedAt: changedAt(location.updatedAt) },
                transaction,
              );
          }
          return;
        }
        if (data.parentId) {
          const parent = locations.find(
            (location) => location.id === data.parentId,
          );
          if (!parent) throw new LocationError("NOT_FOUND");
          if (current && parent.path.some((part) => part.id === current.id))
            throw new LocationError("CYCLE");
        }
        const normalizedName = await normalizeLocationName(
          data.name,
          transaction,
        );
        // The SQL unique indexes remain authoritative, including concurrent/direct database writes.
        const siblings = locations.filter(
          (location) => location.parentId === data.parentId,
        );
        const nextOrder =
          siblings.reduce(
            (maximum, location) => Math.max(maximum, location.sortOrder),
            -1,
          ) + 1;
        if (nextOrder > 2147483647) throw new LocationError("UNAVAILABLE");
        const fields = {
          name: data.name,
          normalizedName,
          parentId: data.parentId,
          type: data.type,
          description: data.description,
          sortOrder:
            current && current.parentId === data.parentId
              ? current.sortOrder
              : nextOrder,
        };
        if (data.operation === "create")
          await insertLocation(fields, transaction);
        else
          await updateLocationRecord(
            data.id,
            { ...fields, updatedAt: changedAt(current!.updatedAt) },
            transaction,
          );
      },
      { isolationLevel: "ReadCommitted" },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") throw new LocationError("CONFLICT");
      if (error.code === "P2003") throw new LocationError("IN_USE");
      if (error.code === "P2025") throw new LocationError("NOT_FOUND");
    }
    throw error;
  }
}
