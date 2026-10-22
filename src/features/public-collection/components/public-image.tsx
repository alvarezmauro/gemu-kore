"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageOff } from "lucide-react";
import type { PublicImage as ImageContract } from "../contracts";
export function PublicImage({
  image,
  priority = false,
}: {
  image: ImageContract;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-stone">
      {failed ? (
        <div
          role="status"
          className="space-y-3 p-6 text-center text-muted-foreground"
        >
          <ImageOff className="mx-auto size-10" aria-hidden="true" />
          <p>Image unavailable</p>
        </div>
      ) : (
        <Image
          unoptimized
          src={image.url}
          alt={image.alt}
          width={image.width}
          height={image.height}
          priority={priority}
          onError={() => setFailed(true)}
          className="h-full max-h-[36rem] w-full object-contain p-3"
        />
      )}
    </div>
  );
}
