"use client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Button } from "@/components/ui/button";
import { defectSeverities, severityLabels } from "@/features/defects/contracts";
import type { ConsolePhysicalDraft } from "../validation";
import type { ConsoleLocation } from "../contracts";
const selectClass =
  "min-h-12 w-full rounded-lg border border-input bg-background px-3 text-base";
export function PhysicalDetails({
  data,
  change,
  locations,
  showDefects = true,
}: {
  data: ConsolePhysicalDraft;
  change: (value: ConsolePhysicalDraft) => void;
  locations: ConsoleLocation[];
  showDefects?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <FormField
          id="console-serial"
          label="Serial number"
          hint="Optional. This identifies your physical copy."
        >
          <Input
            id="console-serial"
            aria-describedby="console-serial-hint"
            maxLength={200}
            value={data.serialNumber}
            onChange={(e) => change({ ...data, serialNumber: e.target.value })}
          />
        </FormField>
        <FormField id="console-box" label="Has box">
          <select
            id="console-box"
            className={selectClass}
            value={data.hasBox}
            onChange={(e) =>
              change({
                ...data,
                hasBox: e.target.value as ConsolePhysicalDraft["hasBox"],
              })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FormField>
      </div>
      <FormField
        id="console-location"
        label="Location"
        hint="Choose where this copy is stored. You can leave it unassigned."
      >
        <select
          id="console-location"
          aria-describedby="console-location-hint"
          className={selectClass}
          value={data.locationId}
          onChange={(e) => change({ ...data, locationId: e.target.value })}
        >
          <option value="">Unassigned</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        id="console-markings"
        label="Observed markings or identification uncertainty"
        hint="Record what is printed on your copy. These observations do not change its catalog model or commercial markets."
      >
        <Textarea
          id="console-markings"
          aria-describedby="console-markings-hint"
          value={data.observedMarkings}
          maxLength={4000}
          onChange={(e) =>
            change({ ...data, observedMarkings: e.target.value })
          }
        />
      </FormField>
      <FormField id="console-notes" label="Private notes">
        <Textarea
          id="console-notes"
          value={data.notes}
          maxLength={16000}
          onChange={(e) => change({ ...data, notes: e.target.value })}
        />
      </FormField>
      {showDefects && (
        <section aria-label="Initial defects" className="space-y-4">
          <div>
            <h3 className="font-medium">Defects</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add separate records for each problem. New defects start as
              active; repair details can be added later.
            </p>
          </div>
          {data.defects.map((defect, index) => (
            <fieldset
              key={index}
              className="min-w-0 space-y-3 rounded-xl bg-muted p-4"
            >
              <legend className="px-1 font-medium">Defect {index + 1}</legend>
              <FormField
                id={`defect-title-${index}`}
                label={`Defect ${index + 1} title`}
                required
              >
                <Input
                  id={`defect-title-${index}`}
                  maxLength={200}
                  value={defect.title}
                  onChange={(e) =>
                    change({
                      ...data,
                      defects: data.defects.map((d, i) =>
                        i === index ? { ...d, title: e.target.value } : d,
                      ),
                    })
                  }
                />
              </FormField>
              <FormField
                id={`defect-description-${index}`}
                label={`Defect ${index + 1} description`}
              >
                <Textarea
                  id={`defect-description-${index}`}
                  maxLength={4000}
                  value={defect.description}
                  onChange={(e) =>
                    change({
                      ...data,
                      defects: data.defects.map((d, i) =>
                        i === index ? { ...d, description: e.target.value } : d,
                      ),
                    })
                  }
                />
              </FormField>
              <FormField
                id={`defect-severity-${index}`}
                label={`Defect ${index + 1} severity`}
              >
                <select
                  id={`defect-severity-${index}`}
                  className={selectClass}
                  value={defect.severity}
                  onChange={(e) =>
                    change({
                      ...data,
                      defects: data.defects.map((d, i) =>
                        i === index
                          ? {
                              ...d,
                              severity: e.target
                                .value as typeof defect.severity,
                            }
                          : d,
                      ),
                    })
                  }
                >
                  {defectSeverities.map((value) => (
                    <option key={value} value={value}>
                      {severityLabels[value]}
                    </option>
                  ))}
                </select>
              </FormField>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  change({
                    ...data,
                    defects: data.defects.filter((_, i) => i !== index),
                  })
                }
              >
                Remove defect {index + 1}
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={data.defects.length >= 20}
            onClick={() =>
              change({
                ...data,
                defects: [
                  ...data.defects,
                  { title: "", description: "", severity: "COSMETIC" },
                ],
              })
            }
          >
            Add defect
          </Button>
        </section>
      )}
    </div>
  );
}
