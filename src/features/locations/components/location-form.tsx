"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitLocationChange } from "../client";
import {
  locationTypeLabels,
  locationTypes,
  type LocationEntry,
} from "../contracts";

const selectStyle =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring";

export function LocationForm({
  location,
  parentId = null,
  locations,
  trigger,
  onSuccess,
}: {
  location?: LocationEntry;
  parentId?: string | null;
  locations: LocationEntry[];
  trigger: ReactNode;
  onSuccess: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const prefix = location?.id ?? parentId ?? "root";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {location ? "Edit location" : "Add location"}
          </DialogTitle>
          <DialogDescription>
            {location
              ? "Rename this place or choose a different parent to move it. Children and items move with it."
              : "Give your collection a place, from a room to a shelf or storage box."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              setError("");
              const result = await submitLocationChange({
                operation: location ? "update" : "create",
                ...(location
                  ? { id: location.id, updatedAt: location.updatedAt }
                  : {}),
                name: form.get("name"),
                type: form.get("type"),
                description: form.get("description"),
                parentId: form.get("parentId") || null,
              });
              if (result.status === "error") setError(result.message);
              else {
                setOpen(false);
                onSuccess(location ? "Location saved." : "Location added.");
              }
            });
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-5">
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-name`}>
                Name <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={`${prefix}-name`}
                name="name"
                required
                maxLength={200}
                defaultValue={location?.name}
                placeholder="e.g. Retro cabinet"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-type`}>Type</Label>
              <select
                className={selectStyle}
                id={`${prefix}-type`}
                name="type"
                defaultValue={location?.type ?? "CUSTOM"}
              >
                {locationTypes.map((type) => (
                  <option key={type} value={type}>
                    {locationTypeLabels[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-parent`}>Parent location</Label>
              <select
                className={selectStyle}
                id={`${prefix}-parent`}
                name="parentId"
                defaultValue={location?.parentId ?? parentId ?? ""}
                aria-describedby={`${prefix}-parent-hint`}
              >
                <option value="">No parent (top level)</option>
                {locations
                  .filter(
                    (entry) =>
                      !location ||
                      !entry.path.some((part) => part.id === location.id),
                  )
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.path.map((part) => part.name).join(" / ")}
                    </option>
                  ))}
              </select>
              <p
                id={`${prefix}-parent-hint`}
                className="text-sm text-muted-foreground"
              >
                Choose where this location belongs. Types do not limit nesting.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-description`}>
                Description{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id={`${prefix}-description`}
                name="description"
                maxLength={2000}
                defaultValue={location?.description ?? ""}
                rows={3}
              />
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : location
                  ? "Save location"
                  : "Add location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
