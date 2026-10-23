"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupCollectionCopies } from "../copy-actions";
import type { CopyChoices, CopyOption } from "../copy-choices";

const subscribe = () => () => undefined;
const clientReady = () => true;
const serverReady = () => false;

export function CopySelector({
  action,
  id,
  initial,
  selected,
}: {
  action: "/app/media" | "/app/defects";
  id: string;
  initial: CopyChoices;
  selected: CopyOption;
}) {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [results, setResults] = useState(initial);
  const [chosen, setChosen] = useState(selected);
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const options = results.items.some((item) => item.id === chosen.id)
    ? results.items
    : [chosen, ...results.items];
  async function find(page = 0, text = query) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await lookupCollectionCopies({ query: text, page });
      if (result.status === "error") setError(result.message);
      else {
        setResults(result.data);
        setApplied(text);
      }
    } catch {
      setError("We couldn't find copies. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="max-w-2xl space-y-3">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <Label htmlFor={`${id}-search`}>Search copies</Label>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <Input
            id={`${id}-search`}
            disabled={!hydrated}
            value={query}
            maxLength={200}
            readOnly={busy}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, platform, edition or copy ID"
          />
          <Button type="submit" variant="outline" disabled={busy || !hydrated}>
            {busy ? "Finding…" : "Find copies"}
          </Button>
        </div>
      </form>
      <noscript>
        <p className="text-sm text-muted-foreground">
          Use the copy pages below to browse without JavaScript.
        </p>
      </noscript>
      <form action={action} method="get" className="space-y-2">
        <Label htmlFor={id}>Collection copy</Label>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
          <select
            id={id}
            name="itemId"
            value={chosen.id}
            disabled={busy}
            onChange={(event) =>
              setChosen(options.find((item) => item.id === event.target.value)!)
            }
            className="min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
          >
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" disabled={busy}>
            View copy
          </Button>
        </div>
      </form>
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {results.items.length
          ? `Page ${results.page + 1} · Up to 25 copies per page.`
          : "No matching copies. Try another search."}{" "}
        Your chosen copy stays available.
      </p>
      <div
        role="group"
        className="flex flex-wrap gap-3"
        aria-label="Copy pages"
      >
        {[
          {
            label: "Previous copies",
            page: results.page - 1,
            disabled: results.page === 0,
          },
          {
            label: "More copies",
            page: results.page + 1,
            disabled: !results.hasMore,
          },
        ].map((control) => (
          <form
            key={control.label}
            action={action}
            method="get"
            onSubmit={(event) => {
              event.preventDefault();
              void find(control.page, applied);
            }}
          >
            <input type="hidden" name="itemId" value={chosen.id} />
            <input type="hidden" name="copyPage" value={control.page} />
            <Button
              type="submit"
              variant="outline"
              disabled={busy || control.disabled}
            >
              {control.label}
            </Button>
          </form>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
