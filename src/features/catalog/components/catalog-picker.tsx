"use client";
import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { findCatalogOptions } from "../actions";
import type { CatalogOption } from "../contracts";
export function CatalogPicker({
  kind,
  label,
  selected,
  onChange,
  multiple = false,
  disabled = false,
}: {
  kind: "company" | "platform" | "region" | "game";
  label: string;
  selected: CatalogOption[];
  onChange: (value: CatalogOption[]) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function search() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const result = await findCatalogOptions({ kind, query });
      if (result.status === "error") {
        setOptions([]);
        setMessage(result.message);
      } else {
        setOptions(result.options);
        setMessage(
          result.options.length
            ? "Up to 25 active matches. Refine the name to find more."
            : "No active matches. Create the missing record in the catalog first.",
        );
      }
    } catch {
      setOptions([]);
      setMessage("Search is unavailable. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-3 rounded-xl bg-muted p-4"
    >
      <legend className="px-1 font-medium">{label}</legend>
      <ul className="space-y-2" aria-label={`Selected ${label.toLowerCase()}`}>
        {selected.map((option) => (
          <li
            key={option.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2"
          >
            <span className="min-w-0 break-words">
              {option.name}
              {option.archived ? " (archived)" : ""}
              {option.detail && (
                <span className="block text-sm text-muted-foreground">
                  {option.detail}
                </span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onChange(selected.filter((s) => s.id !== option.id))
              }
              aria-label={`Remove ${option.name}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {!selected.length ? (
        <p className="text-sm text-muted-foreground">
          {kind === "region"
            ? "No known markets. This does not mean Worldwide."
            : "No selection"}
        </p>
      ) : null}
      <Label htmlFor={id}>Find {label.toLowerCase()}</Label>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void search()}
        >
          {busy ? "Finding…" : "Find matches"}
        </Button>
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      <ul className="space-y-1" aria-label={`${label} matches`}>
        {options
          .filter((o) => !selected.some((s) => s.id === o.id))
          .map((option) => (
            <li key={option.id}>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 max-w-full whitespace-normal text-left break-words"
                onClick={() =>
                  onChange(multiple ? [...selected, option] : [option])
                }
                disabled={multiple && selected.length >= 30}
              >
                Select {option.name}
                {option.detail ? ` (${option.detail})` : ""}
              </Button>
            </li>
          ))}
      </ul>
    </fieldset>
  );
}
