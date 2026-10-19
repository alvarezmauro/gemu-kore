"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  startLookup,
  selectCandidate,
  retryLookup,
  cancelLookup,
  readReview,
  prepareReview,
  rejectSuggestions,
  applySuggestions,
  loadTarget,
} from "../actions";
import type {
  EnrichmentReceipt,
  EnrichmentReview,
  EnrichmentTargetSummary,
} from "../contracts";
import { sourceDetails } from "../presentation";
import { FieldChoices } from "./field-choices";
import { SuggestionCard } from "./suggestion-card";
type ReviewResult =
  | { status: "success"; data: EnrichmentReview }
  | { status: "error"; message: string };
const retryable = [
  "NOT_CONFIGURED",
  "UNAVAILABLE",
  "TIMEOUT",
  "CANCELLED",
  "RATE_LIMITED",
];
const failures: Record<string, string> = {
  NOT_CONFIGURED:
    "Metadata lookup is not configured. You can continue adding your copy manually.",
  TIMEOUT: "The lookup took too long. Your catalog was not changed.",
  CANCELLED: "Lookup cancelled. Your catalog was not changed.",
  RATE_LIMITED:
    "The provider is busy or your lookup limit was reached. Try again later.",
  CONFLICT:
    "This catalog target changed. Start a new lookup to review its current values.",
  AUTHENTICATION_FAILED:
    "The metadata provider needs a configuration check by an administrator.",
  INVALID_RESPONSE:
    "The provider returned information we could not validate. Start a new lookup later.",
  UNAVAILABLE:
    "The metadata provider is unavailable. You can keep working manually.",
  NOT_FOUND: "The selected provider game is no longer available.",
};
export function EnrichmentReviewPanel({
  initialTarget,
  initialReview = null,
}: {
  initialTarget: EnrichmentTargetSummary;
  initialReview?: EnrichmentReview | null;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [review, setReview] = useState(initialReview);
  const [query, setQuery] = useState(initialTarget.query);
  const [selected, setSelected] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<EnrichmentReceipt | null>(
    initialReview?.receipt ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [lookupRequested, setLookupRequested] = useState(false);
  const pending = useRef(false);
  const error = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<{
    target: typeof target.target;
    expectedRevision: number;
    requestKey: string;
    query: string;
  } | null>(null);
  useEffect(() => {
    if (message && !busy) error.current?.focus();
  }, [message, busy]);
  function retain(next: EnrichmentReview) {
    setReview(next);
    setReceipt(next.receipt);
    setSelected([]);
    setAcknowledged([]);
    window.history.replaceState(null, "", `/app/enrichment?runId=${next.id}`);
  }
  async function perform(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    setNotice("");
    try {
      await work();
    } catch {
      setMessage(
        "We couldn't confirm the result. Refresh this review before trying again. Your copy draft stays in its original tab.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function update(
    work: () => Promise<ReviewResult>,
    successNotice?: string,
  ) {
    const result = await work();
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    retain(result.data);
    if (successNotice) setNotice(successNotice);
    heading.current?.focus();
  }
  function start() {
    void perform(async () => {
      request.current ??= {
        target: target.target,
        expectedRevision: target.revision,
        requestKey: crypto.randomUUID(),
        query: query.trim(),
      };
      setLookupRequested(true);
      await update(() => startLookup(request.current));
    });
  }
  function refresh() {
    if (review)
      void perform(() => update(() => readReview({ runId: review.id })));
  }
  function newLookup() {
    void perform(async () => {
      const result = await loadTarget(target.target);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setTarget(result.data);
      setQuery(result.data.query);
      setReview(null);
      setReceipt(null);
      setSelected([]);
      setAcknowledged([]);
      request.current = null;
      setLookupRequested(false);
      window.history.replaceState(
        null,
        "",
        `/app/enrichment?kind=${target.target.kind}&id=${target.target.id}`,
      );
      heading.current?.focus();
    });
  }
  function apply(ids: string[]) {
    if (!review) return;
    void perform(async () => {
      const result = await applySuggestions({
        runId: review.id,
        reviewToken: review.reviewToken,
        suggestionIds: ids,
        manualReplacementIds: acknowledged.filter((id) => ids.includes(id)),
      });
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      setReceipt(result.data);
      const refreshed = await readReview({ runId: review.id });
      if (refreshed.status === "success") retain(refreshed.data);
      else
        setMessage(
          "Your changes were applied. Refresh the review to see the saved values.",
        );
      setNotice(
        "Changes applied to the shared catalog. Return to your add-game tab and refresh its catalog choices before reviewing and saving your copy.",
      );
    });
  }
  function ignore(ids: string[]) {
    if (review)
      void perform(() =>
        update(
          () =>
            rejectSuggestions({
              runId: review.id,
              expectedRunVersion: review.runVersion,
              suggestionIds: ids,
            }),
          "Selected suggestions ignored. No catalog values changed.",
        ),
      );
  }
  const waiting =
    review &&
    ["PENDING", "RUNNING", "NEEDS_SELECTION"].includes(review.fetchStatus);
  const unresolved =
    review?.suggestions.filter((s) => s.status === "PENDING") ?? [];
  const ready = (ids: string[]) =>
    ids.length > 0 &&
    unresolved
      .filter((s) => ids.includes(s.id))
      .every(
        (s) =>
          sourceDetails(s.source) !== null &&
          (!s.manualReplacementRequired || acknowledged.includes(s.id)),
      );
  const command = review
    ? { runId: review.id, expectedRunVersion: review.runVersion }
    : null;
  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-6 [overflow-wrap:anywhere]">
      <section className="space-y-3">
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-heading text-2xl focus:outline-none"
        >
          {target.label}
        </h2>
        <Badge variant="secondary">
          {target.target.kind === "game"
            ? "Shared game metadata"
            : "Physical release reference"}
        </Badge>
        <p className="text-sm text-muted-foreground">
          Review suggestions before changing the catalog. Personal notes,
          photos, edition and market selections stay with your copy.
        </p>
        {target.target.kind === "release" && (
          <p className="text-sm">
            This lookup can add a provider reference. Game-level evidence cannot
            establish this release’s edition, market dates or artwork.
          </p>
        )}
      </section>
      {message && (
        <p
          ref={error}
          tabIndex={-1}
          role="alert"
          className="rounded-xl bg-muted p-4 focus:outline-none"
        >
          {message}
        </p>
      )}
      <p role="status" className="text-sm">
        {busy
          ? "Working… This lookup may take up to 45 seconds. Keep this review open."
          : notice}
      </p>
      {!review && (
        <form
          className="space-y-4 rounded-xl bg-card p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <label htmlFor="metadata-query" className="block font-medium">
            Game title to find
          </label>
          <Input
            id="metadata-query"
            value={query}
            disabled={busy || lookupRequested}
            minLength={2}
            maxLength={200}
            required
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Search structured metadata. AI and web research are currently
            unavailable. No changes are saved by searching.
          </p>
          <Button type="submit" disabled={busy || query.trim().length < 2}>
            {lookupRequested ? "Check same lookup" : "Find metadata"}
          </Button>
        </form>
      )}
      {review && (
        <>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={refresh}
            >
              Refresh review
            </Button>
            {waiting && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void perform(() => update(() => cancelLookup(command)))
                }
              >
                Cancel lookup
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={
                busy ||
                review.fetchStatus === "RUNNING" ||
                review.fetchStatus === "PENDING"
              }
              onClick={newLookup}
            >
              Start a new lookup
            </Button>
          </div>
          <section
            aria-label="Review link"
            className="space-y-2 rounded-xl bg-muted p-4"
          >
            <p className="text-sm">
              {review.canAccept
                ? "Keep this link to return to the saved review."
                : "Editors can prepare and ignore suggestions. An administrator must open this link to apply them. Share it only with an authorized administrator."}
            </p>
            <Link
              href={`/app/enrichment?runId=${review.id}`}
              className="block min-h-11 py-3 underline"
            >
              Open retained review
            </Link>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await navigator.clipboard.writeText(
                    `${window.location.origin}/app/enrichment?runId=${review.id}`,
                  );
                  setNotice("Review link copied.");
                })
              }
            >
              Copy review link
            </Button>
          </section>
          {review.fetchStatus === "FAILED" && (
            <section className="space-y-3 rounded-xl bg-card p-5">
              <h3 className="font-heading text-xl">Lookup unavailable</h3>
              <p>
                {failures[review.failureCode ?? ""] ??
                  "We couldn't complete this lookup. Start a new lookup later; manual saving remains available."}
              </p>
              {review.attemptCount < 3 &&
                retryable.includes(review.failureCode ?? "") && (
                  <Button
                    disabled={busy}
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void perform(() => update(() => retryLookup(command)))
                    }
                  >
                    Retry lookup
                  </Button>
                )}
            </section>
          )}
          {review.fetchStatus === "RUNNING" && (
            <p>
              Lookup is still running. Refresh its status, or cancel it before
              starting another lookup.
            </p>
          )}
          {review.fetchStatus === "NEEDS_SELECTION" && (
            <section aria-labelledby="candidate-heading" className="space-y-4">
              <h2 id="candidate-heading" className="font-heading text-2xl">
                Choose the matching game
              </h2>
              <p>
                A title match does not confirm your physical edition. Choose
                deliberately, even when only one result is shown.
              </p>
              <ul className="space-y-3">
                {review.candidates.map((candidate) => (
                  <li
                    key={candidate.externalId}
                    className="space-y-3 rounded-xl bg-card p-5"
                  >
                    <h3 className="font-medium">{candidate.name}</h3>
                    <p className="text-sm">
                      {candidate.classification
                        .toLowerCase()
                        .replaceAll("_", " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Platforms: {candidate.platforms.join(", ") || "Unknown"} ·
                      First release: {candidate.year ?? "Unknown"}
                    </p>
                    {candidate.description && (
                      <p className="text-sm whitespace-pre-wrap">
                        {candidate.description}
                      </p>
                    )}
                    <Button
                      disabled={busy}
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void perform(() =>
                          update(() =>
                            selectCandidate({
                              ...command,
                              externalId: candidate.externalId,
                            }),
                          ),
                        )
                      }
                    >
                      Review {candidate.name}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {review.selectedCandidate && (
            <p className="text-sm">
              Provider game: {review.selectedCandidate.name}
            </p>
          )}
          {review.fetchStatus === "COMPLETED" &&
            !review.reviewToken &&
            review.availableFields.length > 0 && (
              <FieldChoices
                key={review.id}
                review={review}
                busy={busy}
                onPrepare={(choice) =>
                  void perform(() =>
                    update(() => prepareReview({ ...command, ...choice })),
                  )
                }
              />
            )}
          {review.fetchStatus === "COMPLETED" &&
            !review.suggestions.length &&
            (review.reviewToken || !review.availableFields.length) && (
              <p className="rounded-xl bg-card p-5">
                No applicable suggestions. Nothing was changed.
              </p>
            )}
          {receipt && (
            <section
              aria-label="Applied changes"
              className="space-y-2 rounded-xl bg-muted p-5"
            >
              <h2 className="font-heading text-xl">Changes applied</h2>
              <p>
                {receipt.suggestionIds.length}{" "}
                {receipt.suggestionIds.length === 1
                  ? "field group"
                  : "field groups"}{" "}
                saved to the shared catalog.
              </p>
              <p className="text-sm">
                Any remaining suggestions need a new review. In your add-game
                tab, refresh catalog choices and review your copy again before
                saving.
              </p>
            </section>
          )}
          {review.suggestions.length > 0 && (
            <section aria-labelledby="preview-heading" className="space-y-5">
              <h2 id="preview-heading" className="font-heading text-2xl">
                Review suggestions
              </h2>
              {review.currentRevision !== review.baseRevision && !receipt && (
                <p role="alert">
                  The catalog changed. Pending suggestions need a new lookup
                  before they can be applied.
                </p>
              )}
              {review.suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  companies={review.companies}
                  busy={busy}
                  selected={selected.includes(suggestion.id)}
                  acknowledged={acknowledged.includes(suggestion.id)}
                  canApply={review.canApply && !receipt}
                  onSelect={(checked) =>
                    setSelected(
                      checked
                        ? [...selected, suggestion.id]
                        : selected.filter((id) => id !== suggestion.id),
                    )
                  }
                  onAcknowledge={(checked) =>
                    setAcknowledged(
                      checked
                        ? [...acknowledged, suggestion.id]
                        : acknowledged.filter((id) => id !== suggestion.id),
                    )
                  }
                  onApply={() => apply([suggestion.id])}
                  onIgnore={() => ignore([suggestion.id])}
                />
              ))}
              {unresolved.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm">
                    Apply requires an acknowledgement for each selected manual
                    value. Applying part of this preview invalidates its
                    remaining suggestions.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {review.canApply && !receipt && (
                      <>
                        <Button
                          type="button"
                          disabled={busy || !ready(selected)}
                          onClick={() => apply(selected)}
                        >
                          Apply selected
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !ready(unresolved.map((s) => s.id))}
                          onClick={() => apply(unresolved.map((s) => s.id))}
                        >
                          Apply all
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !selected.length}
                      onClick={() => ignore(selected)}
                    >
                      Ignore selected
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => ignore(unresolved.map((s) => s.id))}
                    >
                      Ignore all
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
          <details className="space-y-3 rounded-xl bg-muted p-4">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Unavailable information and lookup stages
            </summary>
            <ul className="space-y-3 text-sm">
              {review.unavailable.map((item, index) => (
                <li key={`${item.field}:${index}`}>{item.reason}</li>
              ))}
              {review.stages.map((stage) => (
                <li key={stage.name}>
                  {stage.name === "structured"
                    ? "Structured metadata"
                    : stage.name === "ai"
                      ? "AI synthesis"
                      : "Web research"}
                  : {stage.status === "COMPLETED" ? "Completed" : "Skipped"}
                  {stage.reason ? ` · ${stage.reason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {message && !review && (
        <Button variant="outline" disabled={busy} onClick={newLookup}>
          Start a different lookup
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        You can close this tab and continue manually in your add-game form. Its
        draft and photos remain there. You can also enrich a saved copy from its
        details.
      </p>
      <Button asChild variant="outline">
        <Link href="/app/collection">Back to collection</Link>
      </Button>
    </div>
  );
}
