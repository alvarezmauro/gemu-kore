"use client";
import { useState } from "react";
import Image from "next/image";
import { Box } from "lucide-react";
import type { ModelPoster as Poster } from "@/lib/three/contracts";
export function ModelPoster({ poster }: { poster: Poster | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="flex aspect-[4/3] max-h-[60dvh] w-full items-center justify-center rounded-xl bg-stone p-5">
      {poster && failed !== poster.url ? (
        <Image
          unoptimized
          src={poster.url}
          alt={poster.alt}
          width={poster.width}
          height={poster.height}
          className="h-full w-full object-contain"
          onError={() => setFailed(poster.url)}
        />
      ) : (
        <div className="space-y-2 text-center text-muted-foreground">
          <Box aria-hidden="true" className="mx-auto size-10" />
          <p className="text-sm">Static preview unavailable</p>
        </div>
      )}
    </div>
  );
}
