export const locationTypes = [
  "PROPERTY",
  "ROOM",
  "FURNITURE",
  "SHELF",
  "CONTAINER",
  "CUSTOM",
] as const;
export type LocationType = (typeof locationTypes)[number];
export const locationTypeLabels: Record<LocationType, string> = {
  PROPERTY: "Property",
  ROOM: "Room",
  FURNITURE: "Furniture",
  SHELF: "Shelf",
  CONTAINER: "Container",
  CUSTOM: "Custom",
};

export type LocationSummary = {
  id: string;
  parentId: string | null;
  name: string;
  type: LocationType;
  description: string | null;
  sortOrder: number;
  updatedAt: string;
  childCount: number;
  itemCount: number;
};
export type LocationEntry = LocationSummary & {
  path: { id: string; name: string }[];
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type LocationActionResult = {
  status: "success" | "error";
  message: string;
};

// Derived presentation only: no stored paths or recursion that can hang on bad data.
export function locationEntries(
  locations: readonly LocationSummary[],
): LocationEntry[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  if (byId.size !== locations.length)
    throw new Error("Invalid location hierarchy.");
  const siblings = new Map<string | null, LocationSummary[]>();
  for (const location of locations) {
    if (location.parentId && !byId.has(location.parentId))
      throw new Error("Invalid location hierarchy.");
    const group = siblings.get(location.parentId) ?? [];
    group.push(location);
    siblings.set(location.parentId, group);
  }
  for (const group of siblings.values())
    group.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const result: LocationEntry[] = [];
  const stack = [...(siblings.get(null) ?? [])]
    .reverse()
    .map((location) => ({ location, path: [] as LocationEntry["path"] }));
  while (stack.length) {
    const { location, path } = stack.pop()!;
    const nextPath = [...path, { id: location.id, name: location.name }];
    const group = siblings.get(location.parentId)!;
    const index = group.indexOf(location);
    result.push({
      ...location,
      path: nextPath,
      canMoveUp: index > 0,
      canMoveDown: index < group.length - 1,
    });
    for (const child of [...(siblings.get(location.id) ?? [])].reverse())
      stack.push({ location: child, path: nextPath });
  }
  if (result.length !== locations.length)
    throw new Error("Invalid location hierarchy.");
  return result;
}
