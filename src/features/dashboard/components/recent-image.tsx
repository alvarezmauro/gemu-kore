"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import type { RecentItem } from "../contracts";
export function RecentImage({ photo }: { photo: RecentItem["photo"] }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone">
      {photo && failed !== photo.url ? (
        <Image
          unoptimized
          src={photo.url}
          width={photo.width}
          height={photo.height}
          alt={photo.alt}
          className="size-full object-contain"
          onError={() => setFailed(photo.url)}
        />
      ) : (
        <span className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-5" />
          <span>{photo ? "Unavailable" : "No photo"}</span>
        </span>
      )}
    </div>
  );
}
