"use client";
import { useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { submitDefectChange } from "../client";
import type { DefectItem, DefectSummary } from "../contracts";
export function DeleteDefect({
  item,
  defect,
  onSuccess,
}: {
  item: DefectItem;
  defect: DefectSummary;
  onSuccess: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [revision, setRevision] = useState(item.revision);
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
          if (value) setRevision(item.revision);
        }
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button variant="ghost" aria-label={`Delete ${defect.title}`}>
          Delete
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="motion-overlay fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="motion-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-md sm:max-w-lg">
          <AlertDialog.Title className="font-heading text-xl">
            Delete defect?
          </AlertDialog.Title>
          <AlertDialog.Description className="break-words text-sm text-muted-foreground">
            Delete “{defect.title}” and its repair details from this copy? This
            cannot be undone. To keep the record after a repair, change its
            status to Repaired instead.
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
                    const result = await submitDefectChange({
                      operation: "delete",
                      collectionItemId: item.id,
                      expectedRevision: revision,
                      id: defect.id,
                    });
                    if (result.status === "error") setError(result.message);
                    else {
                      setOpen(false);
                      onSuccess("Defect deleted.");
                    }
                  });
                }}
              >
                {pending ? "Deleting…" : "Delete defect"}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
