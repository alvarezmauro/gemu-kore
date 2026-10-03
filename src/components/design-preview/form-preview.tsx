"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// This validates an unsaved design example, not collection or catalog data.
const previewSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name to try the preview.")
    .max(80, "Use 80 characters or fewer."),
  notes: z.string().max(300, "Use 300 characters or fewer."),
});
type PreviewValues = z.infer<typeof previewSchema>;

export function FormPreview() {
  const [complete, setComplete] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PreviewValues>({
    resolver: zodResolver(previewSchema),
    defaultValues: { name: "", notes: "" },
  });
  return (
    <form
      noValidate
      onChange={() => setComplete(false)}
      onSubmit={handleSubmit(() => setComplete(true))}
      className="max-w-2xl space-y-6 rounded-xl bg-card p-6"
    >
      <FormField
        id="preview-name"
        label="Name"
        hint="Use any sample name. This form does not save data."
        error={errors.name?.message}
        required
      >
        <Input
          id="preview-name"
          autoComplete="off"
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={`preview-name-hint${errors.name ? " preview-name-error" : ""}`}
          {...register("name")}
        />
      </FormField>
      <FormField
        id="preview-notes"
        label="Notes"
        hint="Optional, up to 300 characters."
        error={errors.notes?.message}
      >
        <Textarea
          id="preview-notes"
          rows={4}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={`preview-notes-hint${errors.notes ? " preview-notes-error" : ""}`}
          {...register("notes")}
        />
      </FormField>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg">
          Check example
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            reset();
            setComplete(false);
          }}
        >
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
      </div>
      <div role="status" aria-live="polite" className="min-h-6">
        {complete && (
          <p className="flex items-start gap-2 text-body">
            <Check className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            Preview complete. Nothing has been saved.
          </p>
        )}
      </div>
    </form>
  );
}
