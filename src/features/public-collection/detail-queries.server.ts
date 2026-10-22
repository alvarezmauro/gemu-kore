import "server-only";
import { connection } from "next/server";
import * as service from "@/server/services/public-collection";
import type { PublicItemType } from "./contracts";
export async function getPublicDetailPage(type: PublicItemType, id: string) {
  await connection();
  try {
    const read = {
      CONSOLE: service.getPublicConsole,
      GAME: service.getPublicGame,
      ACCESSORY: service.getPublicAccessory,
    }[type];
    return { status: "ready" as const, item: await read({ id }) };
  } catch (e) {
    return {
      status:
        e instanceof service.PublicCollectionError && e.code === "NOT_FOUND"
          ? ("NOT_FOUND" as const)
          : ("UNAVAILABLE" as const),
    };
  }
}
