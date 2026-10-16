"use client";
import { useState } from "react";
import Image from "next/image";
import { Gamepad2 } from "lucide-react";
export function ConsoleImage({
  url,
  alt,
  width = 480,
  height = 320,
}: {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="flex aspect-[3/2] items-center justify-center overflow-hidden rounded-xl bg-stone p-4">
      {failed !== url ? (
        <Image
          unoptimized
          src={url}
          alt={alt}
          width={width}
          height={height}
          className="h-full w-full object-contain"
          onError={() => setFailed(url)}
        />
      ) : (
        <div className="text-center text-sm text-muted-foreground">
          <Gamepad2 aria-hidden="true" className="mx-auto mb-2" />
          Image unavailable
        </div>
      )}
    </div>
  );
}
