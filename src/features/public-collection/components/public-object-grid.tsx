import { Disc3, Gamepad2, Monitor } from "lucide-react";
import type { PublicCard } from "../contracts";
const icons = { CONSOLE: Monitor, GAME: Disc3, ACCESSORY: Gamepad2 };
const labels = { CONSOLE: "Console", GAME: "Game", ACCESSORY: "Accessory" };
export function PublicObjectGrid({
  items,
  offset,
}: {
  items: PublicCard[];
  offset: number;
}) {
  return (
    <ol
      aria-label="Collection objects"
      className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      {items.map((item, index) => {
        const Icon = icons[item.type];
        return (
          <li
            key={item.id}
            data-public-copy={item.id}
            className="min-w-0 overflow-hidden rounded-xl bg-card"
          >
            <div
              aria-hidden="true"
              className="relative flex h-44 items-center justify-center border-b bg-muted/40"
            >
              <span className="absolute top-4 left-5 font-mono text-xs text-muted-foreground">
                {String(offset + index + 1).padStart(2, "0")}
              </span>
              <Icon
                className="size-16 text-muted-foreground/60"
                strokeWidth={1}
              />
              <span className="absolute right-5 bottom-4 text-xs text-muted-foreground">
                No public photo
              </span>
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              <p className="text-sm text-muted-foreground">
                {labels[item.type]}
              </p>
              <h3 className="font-heading text-xl leading-snug">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.context}
              </p>
              <p className="text-sm text-muted-foreground">
                {item.hasBox === null
                  ? "Box status unknown"
                  : item.hasBox
                    ? "Box included"
                    : "Without box"}
              </p>
              {item.identificationStatus === "INCOMPLETE" && (
                <p className="text-sm text-muted-foreground">
                  Identification incomplete
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
