"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewPublicationSettings, savePublicationSettings } from "../actions";
import type { PublicationSettings, SettingsReview } from "../admin-contracts";
import type { PublicSettingsValues } from "../validation";

const fields = [
  [
    "allowSearchEngineIndexing",
    "Allow search engine indexing",
    "Search engines may discover public pages and all details you make public. Turning this off requests removal on future crawls; it cannot recall saved copies.",
  ],
  [
    "publicCollectionEnabled",
    "Open the public collection",
    "Visitors can see approved copies. Pausing the collection keeps individual approvals.",
  ],
  [
    "showSerialNumbers",
    "Show serial numbers",
    "Serial text may identify an individual physical copy.",
  ],
  [
    "showLocations",
    "Show locations",
    "Includes location names and their full path.",
  ],
  [
    "showNotes",
    "Show collection notes",
    "Notes on approved copies become public text.",
  ],
  [
    "showPersonalPhotos",
    "Show approved personal media",
    "Individually reviewed photos and custom models may appear on published copies. Widening this setting returns affected copies to private.",
  ],
  [
    "showDefects",
    "Show defects",
    "Includes defect titles, descriptions, severity and status.",
  ],
] as const;

export function PublicationSettingsForm({
  initial,
}: {
  initial: PublicationSettings;
}) {
  const router = useRouter();
  const [values, setValues] = useState<PublicSettingsValues>({
    publicCollectionEnabled: initial.publicCollectionEnabled,
    showSerialNumbers: initial.showSerialNumbers,
    showLocations: initial.showLocations,
    showNotes: initial.showNotes,
    showDefects: initial.showDefects,
    showPersonalPhotos: initial.showPersonalPhotos,
    allowSearchEngineIndexing: initial.allowSearchEngineIndexing,
  });
  const [review, setReview] = useState<SettingsReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const reviewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (review) reviewRef.current?.focus();
  }, [review]);
  function submit() {
    startTransition(async () => {
      setMessage("");
      try {
        if (!review) {
          const result = await reviewPublicationSettings({
            expectedRevision: initial.revision,
            settings: values,
          });
          if (result.status === "error") {
            setFailed(true);
            setMessage(result.message);
            return;
          }
          setReview(result.data);
          setConfirmed(false);
        } else {
          const result = await savePublicationSettings({
            expectedRevision: initial.revision,
            settings: values,
            reviewToken: review.reviewToken,
            reviewed: confirmed,
          });
          setReview(null);
          setConfirmed(false);
          if (result.status === "error") {
            setFailed(true);
            setMessage(result.message);
            return;
          }
          setFailed(false);
          setMessage(
            `Settings saved. ${result.data.unpublished} copies returned to private.`,
          );
          router.refresh();
        }
      } catch {
        setReview(null);
        setConfirmed(false);
        setFailed(true);
        setMessage(
          "We couldn't reach publication settings. Reload and review again.",
        );
      }
    });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-6"
    >
      <fieldset disabled={pending} className="space-y-3">
        <legend className="mb-4 font-heading text-2xl">
          Visibility settings
        </legend>
        {fields.map(([key, label, description]) => (
          <label
            key={key}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-4"
          >
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-foreground"
              checked={values[key]}
              onChange={(e) => {
                setValues({ ...values, [key]: e.target.checked });
                setReview(null);
                setConfirmed(false);
                setMessage("");
              }}
            />
            <span>
              <span className="block font-medium">{label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {description}
              </span>
            </span>
          </label>
        ))}
        <p className="text-sm leading-relaxed text-muted-foreground">
          Indexing permission does not publish private copies or media.
        </p>
      </fieldset>
      {review && (
        <section
          aria-label="Settings review"
          ref={reviewRef}
          tabIndex={-1}
          className="space-y-4 rounded-xl border bg-muted/40 p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <h2 className="font-heading text-xl">Review before saving</h2>
          <p>
            The collection will be{" "}
            <strong>
              {values.publicCollectionEnabled ? "open to visitors" : "private"}
            </strong>
            .
          </p>
          {review.affectedCopies > 0 ? (
            <p>
              <strong>{review.affectedCopies} published copies</strong> will
              return to private because visibility is being widened. Review and
              approve each copy again to share it.
            </p>
          ) : (
            <p>No copies will lose their individual approval.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Enabling the collection shares its name and description along with
            approved copies. It does not publish unapproved copies.
          </p>
          <p className="text-sm">
            {values.allowSearchEngineIndexing
              ? "Indexing is permitted while the public collection is open. Search engines may retain information they already collected."
              : "Public pages request no indexing. Existing search results may take time to disappear."}
          </p>
          <div>
            <p className="font-medium">
              {review.site?.collectionName ?? "GemuKore"}
            </p>
            {review.site?.collectionDescription && (
              <p className="whitespace-pre-wrap">
                {review.site.collectionDescription}
              </p>
            )}
          </div>
          <label className="flex min-h-11 items-start gap-3 py-2">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-foreground"
              checked={confirmed}
              disabled={pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I reviewed these settings and their effect on published copies.
            </span>
          </label>
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || (!!review && !confirmed)}>
          {pending
            ? "Checking…"
            : review
              ? "Save reviewed settings"
              : "Review settings"}
        </Button>
        {review && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setReview(null);
              setConfirmed(false);
            }}
          >
            Back to editing
          </Button>
        )}
      </div>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
      {failed && (
        <a
          href="/app/settings/public"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Reload settings
        </a>
      )}
    </form>
  );
}
