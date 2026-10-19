"use client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { EnrichmentReview } from "../contracts";
import { displayValue, fieldLabels, sourceDetails } from "../presentation";
export function SuggestionCard({
  suggestion: s,
  companies,
  selected,
  acknowledged,
  busy,
  canApply,
  onSelect,
  onAcknowledge,
  onApply,
  onIgnore,
}: {
  suggestion: EnrichmentReview["suggestions"][number];
  companies: EnrichmentReview["companies"];
  selected: boolean;
  acknowledged: boolean;
  busy: boolean;
  canApply: boolean;
  onSelect: (value: boolean) => void;
  onAcknowledge: (value: boolean) => void;
  onApply: () => void;
  onIgnore: () => void;
}) {
  const label = fieldLabels[s.fieldPath];
  const source = sourceDetails(s.source);
  const pending = s.status === "PENDING";
  return (
    <article
      aria-label={`${label} suggestion`}
      className="min-w-0 space-y-5 rounded-xl bg-card p-5 sm:p-6 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-xl">{label}</h3>
        <Badge variant="secondary">
          {s.status === "PENDING"
            ? "Awaiting review"
            : s.status === "REJECTED"
              ? "Ignored"
              : s.status === "CONFLICT"
                ? "Needs a new review"
                : "Applied"}
        </Badge>
      </div>
      {pending && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            disabled={busy}
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
          />
          Select {label.toLowerCase()}
        </label>
      )}
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        {[
          ["Current value", s.current],
          ["Suggested value", s.proposed],
        ].map(([title, value]) => (
          <div key={title as string} className="min-w-0">
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">
              {title as string}
            </h4>
            <ul className="space-y-2 whitespace-pre-wrap">
              {displayValue(
                s.fieldPath,
                value as typeof s.current,
                companies,
              ).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="space-y-2 text-sm">
        <h4 className="font-medium">Source</h4>
        {source ? (
          <>
            <p>
              {source.provider} · {source.scope} · Retrieved{" "}
              {source.retrievedAt.slice(0, 10)}
            </p>
            {source.links.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-fit min-h-11 py-3 underline"
              >
                View source{i ? ` ${i + 1}` : ""} (opens a new tab)
              </a>
            ))}
          </>
        ) : (
          <p>Source details unavailable. Start a new review before applying.</p>
        )}
        <p>Confidence: Not provided</p>
      </div>
      {pending && s.manualReplacementRequired && (
        <label className="flex min-h-11 items-start gap-3 rounded-lg bg-muted p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-primary"
            disabled={busy}
            checked={acknowledged}
            onChange={(event) => onAcknowledge(event.target.checked)}
          />
          <span>
            I reviewed replacing the current {label.toLowerCase()}, including
            any manually entered information.
          </span>
        </label>
      )}
      {s.status === "CONFLICT" && (
        <p className="text-sm">
          The catalog or its related records changed. This suggestion cannot be
          applied.
        </p>
      )}
      {pending && (
        <div className="flex flex-wrap gap-3">
          {canApply && (
            <Button
              type="button"
              disabled={
                busy ||
                !source ||
                (s.manualReplacementRequired && !acknowledged)
              }
              onClick={onApply}
            >
              Apply {label.toLowerCase()}
            </Button>
          )}
          <Button
            type="button"
            disabled={busy}
            variant="outline"
            onClick={onIgnore}
          >
            Ignore {label.toLowerCase()}
          </Button>
        </div>
      )}
    </article>
  );
}
