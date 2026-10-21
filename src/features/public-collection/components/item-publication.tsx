"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewItemPublication, saveItemPublication } from "../actions";
import type { ItemReview } from "../admin-contracts";
import { PublicProjection } from "./public-projection";

export function ItemPublication({ initial }: { initial: ItemReview }) {
  const router = useRouter();
  const [review, setReview] = useState<ItemReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (review) previewRef.current?.focus();
  }, [review]);
  const published = !initial.published;
  function submit() {
    startTransition(async () => {
      setMessage("");
      try {
        if (!review) {
          const result = await reviewItemPublication({
            id: initial.item.id,
            published,
          });
          if (result.status === "error") {
            setFailed(true);
            setMessage(result.message);
            return;
          }
          setReview(result.data);
          setConfirmed(false);
        } else {
          const result = await saveItemPublication({
            id: review.item.id,
            published,
            expectedRevision: review.revision,
            expectedSettingsRevision: review.settingsRevision,
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
            published
              ? "Copy approved. It appears on the public home when the collection is open."
              : "Copy returned to private.",
          );
          router.refresh();
        }
      } catch {
        setReview(null);
        setConfirmed(false);
        setFailed(true);
        setMessage(
          "We couldn't reach publication controls. Reload and review again.",
        );
      }
    });
  }
  return (
    <section
      id="copy-review"
      aria-label="Copy publication"
      tabIndex={-1}
      className="scroll-mt-24 space-y-5 rounded-xl border p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
    >
      <h2 className="font-heading text-2xl">Review this physical copy</h2>
      <p className="text-sm text-muted-foreground">
        Current approval:{" "}
        <strong>{initial.published ? "Published" : "Private"}</strong>. The
        public home shows up to eight recent approved copies. This text preview
        also shows the information permitted for public copy pages.
      </p>
      <div
        ref={previewRef}
        tabIndex={-1}
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PublicProjection item={(review ?? initial).item} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        {review && (
          <label className="flex min-h-11 items-start gap-3 rounded-lg bg-muted p-4">
            <input
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-foreground"
              checked={confirmed}
              disabled={pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              {published
                ? "I reviewed this public text and approve sharing this copy."
                : "I reviewed this copy and want to remove its public approval."}
            </span>
          </label>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending || (!!review && !confirmed)}>
            {pending
              ? "Checking…"
              : review
                ? published
                  ? "Approve reviewed copy"
                  : "Make reviewed copy private"
                : published
                  ? "Review publication"
                  : "Review removal"}
          </Button>
          {review && (
            <Button
              variant="outline"
              type="button"
              disabled={pending}
              onClick={() => {
                setReview(null);
                setConfirmed(false);
              }}
            >
              Cancel review
            </Button>
          )}
        </div>
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        {failed && (
          <a
            className="inline-flex min-h-11 items-center underline"
            href={`/app/settings/public?item=${initial.item.id}#copy-review`}
          >
            Reload copy
          </a>
        )}
      </form>
    </section>
  );
}
