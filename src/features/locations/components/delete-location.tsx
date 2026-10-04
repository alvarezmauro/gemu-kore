"use client";

import { useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import type { LocationEntry } from "../contracts";
import { submitLocationChange } from "../client";

export function DeleteLocation({
  location,
  onSuccess,
}: {
  location: LocationEntry;
  onSuccess: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          variant="ghost"
          aria-label={`Delete ${location.name}`}
          disabled={Boolean(location.childCount || location.itemCount)}
        >
          Delete
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="motion-overlay fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="motion-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-md sm:max-w-lg">
          <AlertDialog.Title className="font-heading text-xl">
            Delete location?
          </AlertDialog.Title>
          <AlertDialog.Description className="break-words text-sm text-muted-foreground">
            Delete “{location.name}”? This cannot be undone. Only locations
            without children or items can be deleted.
          </AlertDialog.Description>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault();
                  startTransition(async () => {
                    const result = await submitLocationChange({
                      operation: "delete",
                      id: location.id,
                      updatedAt: location.updatedAt,
                    });
                    if (result.status === "error") setError(result.message);
                    else {
                      setOpen(false);
                      onSuccess("Location deleted.");
                    }
                  });
                }}
              >
                {pending ? "Deleting…" : "Delete location"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
