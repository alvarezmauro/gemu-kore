import "server-only";
import { Prisma } from "@/server/db/generated/client";
import type { TransactionClient } from "@/server/db/transaction";
import type { Policy } from "./policy";
const marketSelect = { region: { select: { name: true } } } as const;
const markets = {
  select: marketSelect,
  orderBy: { regionId: "asc" as const },
  take: 101,
};
const company = { select: { name: true } } as const;
const playtime = {
  select: {
    mainMinutes: true,
    mainExtrasMinutes: true,
    completionistMinutes: true,
  },
} as const;

// Named separately for the private administrator review workflow. The public
// service never accepts a mode flag, session or caller-supplied select shape.
function projection(policy: Policy) {
  return {
    id: true,
    type: true,
    hasBox: true,
    serialNumber: policy.showSerialNumbers,
    notes: policy.showNotes,
    locationId: policy.showLocations,
    ...(policy.showDefects
      ? {
          defects: {
            select: {
              title: true,
              description: true,
              severity: true,
              status: true,
            },
            orderBy: { id: "asc" as const },
            take: 101,
          },
        }
      : {}),
    ownedConsole: {
      select: {
        consoleModel: {
          select: {
            name: true,
            modelNumber: true,
            releaseYear: true,
            description: true,
            identificationStatus: true,
            regionLock: true,
            regionLockNote: true,
            manufacturer: company,
            regions: markets,
            platform: {
              select: {
                name: true,
                generation: true,
                description: true,
                history: true,
                manufacturer: company,
              },
            },
          },
        },
      },
    },
    ownedGame: {
      select: {
        gameRelease: {
          select: {
            editionName: true,
            editionType: true,
            printingLabel: true,
            firstReleaseYear: true,
            languages: true,
            descriptionOverride: true,
            identificationStatus: true,
            regionLock: true,
            regionLockNote: true,
            regions: markets,
            platform: { select: { name: true } },
            playtime,
            companies: {
              select: {
                role: true,
                company,
                releaseRegion: {
                  select: { region: { select: { name: true } } },
                },
              },
              orderBy: { id: "asc" as const },
              take: 101,
            },
            includedItems: {
              select: {
                name: true,
                kind: true,
                quantity: true,
                description: true,
              },
              orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
              take: 101,
            },
            game: {
              select: {
                name: true,
                description: true,
                playtime,
                companies: {
                  select: { role: true, company },
                  orderBy: [
                    { sortOrder: "asc" as const },
                    { companyId: "asc" as const },
                    { role: "asc" as const },
                  ],
                  take: 101,
                },
              },
            },
          },
        },
      },
    },
    ownedAccessory: {
      select: {
        accessoryVariant: {
          select: {
            name: true,
            modelNumber: true,
            color: true,
            edition: true,
            releaseYear: true,
            descriptionOverride: true,
            identificationStatus: true,
            regionLock: true,
            regionLockNote: true,
            producer: company,
            regions: markets,
            platforms: {
              select: {
                platform: { select: { name: true } },
                compatibilityNote: true,
              },
              orderBy: { platformId: "asc" as const },
              take: 101,
            },
            accessory: {
              select: {
                name: true,
                description: true,
                releaseYear: true,
                producer: company,
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.CollectionItemSelect;
}
export function findPublicDetail(
  id: string,
  type: "CONSOLE" | "GAME" | "ACCESSORY",
  policy: Policy,
  tx: TransactionClient,
) {
  return tx.collectionItem.findFirst({
    where: { id, type, publicationStatus: "PUBLISHED" },
    select: projection(policy),
  });
}
export function findReviewDetail(
  id: string,
  policy: Policy,
  tx: TransactionClient,
) {
  return tx.collectionItem.findUnique({
    where: { id },
    select: projection(policy),
  });
}
export function locationBreadcrumb(id: string, tx: TransactionClient) {
  return tx.$queryRaw<
    { name: string; type: string; parentId: string | null; depth: number }[]
  >(Prisma.sql`
    WITH RECURSIVE path AS (
      SELECT id,name,type,"parentId",0 depth,ARRAY[id] visited FROM location WHERE id=${id}::uuid
      UNION ALL SELECT l.id,l.name,l.type,l."parentId",p.depth+1,p.visited||l.id
      FROM location l JOIN path p ON l.id=p."parentId" WHERE p.depth<63 AND NOT l.id=ANY(p.visited)
    ) SELECT name,type::text,"parentId",depth FROM path ORDER BY depth`);
}
