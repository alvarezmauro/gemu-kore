"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Gamepad2, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MagicCard } from "@/components/magic/magic-card";
import type { SearchHit } from "@/features/search/contracts";
import type { CollectionView } from "../browsing";
const labels = { CONSOLE: "Console", GAME: "Game", ACCESSORY: "Accessory" };

function CopyPhoto({
  item,
  compact = false,
}: {
  item: SearchHit;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const photo = item.card?.photo;
  const src = photo ? `/api/media/private/${photo.assetId}` : null;
  return (
    <div className="flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden rounded-lg bg-stone">
      {photo && src && failed !== src ? (
        <Image
          unoptimized
          loading="lazy"
          src={src}
          alt={
            photo.altText ??
            `Photo of ${item.title}, copy ${item.id.slice(0, 8)}`
          }
          width={photo.width}
          height={photo.height}
          className={`h-full w-full object-contain ${compact ? "p-1" : "p-3"}`}
          onError={() => setFailed(src)}
        />
      ) : (
        <div
          className={
            compact
              ? "p-2 text-muted-foreground"
              : "space-y-2 p-3 text-center text-sm text-muted-foreground"
          }
        >
          <Gamepad2
            aria-hidden="true"
            className={compact ? "size-6" : "mx-auto size-8"}
          />
          <p className={compact ? "sr-only" : undefined}>
            {photo ? "Photo unavailable" : "No photo yet"}
          </p>
        </div>
      )}
    </div>
  );
}
function CopyCard({ item, view }: { item: SearchHit; view: CollectionView }) {
  return (
    <div
      className={`flex h-full min-w-0 gap-4 p-4 sm:p-5 ${view === "grid" ? "flex-col" : "flex-row"}`}
    >
      {view === "grid" ? (
        <CopyPhoto key={item.id} item={item} />
      ) : (
        <div className="w-16 shrink-0 sm:w-24">
          <CopyPhoto key={item.id} item={item} compact />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{labels[item.type]}</Badge>
          {item.identificationStatus === "INCOMPLETE" && (
            <Badge variant="outline">Identity incomplete</Badge>
          )}
        </div>
        <div>
          <h2 className="break-words font-heading text-lg">{item.title}</h2>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {item.context} · Copy {item.id.slice(0, 8)}
          </p>
        </div>
        {item.details && (
          <p className="break-words text-sm text-muted-foreground">
            {item.details.releaseYear === null
              ? "Year unknown"
              : `Year ${item.details.releaseYear}`}{" "}
            · {item.details.location ?? "Unassigned location"}
            {item.details.platform
              ? ` · Platform ${item.details.platform}`
              : ""}
            {item.details.publisher
              ? ` · Publisher ${item.details.publisher}`
              : ""}
          </p>
        )}
        {item.card && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              {item.card.hasBox === null
                ? "Box status unknown"
                : item.card.hasBox
                  ? "With box"
                  : "Without box"}
            </p>
            <p>
              {item.card.unresolvedDefects
                ? `${item.card.unresolvedDefects} unresolved ${item.card.unresolvedDefects === 1 ? "defect" : "defects"}`
                : "No unresolved defects recorded"}
            </p>
            {item.card.producer && (
              <p className="break-words">Producer {item.card.producer}</p>
            )}
          </div>
        )}
        {item.matchSources.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Matched: {item.matchSources.join(", ")}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {item.type === "CONSOLE" && (
            <Button asChild>
              <Link
                href={`/app/consoles/${item.id}`}
                aria-label={`View console ${item.title}, copy ${item.id.slice(0, 8)}`}
              >
                View console
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link
              href={`/app/media?itemId=${item.id}`}
              aria-label={`Photos for ${item.title}, copy ${item.id.slice(0, 8)}`}
            >
              Photos
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link
              href={`/app/defects?itemId=${item.id}`}
              aria-label={`Defects for ${item.title}, copy ${item.id.slice(0, 8)}`}
            >
              Defects
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
export function CollectionResults({
  items,
  view,
  choose,
}: {
  items: SearchHit[];
  view: CollectionView;
  choose: (view: CollectionView) => void;
}) {
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Collection view"
        className="flex flex-wrap gap-2"
      >
        <Button
          aria-pressed={view === "grid"}
          variant={view === "grid" ? "secondary" : "outline"}
          onClick={() => choose("grid")}
        >
          <LayoutGrid aria-hidden="true" />
          Grid view
        </Button>
        <Button
          aria-pressed={view === "list"}
          variant={view === "list" ? "secondary" : "outline"}
          onClick={() => choose("list")}
        >
          <List aria-hidden="true" />
          List view
        </Button>
      </div>
      <ol
        aria-label="Search results"
        data-collection-view={view}
        className={
          view === "grid"
            ? "grid min-w-0 gap-6 sm:grid-cols-2 xl:grid-cols-3"
            : "min-w-0 space-y-3"
        }
      >
        {items.map((item) => (
          <li key={item.id} data-copy-id={item.id} className="min-w-0">
            {view === "grid" ? (
              <MagicCard>
                <CopyCard item={item} view={view} />
              </MagicCard>
            ) : (
              <div className="rounded-xl bg-card">
                <CopyCard item={item} view={view} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
