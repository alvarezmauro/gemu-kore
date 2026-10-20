"use client";
import Image from "next/image";
import { useState } from "react";

export function GameCover({
  cover,
}: {
  cover: { url: string; alt: string; width: number; height: number } | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-stone p-4 sm:p-6">
      {cover && failed !== cover.url ? (
        <Image
          unoptimized
          src={cover.url}
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          loading="eager"
          fetchPriority="high"
          className="h-full w-full object-contain"
          onError={() => setFailed(cover.url)}
        />
      ) : (
        <p className="max-w-48 text-center text-sm text-muted-foreground">
          {cover ? "Cover image unavailable" : "No catalog cover available"}
        </p>
      )}
    </div>
  );
}
