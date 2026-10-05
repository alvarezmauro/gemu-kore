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
import {
  defectSeverities,
  defectStatuses,
  severityLabels,
  statusLabels,
  type DefectItem,
  type DefectSummary,
} from "../contracts";
import { submitDefectChange } from "../client";

const selectStyle =
  "min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring";
export function DefectForm({
  item,
  defect,
  trigger,
  onSuccess,
}: {
  item: DefectItem;
  defect?: DefectSummary;
  trigger: ReactNode;
  onSuccess: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  // Capture the aggregate version when opening, rather than silently advancing an open form.
  const [revision, setRevision] = useState(item.revision);
  const prefix = defect?.id ?? "new-defect";
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
          if (value) setRevision(item.revision);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{defect ? "Edit defect" : "Add defect"}</DialogTitle>
          <DialogDescription className="break-words">
            Record the condition of this physical copy: {item.label}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              setError("");
              const result = await submitDefectChange({
                operation: defect ? "update" : "create",
                collectionItemId: item.id,
                expectedRevision: revision,
                ...(defect ? { id: defect.id } : {}),
                title: form.get("title"),
                description: form.get("description"),
                severity: form.get("severity"),
                status: form.get("status"),
                repairNote: form.get("repairNote"),
              });
              if (result.status === "error") setError(result.message);
              else {
                setOpen(false);
                onSuccess(defect ? "Defect saved." : "Defect added.");
              }
            });
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-5">
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-title`}>
                Title <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={`${prefix}-title`}
                name="title"
                required
                maxLength={200}
                defaultValue={defect?.title}
                placeholder="e.g. Broken hinge"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-severity`}>Severity</Label>
              <select
                id={`${prefix}-severity`}
                name="severity"
                className={selectStyle}
                defaultValue={defect?.severity ?? "MINOR"}
                aria-describedby={`${prefix}-severity-hint`}
              >
                {defectSeverities.map((severity) => (
                  <option key={severity} value={severity}>
                    {severityLabels[severity]}
                  </option>
                ))}
              </select>
              <p
                id={`${prefix}-severity-hint`}
                className="text-sm text-muted-foreground"
              >
                Cosmetic affects appearance only. Minor, major and critical
                indicate increasing impact.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-status`}>Status</Label>
              <select
                id={`${prefix}-status`}
                name="status"
                className={selectStyle}
                defaultValue={defect?.status ?? "ACTIVE"}
                aria-describedby={`${prefix}-status-hint`}
              >
                {defectStatuses.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <p
                id={`${prefix}-status-hint`}
                className="text-sm text-muted-foreground"
              >
                Accepted means acknowledged but unresolved. Repaired records the
                repair date when saved.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-description`}>
                Description (optional)
              </Label>
              <Textarea
                id={`${prefix}-description`}
                name="description"
                maxLength={4000}
                rows={3}
                defaultValue={defect?.description ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${prefix}-repair-note`}>
                Repair note (optional)
              </Label>
              <Textarea
                id={`${prefix}-repair-note`}
                name="repairNote"
                maxLength={4000}
                rows={3}
                defaultValue={defect?.repairNote ?? ""}
                aria-describedby={`${prefix}-repair-hint`}
              />
              <p
                id={`${prefix}-repair-hint`}
                className="text-sm text-muted-foreground"
              >
                Keep any repair details here, including when a problem returns.
              </p>
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
              {pending ? "Saving…" : "Save defect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
