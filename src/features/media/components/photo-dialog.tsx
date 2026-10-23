"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  photoLabels,
  photoTypes,
  type MediaItem,
  type Photo,
} from "../contracts";
import { submitMediaChange } from "../client";
export function PhotoDialog({
  item,
  photo,
  mode,
  onClose,
  onSuccess,
  returnFocus,
}: {
  item: MediaItem;
  photo: Photo;
  mode: "view" | "edit" | "delete";
  onClose: () => void;
  onSuccess: (message: string) => void;
  returnFocus: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  // Freeze the opened revision, even when a background refresh arrives.
  const [revision] = useState(item.revision);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={mode === "view" ? "sm:max-w-3xl" : undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogTitle>
          {mode === "view"
            ? "View photo"
            : mode === "edit"
              ? "Edit photo"
              : "Remove photo?"}
        </DialogTitle>
        <DialogDescription>
          {mode === "delete"
            ? `Remove “${photo.caption ?? photoLabels[photo.type]}” from this physical copy? The stored file and its provenance are retained. This does not remove photos from other copies.`
            : mode === "edit"
              ? "Describe this copy's photo. Changes to approved content require another public review."
              : `${photoLabels[photo.type]} · ${photo.caption ?? "Collection photo"}`}
        </DialogDescription>
        {mode === "view" ? (
          <>
            <Image
              unoptimized
              src={photo.displayUrl}
              alt={
                photo.altText ??
                photo.caption ??
                `${photoLabels[photo.type]} of ${item.label}`
              }
              width={photo.width}
              height={photo.height}
              className="max-h-[60dvh] w-full rounded-lg bg-stone object-contain"
            />
            <Button variant="outline" onClick={onClose}>
              Close photo
            </Button>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await submitMediaChange({
                  operation: mode === "delete" ? "delete" : "update",
                  collectionItemId: item.id,
                  expectedRevision: revision,
                  id: photo.id,
                  ...(mode === "edit"
                    ? {
                        type: fields.get("type"),
                        caption: fields.get("caption"),
                        altText: fields.get("altText"),
                      }
                    : {}),
                });
                if (result.status === "error") setError(result.message);
                else {
                  onSuccess(
                    mode === "delete"
                      ? "Photo removed from this copy."
                      : "Photo saved.",
                  );
                  onClose();
                }
              });
            }}
            className="space-y-4"
          >
            <fieldset disabled={pending} className="min-w-0 space-y-4">
              {mode === "edit" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="photo-type">Classification</Label>
                    <select
                      id="photo-type"
                      name="type"
                      defaultValue={photo.type}
                      className="min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                    >
                      {photoTypes.map((type) => (
                        <option key={type} value={type}>
                          {photoLabels[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="photo-caption">Caption</Label>
                    <Textarea
                      id="photo-caption"
                      name="caption"
                      maxLength={2000}
                      defaultValue={photo.caption ?? ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="photo-alt">Image description</Label>
                    <Textarea
                      id="photo-alt"
                      name="altText"
                      maxLength={1000}
                      defaultValue={photo.altText ?? ""}
                      aria-describedby="photo-alt-help"
                    />
                    <p
                      id="photo-alt-help"
                      className="text-sm text-muted-foreground"
                    >
                      Describe what is visible for people using a screen reader.
                      If left blank, the caption and classification provide a
                      fallback.
                    </p>
                  </div>
                </>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant={mode === "delete" ? "destructive" : "default"}
                  type="submit"
                >
                  {pending
                    ? "Saving…"
                    : mode === "delete"
                      ? "Remove photo"
                      : "Save photo"}
                </Button>
              </div>
            </fieldset>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
