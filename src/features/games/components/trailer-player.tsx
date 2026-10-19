"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  trailerLinks,
  trailerReference,
  type TrailerReference,
} from "../trailer-validation";
const TrailerMedia = dynamic(() => import("./trailer-media"), {
  loading: () => <p role="status">Loading trailer player…</p>,
  ssr: false,
});
export function TrailerPlayer({
  trailer,
  title,
}: {
  trailer: TrailerReference | null;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  // Defense in depth for all callers, including stored legacy values.
  const parsed = trailerReference.safeParse(trailer);
  if (!parsed.success)
    return (
      <p className="text-sm text-muted-foreground">No trailer recorded.</p>
    );
  const reference = parsed.data;
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        {reference.provider === "YOUTUBE" ? "YouTube" : "External video"} loads
        only when you open the player. Playback starts using the video controls.
      </p>
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close trailer" : "Load trailer"}
      </Button>
      {open && <TrailerMedia trailer={reference} title={title} />}
      <p className="text-sm">
        <a
          className="text-link underline underline-offset-4"
          href={trailerLinks(reference).external}
          target="_blank"
          rel="noopener noreferrer"
        >
          {reference.provider === "YOUTUBE"
            ? "Watch on YouTube"
            : "Open original video"}
        </a>
        {open && (
          <span className="block pt-2 text-muted-foreground">
            If playback is unavailable here, use the original video link.
          </span>
        )}
      </p>
    </div>
  );
}
