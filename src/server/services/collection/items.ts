import "server-only";
import { listCollectionItemOptions } from "../../repositories/collection/items";
export function itemOption(
  item: Awaited<ReturnType<typeof listCollectionItemOptions>>[number],
): { id: string; label: string } {
  let name: string;
  if (item.type === "CONSOLE" && item.ownedConsole)
    name = `${item.ownedConsole.consoleModel.platform.name} · ${item.ownedConsole.consoleModel.name}`;
  else if (item.type === "GAME" && item.ownedGame) {
    const release = item.ownedGame.gameRelease;
    name = `${release.game.name} · ${release.platform.name}${release.editionName ? ` · ${release.editionName}` : ""}`;
  } else if (item.type === "ACCESSORY" && item.ownedAccessory)
    name = `${item.ownedAccessory.accessoryVariant.accessory.name} · ${item.ownedAccessory.accessoryVariant.name}`;
  else throw new Error("Collection identity unavailable");
  return { id: item.id, label: `${name} · Copy ${item.id.slice(0, 8)}` };
}
