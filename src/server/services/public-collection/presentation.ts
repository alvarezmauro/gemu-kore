import "server-only";
import type {
  PublicDetail,
  PublicItemType,
} from "@/features/public-collection/contracts";
import {
  locationBreadcrumb,
  type findPublicDetail,
} from "@/server/repositories/public-collection/detail";
import type { Policy } from "@/server/repositories/public-collection/policy";
import type { TransactionClient } from "@/server/db/transaction";
import { PublicCollectionError } from "./common";
type Row = NonNullable<Awaited<ReturnType<typeof findPublicDetail>>>;
export async function detailProjection(
  row: Row,
  policy: Policy,
  tx: TransactionClient,
): Promise<PublicDetail> {
  const facts: PublicDetail["facts"] = [];
  const fact = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined)
      facts.push({ label, value: String(value) });
  };
  let title: string,
    context: string,
    description: string | null,
    identificationStatus: "INCOMPLETE" | "CONFIRMED",
    markets: string[];
  let relatedTruncated = false;
  const names = (rows: { region: { name: string } }[]) => {
    relatedTruncated ||= rows.length > 100;
    return rows.slice(0, 100).map((r) => r.region.name);
  };
  if (row.type === "CONSOLE" && row.ownedConsole) {
    const m = row.ownedConsole.consoleModel,
      p = m.platform;
    title = p.name;
    context = m.name;
    description = m.description ?? p.description;
    identificationStatus = m.identificationStatus;
    markets = names(m.regions);
    fact("Model number", m.modelNumber);
    fact("Manufacturer", m.manufacturer?.name ?? p.manufacturer?.name);
    fact("Generation", p.generation);
    fact("Release year", m.releaseYear);
    fact("Platform history", p.history);
    fact("Region locking", m.regionLock);
    fact("Region locking details", m.regionLockNote);
  } else if (row.type === "GAME" && row.ownedGame) {
    const r = row.ownedGame.gameRelease,
      g = r.game;
    title = g.name;
    context = [r.platform.name, r.editionName, r.printingLabel]
      .filter(Boolean)
      .join(" · ");
    description = r.descriptionOverride ?? g.description;
    identificationStatus = r.identificationStatus;
    markets = names(r.regions);
    fact("Platform", r.platform.name);
    fact("Edition", r.editionName ?? r.editionType);
    fact("Printing", r.printingLabel);
    fact("Release year", r.firstReleaseYear);
    fact("Languages", r.languages.slice(0, 100).join(", ") || null);
    relatedTruncated ||= r.languages.length > 100;
    for (const credit of g.companies.slice(0, 100))
      fact(`Game ${credit.role.toLowerCase()}`, credit.company.name);
    for (const credit of r.companies.slice(0, 100))
      fact(
        `Release ${credit.role.toLowerCase()}${credit.releaseRegion ? ` · ${credit.releaseRegion.region.name}` : ""}`,
        credit.company.name,
      );
    for (const item of r.includedItems.slice(0, 100))
      fact(
        "Expected content",
        `${item.name} × ${item.quantity} (${item.kind.toLowerCase()})`,
      );
    relatedTruncated ||= [g.companies, r.companies, r.includedItems].some(
      (rows) => rows.length > 100,
    );
    const estimate = r.playtime ?? g.playtime;
    if (estimate) {
      const scope = r.playtime ? "Release" : "Game";
      fact(`${scope} main estimate (minutes)`, estimate.mainMinutes);
      fact(
        `${scope} main and extras estimate (minutes)`,
        estimate.mainExtrasMinutes,
      );
      fact(
        `${scope} completionist estimate (minutes)`,
        estimate.completionistMinutes,
      );
    }
    fact("Region locking", r.regionLock);
    fact("Region locking details", r.regionLockNote);
  } else if (row.type === "ACCESSORY" && row.ownedAccessory) {
    const v = row.ownedAccessory.accessoryVariant,
      a = v.accessory;
    title = a.name;
    context = [v.name, v.edition, v.color].filter(Boolean).join(" · ");
    description = v.descriptionOverride ?? a.description;
    identificationStatus = v.identificationStatus;
    markets = names(v.regions);
    fact("Producer", v.producer?.name ?? a.producer?.name);
    fact("Model number", v.modelNumber);
    fact("Color", v.color);
    fact("Edition", v.edition);
    fact("Release year", v.releaseYear ?? a.releaseYear);
    for (const p of v.platforms.slice(0, 100))
      fact(
        "Compatible platform",
        `${p.platform.name}${p.compatibilityNote ? ` · ${p.compatibilityNote}` : ""}`,
      );
    relatedTruncated ||= v.platforms.length > 100;
    fact("Region locking", v.regionLock);
    fact("Region locking details", v.regionLockNote);
  } else throw new PublicCollectionError("UNAVAILABLE");
  const category: Record<PublicItemType, string> = {
    CONSOLE: "consoles",
    GAME: "games",
    ACCESSORY: "accessories",
  };
  const result: PublicDetail = {
    id: row.id,
    type: row.type,
    href: `/collection/${category[row.type]}/${row.id}`,
    title,
    context,
    hasBox: row.hasBox,
    identificationStatus,
    photo: null,
    description,
    facts,
    markets,
    relatedTruncated,
  };
  if (policy.showSerialNumbers) result.serialNumber = row.serialNumber;
  if (policy.showNotes) result.notes = row.notes;
  if (policy.showDefects)
    result.defects = {
      items: row.defects.slice(0, 100).map((d) => ({
        title: d.title,
        description: d.description,
        severity: d.severity,
        status: d.status,
      })),
      hasMore: row.defects.length > 100,
    };
  if (policy.showLocations) {
    result.location = null;
    if (row.locationId) {
      const path = await locationBreadcrumb(row.locationId, tx);
      if (!path.length || path[path.length - 1].parentId)
        throw new PublicCollectionError("UNAVAILABLE");
      result.location = {
        name: path[0].name,
        type: path[0].type,
        breadcrumb: path.map((p) => p.name).reverse(),
      };
    }
  }
  return result;
}
