"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  reviewPublicMedia,
  savePublicMedia,
  reviewPublicComponent,
  savePublicComponent,
} from "../actions";
type Choices = {
  uses: {
    id: string;
    kind: "personal" | "catalog";
    label: string;
    outputs: { id: string; label: string }[];
  }[];
  components: { id: string; name: string; presentationApproved: boolean }[];
};
export function MediaPublication({ choices }: { choices: Choices }) {
  return (
    <section aria-label="Media publication" className="space-y-6 border-t pt-8">
      <h2 className="font-heading text-2xl">Review public media</h2>
      <p className="text-sm text-muted-foreground">
        Approve each prepared display file separately. Inspect all pixels,
        embedded textures, captions and alternative text. Public media must
        exclude serials, precise locations, private notes and account details.
        You must have rights to every contributing source. Approving personal
        media returns its copy to private for another review.
      </p>
      {!choices.uses.length && (
        <p>
          No prepared display media is available. Upload or prepare a display
          version before reviewing it.
        </p>
      )}
      {choices.uses.map((use) => (
        <MediaUse key={use.id} use={use} />
      ))}
      {choices.components.map((c) => (
        <ComponentUse key={`${c.id}:${c.presentationApproved}`} component={c} />
      ))}
    </section>
  );
}
function MediaUse({ use }: { use: Choices["uses"][number] }) {
  const router = useRouter(),
    [output, setOutput] = useState(use.outputs[0].id),
    [review, setReview] = useState<Awaited<
      ReturnType<typeof reviewPublicMedia>
    > | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const preview = review?.status === "success" ? review.data : null;
  function submit(approved: boolean) {
    start(async () => {
      try {
        const input = {
          kind: use.kind,
          useId: use.id,
          displayAssetId: output,
          approved,
        };
        if (!preview) {
          const r = await reviewPublicMedia(input);
          setReview(r);
          setConfirmed(false);
          if (r.status === "error") setMessage(r.message);
        } else {
          const r = await savePublicMedia({
            ...input,
            approved: preview.approved,
            reviewToken: preview.reviewToken,
            reviewed: confirmed,
          });
          setReview(null);
          setConfirmed(false);
          setMessage(
            r.status === "success"
              ? "Media review saved. Refresh and review the copy before publishing it."
              : r.message,
          );
          if (r.status === "success") router.refresh();
        }
      } catch {
        setReview(null);
        setMessage("Media review is unavailable. Reload and try again.");
      }
    });
  }
  return (
    <div className="space-y-4 rounded-xl border p-5">
      <h3 className="font-heading text-xl">{use.label}</h3>
      <label className="block space-y-2">
        <span>Prepared display version</span>
        <select
          value={output}
          disabled={pending}
          onChange={(e) => {
            setOutput(e.target.value);
            setReview(null);
            setConfirmed(false);
            setMessage("");
          }}
          className="min-h-11 w-full rounded-lg border border-input bg-background px-3"
        >
          {use.outputs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {preview && (
        <div className="space-y-3">
          {preview.kind === "IMAGE" ? (
            <Image
              unoptimized
              src={preview.url}
              width={640}
              height={480}
              alt="Prepared display file for private review"
              className="max-h-96 w-full object-contain"
            />
          ) : (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={preview.url}
            >
              Inspect prepared model file
            </a>
          )}
          <p>Caption: {preview.caption ?? "None"}</p>
          <p>Alternative text: {preview.altText ?? "Collection object"}</p>
          <p>{preview.inputs} contributing files.</p>
          <label className="flex min-h-11 items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 size-5 shrink-0"
            />
            <span>
              {preview.approved
                ? "I inspected this exact output and its labels, confirm it excludes identifying private content, and confirm public-use rights for every source."
                : "I reviewed this media use and want to withdraw its public approval."}
            </span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={pending || (!!preview && !confirmed)}
          onClick={() => submit(true)}
        >
          {pending
            ? "Checking…"
            : preview
              ? "Save reviewed media"
              : "Review media approval"}
        </Button>
        {!preview && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => submit(false)}
          >
            Review withdrawal
          </Button>
        )}
        {preview && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => {
              setReview(null);
              setConfirmed(false);
            }}
          >
            Cancel media review
          </Button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
function ComponentUse({
  component,
}: {
  component: Choices["components"][number];
}) {
  const router = useRouter(),
    [review, setReview] = useState<Awaited<
      ReturnType<typeof reviewPublicComponent>
    > | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [pending, start] = useTransition();
  const preview = review?.status === "success" ? review.data : null;
  return (
    <div className="space-y-4 rounded-xl border p-5">
      <h3 className="font-heading text-xl">
        {component.name} · 3D presentation
      </h3>
      <p>
        Current approval:{" "}
        {component.presentationApproved ? "Approved" : "Private"}. Review the
        assigned template and all artwork in the private physical edition
        editor. Required artwork and geometry must already have current content
        and rights reviews.
      </p>
      {preview && (
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={pending}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1 size-5 shrink-0"
          />
          <span>
            I reviewed this component’s geometry, artwork, camera and template
            revision {preview.templateRevision} and confirm this change.
          </span>
        </label>
      )}
      <Button
        disabled={pending || (!!preview && !confirmed)}
        onClick={() =>
          start(async () => {
            try {
              const input = {
                componentId: component.id,
                approved: !component.presentationApproved,
              };
              const r = preview
                ? await savePublicComponent({
                    ...input,
                    reviewToken: preview.reviewToken,
                    reviewed: confirmed,
                  })
                : await reviewPublicComponent(input);
              if (preview) {
                setReview(null);
                setConfirmed(false);
                setMessage(
                  r.status === "success"
                    ? "Component review saved."
                    : r.message,
                );
                if (r.status === "success") router.refresh();
              } else {
                setConfirmed(false);
                setReview(
                  r as Awaited<ReturnType<typeof reviewPublicComponent>>,
                );
                if (r.status === "error") setMessage(r.message);
              }
            } catch {
              setReview(null);
              setConfirmed(false);
              setMessage(
                "Component review is unavailable. Reload and try again.",
              );
            }
          })
        }
      >
        {pending
          ? "Checking…"
          : preview
            ? "Save component review"
            : component.presentationApproved
              ? "Review component withdrawal"
              : "Review component approval"}
      </Button>
      {preview && (
        <Button
          variant="outline"
          onClick={() => {
            setReview(null);
            setConfirmed(false);
          }}
        >
          Cancel component review
        </Button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
