"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  MapPin,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import {
  locationTypeLabels,
  type LocationEntry,
  type LocationActionResult,
} from "../contracts";
import { submitLocationChange } from "../client";
import { LocationForm } from "./location-form";
import { DeleteLocation } from "./delete-location";

export function LocationManager({
  locations,
  canManage,
}: {
  locations: LocationEntry[];
  canManage: boolean;
}) {
  const [feedback, setFeedback] = useState<LocationActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const addButton = useRef<HTMLButtonElement>(null);
  const onSuccess = (message: string) => {
    setFeedback({ status: "success", message });
    if (message === "Location deleted.") addButton.current?.focus();
  };
  return (
    <>
      <PageHeader
        title="Locations"
        description="A place for every piece of your collection. Arrange rooms, cabinets, shelves and boxes the way you use them."
        action={
          canManage && (
            <LocationForm
              locations={locations}
              onSuccess={onSuccess}
              trigger={
                <Button ref={addButton}>
                  <Plus aria-hidden="true" />
                  Add location
                </Button>
              }
            />
          )
        }
      />
      {feedback && (
        <p
          role={feedback.status === "error" ? "alert" : "status"}
          className={
            feedback.status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {feedback.message}
        </p>
      )}
      {!canManage && (
        <p className="text-sm text-muted-foreground">
          View-only access. An editor or administrator can change locations.
        </p>
      )}
      {locations.length === 0 ? (
        <EmptyState
          title="Make room for your collection"
          description="Start with a home or room, then add the cabinets, shelves and boxes inside it."
        />
      ) : (
        <Card>
          <CardContent>
            <ul aria-label="Location hierarchy" className="divide-y">
              {locations.map((location) => (
                <li
                  key={location.id}
                  data-location-id={location.id}
                  className="py-5 first:pt-0 last:pb-0"
                  style={{
                    paddingLeft: `${Math.min(location.path.length - 1, 3) * 12}px`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    {location.parentId ? (
                      <CornerDownRight
                        className="mt-1 size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <MapPin
                        className="mt-1 size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="min-w-0 break-words font-heading text-lg">
                          {location.name}
                        </h2>
                        <Badge variant="secondary">
                          {locationTypeLabels[location.type]}
                        </Badge>
                      </div>
                      <nav aria-label={`Path to ${location.name}`}>
                        <ol className="flex flex-wrap gap-x-1 text-sm text-muted-foreground">
                          {location.path.map((part, index) => (
                            <li key={part.id} className="min-w-0 break-words">
                              {index > 0 && (
                                <span aria-hidden="true" className="mr-1">
                                  {" / "}
                                </span>
                              )}
                              <span
                                aria-current={
                                  index === location.path.length - 1
                                    ? "location"
                                    : undefined
                                }
                              >
                                {part.name}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </nav>
                      {location.description && (
                        <p className="break-words text-sm text-muted-foreground whitespace-pre-wrap">
                          {location.description}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {location.childCount}{" "}
                        {location.childCount === 1
                          ? "child location"
                          : "child locations"}{" "}
                        · {location.itemCount}{" "}
                        {location.itemCount === 1 ? "item" : "items"}
                      </p>
                      {canManage && (
                        <>
                          <div className="flex flex-wrap items-center gap-1">
                            <LocationForm
                              location={location}
                              locations={locations}
                              onSuccess={onSuccess}
                              trigger={
                                <Button
                                  variant="outline"
                                  aria-label={`Edit or move ${location.name}`}
                                >
                                  Edit or move
                                </Button>
                              }
                            />
                            <LocationForm
                              parentId={location.id}
                              locations={locations}
                              onSuccess={onSuccess}
                              trigger={
                                <Button
                                  variant="ghost"
                                  aria-label={`Add child to ${location.name}`}
                                >
                                  Add child
                                </Button>
                              }
                            />
                            {(["up", "down"] as const).map((direction) => (
                              <Button
                                key={direction}
                                variant="ghost"
                                size="icon"
                                aria-label={`Move ${location.name} ${direction}`}
                                disabled={
                                  pending ||
                                  !(direction === "up"
                                    ? location.canMoveUp
                                    : location.canMoveDown)
                                }
                                onClick={() =>
                                  startTransition(async () =>
                                    setFeedback(
                                      await submitLocationChange({
                                        operation: "reorder",
                                        id: location.id,
                                        updatedAt: location.updatedAt,
                                        direction,
                                      }),
                                    ),
                                  )
                                }
                              >
                                {direction === "up" ? (
                                  <ArrowUp aria-hidden="true" />
                                ) : (
                                  <ArrowDown aria-hidden="true" />
                                )}
                              </Button>
                            ))}
                            <DeleteLocation
                              location={location}
                              onSuccess={onSuccess}
                            />
                          </div>
                          {(location.childCount > 0 ||
                            location.itemCount > 0) && (
                            <p className="text-xs text-muted-foreground">
                              Move children and items elsewhere to enable
                              deletion.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
