"use client";
import { useState } from "react";
import { trailerLinks, type TrailerReference } from "../trailer-validation";
export default function TrailerMedia({
  trailer,
  title,
}: {
  trailer: TrailerReference;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <p role="alert">
        This video could not be loaded. Try the original video link below.
      </p>
    );
  if (trailer.provider === "YOUTUBE")
    return (
      <iframe
        className="aspect-video min-h-[200px] w-full rounded-xl bg-stone"
        src={trailerLinks(trailer).embed}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        onError={() => setFailed(true)}
      />
    );
  return (
    // External files may include their own captions; no fabricated caption track.
    <video
      className="aspect-video w-full rounded-xl bg-stone"
      src={trailer.url}
      aria-label={title}
      controls
      playsInline
      preload="none"
      onError={() => setFailed(true)}
    />
  );
}
