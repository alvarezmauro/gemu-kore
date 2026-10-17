"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
} from "@/components/ui/command";
import type { ConsoleChoices, ConsoleResult } from "../contracts";

export function ConsolePicker<
  T extends { id: string; name: string; logoUrl?: string | null },
>({
  label,
  choices,
  selectedId,
  search,
  choose,
  detail,
  optionName,
}: {
  label: string;
  choices: ConsoleChoices<T>;
  selectedId?: string;
  search: (
    query: string,
    page: number,
  ) => Promise<ConsoleResult<ConsoleChoices<T>>>;
  choose: (item: T) => void;
  detail: (item: T) => string;
  optionName?: (item: T) => string;
}) {
  const [results, setResults] = useState(choices);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function find(page = 0, text = query) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await search(text, page);
      if (result.status === "error") setError(result.message);
      else {
        setResults(result.data);
        setApplied(text);
      }
    } catch {
      setError("We couldn't find matches. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-3">
      <Command shouldFilter={false} aria-label={`Choose ${label}`}>
        <CommandInput
          aria-label={`Find ${label}`}
          value={query}
          maxLength={200}
          readOnly={busy}
          onValueChange={setQuery}
          placeholder={`Search ${label}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query !== applied) {
              event.preventDefault();
              event.stopPropagation();
              void find();
            }
          }}
        />
        <div className="p-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void find()}
          >
            {busy ? "Finding…" : "Find matches"}
          </Button>
        </div>
        <CommandList aria-label={`${label} matches`} aria-busy={busy}>
          {results.items.map((item) => (
            <CommandItem
              key={item.id}
              value={item.id}
              disabled={busy}
              onSelect={() => choose(item)}
              aria-label={`Select ${optionName ? optionName(item) : item.name}`}
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-stone">
                {item.logoUrl ? (
                  <Image
                    unoptimized
                    src={item.logoUrl}
                    width={44}
                    height={44}
                    className="size-10 object-contain"
                    alt=""
                  />
                ) : (
                  <Gamepad2 aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                <span className="block font-medium">
                  {item.name}
                  {selectedId === item.id ? " · Selected" : ""}
                </span>
                <span className="block text-muted-foreground">
                  {detail(item)}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      {!results.items.length && (
        <p role="status" className="text-sm text-muted-foreground">
          No active {label} found. Try another search. Missing catalog entries
          need to be added by an administrator.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={busy || results.page === 0}
          onClick={() => void find(results.page - 1, applied)}
        >
          Previous matches
        </Button>
        <span className="text-sm">Page {results.page + 1}</span>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !results.hasMore}
          onClick={() => void find(results.page + 1, applied)}
        >
          More matches
        </Button>
      </div>
    </div>
  );
}
