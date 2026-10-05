"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  defectCounts,
  severityLabels,
  statusLabels,
  type DefectItem,
  type DefectSummary,
} from "../contracts";
import { DefectForm } from "./defect-form";
import { DeleteDefect } from "./delete-defect";
export function DefectManager({
  item,
  defects,
  canManage,
}: {
  item: DefectItem;
  defects: DefectSummary[];
  canManage: boolean;
}) {
  const [message, setMessage] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const counts = defectCounts(defects);
  const onSuccess = (value: string) => {
    setMessage(value);
    if (value === "Defect deleted.") addButton.current?.focus();
  };
  return (
    <section aria-label="Defects for selected copy" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 className="break-words font-heading text-xl">{item.label}</h2>
          <p className="text-sm text-muted-foreground">
            {counts.active} active · {counts.accepted} accepted ·{" "}
            {counts.repaired} repaired · {counts.unresolved} unresolved
          </p>
        </div>
        {canManage && (
          <DefectForm
            item={item}
            onSuccess={onSuccess}
            trigger={
              <Button ref={addButton}>
                <Plus aria-hidden="true" />
                Add defect
              </Button>
            }
          />
        )}
      </div>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      {!canManage && (
        <p className="text-sm text-muted-foreground">
          View-only access. An editor or administrator can change defects.
        </p>
      )}
      {defects.length === 0 ? (
        <EmptyState
          title="No defects recorded"
          description="This copy has no recorded defects. Its condition has not necessarily been checked."
        />
      ) : (
        <Card>
          <CardContent>
            <ul aria-label="Defect records" className="divide-y">
              {defects.map((defect) => (
                <li
                  key={defect.id}
                  className="space-y-3 py-5 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words font-heading text-lg">
                      {defect.title}
                    </h3>
                    <Badge variant="secondary">
                      {severityLabels[defect.severity]}
                    </Badge>
                    <Badge variant="outline">
                      {statusLabels[defect.status]}
                    </Badge>
                  </div>
                  {defect.description && (
                    <p className="break-words whitespace-pre-wrap text-sm text-muted-foreground">
                      {defect.description}
                    </p>
                  )}
                  {defect.status === "ACCEPTED" && (
                    <p className="text-sm text-muted-foreground">
                      Acknowledged; still unresolved.
                    </p>
                  )}
                  {defect.resolvedAt && (
                    <p className="text-sm text-muted-foreground">
                      Repaired on{" "}
                      <time dateTime={defect.resolvedAt}>
                        {defect.resolvedAt.slice(0, 10)}
                      </time>{" "}
                      (UTC)
                    </p>
                  )}
                  {defect.repairNote && (
                    <p className="break-words whitespace-pre-wrap text-sm text-muted-foreground">
                      <span className="font-medium">Repair note: </span>
                      {defect.repairNote}
                    </p>
                  )}
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      <DefectForm
                        item={item}
                        defect={defect}
                        onSuccess={onSuccess}
                        trigger={
                          <Button
                            variant="outline"
                            aria-label={`Edit ${defect.title}`}
                          >
                            Edit defect
                          </Button>
                        }
                      />
                      <DeleteDefect
                        item={item}
                        defect={defect}
                        onSuccess={onSuccess}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
