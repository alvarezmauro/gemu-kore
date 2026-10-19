"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  parsePlaytimeDraft,
  playtimeDraft,
  type Playtime,
  type PlaytimeSet,
} from "../playtime-validation";
import { changePlaytime } from "../playtime-actions";
import { PlaytimeSummary } from "./playtime-summary";
export type PlaytimeEditorRecord = {
  kind: "game" | "release";
  id: string;
  revision: number;
  archived: boolean;
  estimates: Playtime | null;
};
export function PlaytimeEditor({ record }: { record: PlaytimeEditorRecord }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => playtimeDraft(record.estimates));
  const [review, setReview] = useState<{
    revision: number;
    before: Playtime | null;
    after: PlaytimeSet | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = saving || refreshing;
  const active = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy, review]);
  useEffect(() => {
    if (saved && !busy) trigger.current?.focus();
  }, [saved, busy]);
  function prepare(removing = false) {
    if (busy) return;
    setError("");
    setSaved(false);
    try {
      setReview({
        revision: record.revision,
        before: record.estimates,
        after: removing ? null : parsePlaytimeDraft(draft, record.estimates),
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Check the estimates and source details.",
      );
    }
  }
  async function save() {
    if (!review || active.current || busy) return;
    active.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await changePlaytime({
        kind: record.kind,
        id: record.id,
        expectedRevision: review.revision,
        estimates: review.after,
        reviewed: true,
      });
      if (result.status === "error") setError(result.message);
      else {
        if (review.after === null) setDraft(playtimeDraft(null));
        setReview(null);
        setSaved(true);
        startRefresh(() => router.refresh());
      }
    } catch {
      setError(
        "We couldn't confirm this change. Refresh to check the saved estimates before trying again.",
      );
    } finally {
      active.current = false;
      setSaving(false);
    }
  }
  const problem = error && (
    <p
      ref={alert}
      role="alert"
      tabIndex={-1}
      className="rounded-xl bg-muted p-4 text-sm"
    >
      {error}
    </p>
  );
  return (
    <div
      className="max-w-3xl space-y-6"
      data-playtime-revision={record.revision}
    >
      <p className="text-sm text-muted-foreground">
        {record.kind === "game"
          ? "These are the game default estimates. Releases can supply their own set."
          : "This release replaces the entire game default set. Unknown durations stay unknown. Remove the release set to use the game default again."}{" "}
        Estimates describe the game, rather than your personal time played.
      </p>
      {record.archived && (
        <p>Restore this catalog record before changing playtime estimates.</p>
      )}
      {!review && problem}
      {saved && <p role="status">Playtime estimates saved.</p>}
      <form
        className="space-y-4 rounded-xl bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          prepare();
        }}
      >
        <fieldset disabled={busy || record.archived} className="space-y-4">
          <legend className="font-heading text-xl">Estimate set</legend>
          <p
            id="playtime-duration-help"
            className="text-sm text-muted-foreground"
          >
            Enter whole minutes. Leave a duration blank for unknown; zero is a
            recorded value.
          </p>
          {(
            [
              ["mainMinutes", "Main story (minutes)"],
              ["mainExtrasMinutes", "Main + extras (minutes)"],
              ["completionistMinutes", "Completionist (minutes)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <label htmlFor={`playtime-${key}`} className="block">
                {label}
              </label>
              <Input
                id={`playtime-${key}`}
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={draft[key]}
                aria-describedby="playtime-duration-help"
                onChange={(event) => {
                  setDraft({ ...draft, [key]: event.target.value });
                  setSaved(false);
                }}
              />
            </div>
          ))}
          <div className="space-y-2">
            <label htmlFor="playtime-source-type" className="block">
              Estimate source type
            </label>
            <select
              id="playtime-source-type"
              className="block min-h-12 w-full rounded-lg border border-input bg-background px-3"
              value={draft.sourceType}
              onChange={(event) => {
                setDraft({
                  ...draft,
                  sourceType: event.target.value as typeof draft.sourceType,
                });
                setSaved(false);
              }}
            >
              <option value="MANUAL">Manual estimate</option>
              <option value="PROVIDER">External source</option>
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="playtime-source-name" className="block">
              Source name
            </label>
            <Input
              id="playtime-source-name"
              required
              maxLength={200}
              value={draft.sourceName}
              onChange={(event) => {
                setDraft({ ...draft, sourceName: event.target.value });
                setSaved(false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="playtime-source-url" className="block">
              Source URL (optional)
            </label>
            <Input
              id="playtime-source-url"
              type="text"
              inputMode="url"
              maxLength={2048}
              value={draft.sourceUrl}
              onChange={(event) => {
                setDraft({ ...draft, sourceUrl: event.target.value });
                setSaved(false);
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="playtime-recorded" className="block">
              Recorded date
            </label>
            <Input
              id="playtime-recorded"
              type="date"
              required
              value={draft.recordedOn}
              onChange={(event) => {
                setDraft({ ...draft, recordedOn: event.target.value });
                setSaved(false);
              }}
            />
          </div>
          <Button ref={trigger} type="submit">
            Review estimates
          </Button>
        </fieldset>
      </form>
      <div className="space-y-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError("");
            setSaved(false);
            startRefresh(() => router.refresh());
          }}
        >
          Reload saved estimates
        </Button>
        <p className="text-sm text-muted-foreground">
          Reloading keeps your form entries. Review them against the latest
          saved set before saving.
        </p>
      </div>
      {record.estimates && (
        <Button
          variant="outline"
          disabled={busy || record.archived}
          onClick={() => prepare(true)}
        >
          Remove estimate set
        </Button>
      )}
      <section aria-labelledby="saved-playtime-title" className="space-y-4">
        <h2 id="saved-playtime-title" className="font-heading text-xl">
          Saved estimates
        </h2>
        <PlaytimeSummary estimates={record.estimates} />
      </section>
      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setReview(null);
            setError("");
          }
        }}
      >
        <DialogContent
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <DialogTitle className="pr-10">Review playtime change</DialogTitle>
          <DialogDescription>
            {record.kind === "game" ? "Game default" : "Selected release"}:
            review the complete set and its source before saving. This change
            applies to every copy using this catalog record.
          </DialogDescription>
          {review && (
            <>
              <section
                className="space-y-3"
                aria-labelledby="current-playtime-title"
              >
                <h3 id="current-playtime-title" className="font-medium">
                  Current set
                </h3>
                <PlaytimeSummary estimates={review.before} />
              </section>
              <section
                className="space-y-3"
                aria-labelledby="proposed-playtime-title"
              >
                <h3 id="proposed-playtime-title" className="font-medium">
                  After saving
                </h3>
                {review.after ? (
                  <PlaytimeSummary estimates={review.after} />
                ) : (
                  <p className="text-sm">
                    Remove this estimate set.
                    {record.kind === "release"
                      ? " The game default will be used where available."
                      : " Releases without their own set will have no estimates."}
                  </p>
                )}
              </section>
            </>
          )}
          {problem}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setError("");
              }}
            >
              Keep editing
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving estimates…" : "Confirm and save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
