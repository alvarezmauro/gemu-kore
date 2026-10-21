"use client";
import { AssetSource } from "@/features/provenance/components/asset-source";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { motionEase, motionTiming } from "@/lib/motion/tokens";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BlurFade } from "@/components/magic/blur-fade";
import { ConsoleImage } from "@/features/consoles/components/console-image";
import type { ScreenshotGalleryData } from "../screenshot-contracts";
export function ScreenshotGallery({
  gallery,
  previous,
  next,
}: {
  gallery: ScreenshotGalleryData;
  previous?: string;
  next?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const trigger = useRef<HTMLAnchorElement | null>(null);
  const allowed = useMotionAllowed();
  const photo = index === null ? null : gallery.items[index];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {gallery.scope === "game"
          ? "Game-level screenshots; this release has no screenshots of its own."
          : "Screenshots of this release."}
      </p>
      {gallery.items.length ? (
        <ul className="grid min-w-0 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {gallery.items.map((item, i) => (
            <li key={item.id} className="min-w-0 space-y-3">
              <BlurFade inView>
                <a
                  href={item.url}
                  aria-label={`View screenshot ${(gallery.page - 1) * 16 + i + 1}`}
                  className="block rounded-xl focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={(e) => {
                    e.preventDefault();
                    trigger.current = e.currentTarget;
                    setIndex(i);
                  }}
                >
                  <ConsoleImage
                    {...item}
                    alt={
                      item.altText ??
                      item.caption ??
                      `Screenshot ${(gallery.page - 1) * 16 + i + 1}`
                    }
                  />
                </a>
              </BlurFade>
              {item.caption && (
                <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                  {item.caption}
                </p>
              )}
              <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm">
                  Screenshot source details
                </summary>
                <AssetSource source={item.source} />
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No screenshots recorded.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {previous && (
          <Button asChild variant="outline">
            <Link href={previous}>Previous screenshots</Link>
          </Button>
        )}
        <p className="text-sm">Page {gallery.page}</p>
        {next && (
          <Button asChild variant="outline">
            <Link href={next}>More screenshots</Link>
          </Button>
        )}
      </div>
      <Dialog
        open={photo !== null}
        onOpenChange={(open) => {
          if (!open) setIndex(null);
        }}
      >
        <DialogContent
          className="sm:max-w-4xl"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" && index !== null && index > 0) {
              e.preventDefault();
              setIndex(index - 1);
            }
            if (
              e.key === "ArrowRight" &&
              index !== null &&
              index < gallery.items.length - 1
            ) {
              e.preventDefault();
              setIndex(index + 1);
            }
          }}
        >
          <DialogTitle>
            Screenshot{" "}
            {index === null ? "" : (gallery.page - 1) * 16 + index + 1}
          </DialogTitle>
          <DialogDescription>
            {photo?.caption ?? "Game screenshot"}
          </DialogDescription>
          {photo && (
            <>
              <motion.div
                key={`${photo.id}:${allowed}`}
                data-screenshot-motion={allowed ? "enabled" : "disabled"}
                initial={allowed ? { opacity: 0.96 } : false}
                animate={{ opacity: 1 }}
                transition={{
                  duration: motionTiming.enter / 1000,
                  ease: motionEase,
                }}
              >
                <ConsoleImage
                  {...photo}
                  alt={photo.altText ?? photo.caption ?? "Game screenshot"}
                />
              </motion.div>
              <AssetSource source={photo.source} />
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={index === null || index === 0}
                  onClick={() => setIndex(index! - 1)}
                >
                  Previous image
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    index === null || index === gallery.items.length - 1
                  }
                  onClick={() => setIndex(index! + 1)}
                >
                  Next image
                </Button>
                <Button onClick={() => setIndex(null)}>Close screenshot</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
