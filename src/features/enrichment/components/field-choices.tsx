"use client";
import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { findCompanies } from "../actions";
import type { EnrichmentReview } from "../contracts";
import type { ProposalField } from "../validation";
import { fieldLabels } from "../presentation";
function CompanyBinding({
  name,
  selected,
  disabled,
  onChange,
}: {
  name: string;
  selected?: { id: string; name: string };
  disabled: boolean;
  onChange: (company?: { id: string; name: string }) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function search() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await findCompanies({ query });
      if (result.status === "error") setMessage(result.message);
      else {
        setOptions(result.data);
        setMessage(
          result.data.length
            ? "Choose an existing company below."
            : "No companies found. Leave this developer unresolved or add its company in the catalog first.",
        );
      }
    } catch {
      setMessage("Company search is unavailable. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <fieldset
      disabled={disabled || busy}
      className="min-w-0 space-y-3 rounded-lg bg-muted p-4"
    >
      <legend className="px-1 font-medium">Match developer: {name}</legend>
      <p className="text-sm">
        {selected
          ? `Selected: ${selected.name}`
          : "Use an existing accepted mapping, or choose an active company. Unresolved developers cannot be applied."}
      </p>
      {selected && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(undefined)}
        >
          Clear company for {name}
        </Button>
      )}
      <label htmlFor={id} className="block text-sm">
        Find a company for {name}
      </label>
      <Input
        id={id}
        minLength={2}
        maxLength={200}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => void search()}
        disabled={query.trim().length < 2}
      >
        {busy ? "Finding…" : `Find company for ${name}`}
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
      <ul className="space-y-2">
        {options.map((option) => (
          <li key={option.id}>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 max-w-full whitespace-normal"
              onClick={() => onChange(option)}
            >
              Choose {option.name}
            </Button>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
export function FieldChoices({
  review,
  busy,
  onPrepare,
}: {
  review: EnrichmentReview;
  busy: boolean;
  onPrepare: (choice: {
    fields: ProposalField[];
    trailerExternalId?: string;
    companyBindings: { externalId: string; companyId: string }[];
  }) => void;
}) {
  const [fields, setFields] = useState<ProposalField[]>([]);
  const [trailer, setTrailer] = useState("");
  const [bindings, setBindings] = useState<
    Record<string, { id: string; name: string } | undefined>
  >({});
  const selectId = useId();
  return (
    <section
      className="space-y-5 rounded-xl bg-card p-5 sm:p-6"
      aria-labelledby="choose-fields"
    >
      <h2 id="choose-fields" className="font-heading text-2xl">
        Choose what to review
      </h2>
      <p>
        Choose fields, then prepare a fixed preview. Preparing suggestions
        changes no catalog values.
      </p>
      <fieldset disabled={busy} className="min-w-0 space-y-2">
        <legend className="sr-only">Fields to review</legend>
        {review.availableFields.map((field) => (
          <label key={field} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={fields.includes(field)}
              onChange={(e) =>
                setFields(
                  e.target.checked
                    ? [...fields, field]
                    : fields.filter((f) => f !== field),
                )
              }
            />
            {fieldLabels[field]}
          </label>
        ))}
      </fieldset>
      {fields.includes("trailer") && (
        <div className="space-y-2">
          <label htmlFor={selectId}>Trailer to review</label>
          <select
            id={selectId}
            disabled={busy}
            className="min-h-12 w-full rounded-lg border border-input bg-background px-3"
            value={trailer}
            onChange={(e) => setTrailer(e.target.value)}
          >
            <option value="">Choose a trailer</option>
            {review.trailerChoices.map((option) => (
              <option key={option.externalId} value={option.externalId}>
                {option.title ?? "Untitled trailer"}
              </option>
            ))}
          </select>
        </div>
      )}
      {fields.includes("developers") &&
        review.companyChoices.map((company) => (
          <CompanyBinding
            key={company.externalId}
            name={company.name}
            selected={bindings[company.externalId]}
            disabled={busy}
            onChange={(selected) =>
              setBindings({ ...bindings, [company.externalId]: selected })
            }
          />
        ))}
      {!review.availableFields.length && (
        <p>No supported fields are available.</p>
      )}
      <Button
        type="button"
        disabled={
          busy || !fields.length || (fields.includes("trailer") && !trailer)
        }
        onClick={() =>
          onPrepare({
            fields,
            ...(fields.includes("trailer")
              ? { trailerExternalId: trailer }
              : {}),
            companyBindings: fields.includes("developers")
              ? Object.entries(bindings).flatMap(([externalId, company]) =>
                  company ? [{ externalId, companyId: company.id }] : [],
                )
              : [],
          })
        }
      >
        Prepare preview
      </Button>
    </section>
  );
}
