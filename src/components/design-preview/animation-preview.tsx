"use client";

import { useState } from "react";
import { Gamepad2, ArrowUpDown, Plus } from "lucide-react";
import { BlurFade } from "@/components/magic/blur-fade";
import { AnimatedList } from "@/components/motion/animated-list";
import {
  CardDetailScope,
  SharedLayoutRoot,
  SharedMedia,
} from "@/components/motion/card-detail";
import {
  CollectionCardMotion,
  PageEntry,
} from "@/components/motion/page-entry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const initialItems = [
  { id: "example-console", name: "Sample console" },
  { id: "example-game", name: "Sample game" },
  { id: "example-accessory", name: "Sample accessory" },
];

export function AnimationPreview() {
  const [items, setItems] = useState(initialItems);
  const [replay, setReplay] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={() => setReplay((value) => value + 1)}
        >
          Replay entry examples
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setItems((current) => [...current].reverse());
            setAnnouncement("Example order reversed.");
          }}
        >
          <ArrowUpDown aria-hidden="true" />
          Reverse example order
        </Button>
        <Button
          variant="secondary"
          disabled={items.length >= 4}
          onClick={() => {
            setItems((current) => [
              ...current,
              { id: "example-added", name: "New example" },
            ]);
            setAnnouncement("New example added.");
          }}
        >
          <Plus aria-hidden="true" />
          Add example
        </Button>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <CardDetailScope>
          <Dialog>
            <PageEntry key={replay}>
              <CollectionCardMotion data-testid="motion-card">
                <Card className="gap-0 pt-0">
                  <SharedMedia
                    identity="example-controller-media"
                    className="flex aspect-[4/3] items-center justify-center rounded-t-xl bg-stone p-6"
                  >
                    <Gamepad2
                      className="size-16 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </SharedMedia>
                  <CardContent className="space-y-4 pt-6">
                    <h3 className="text-xl leading-7">Controller example</h3>
                    <p className="text-body">
                      A short entrance and a quiet hover. Open the detail to see
                      the image keep its place.
                    </p>
                    <DialogTrigger asChild>
                      <Button>Open example detail</Button>
                    </DialogTrigger>
                  </CardContent>
                </Card>
              </CollectionCardMotion>
            </PageEntry>
            <DialogContent asChild showCloseButton={false}>
              <SharedLayoutRoot data-shared-layout>
                <DialogHeader>
                  <DialogTitle>Controller example detail</DialogTitle>
                  <DialogDescription>
                    A presentation example. No collection data is loaded.
                  </DialogDescription>
                </DialogHeader>
                <SharedMedia
                  identity="example-controller-media"
                  className="flex aspect-[4/3] items-center justify-center rounded-xl bg-stone p-6"
                >
                  <Gamepad2
                    className="size-24 text-muted-foreground"
                    aria-hidden="true"
                  />
                </SharedMedia>
                <p className="text-body">
                  The media connects this detail to its card. With reduced
                  motion, the detail opens immediately.
                </p>
                <DialogClose asChild>
                  <Button variant="secondary">Close example detail</Button>
                </DialogClose>
              </SharedLayoutRoot>
            </DialogContent>
          </Dialog>
        </CardDetailScope>
        <div className="rounded-xl bg-card p-6">
          <h3 className="mb-4 text-xl leading-7">List transition example</h3>
          <AnimatedList
            label="Animation example items"
            items={items.map((item) => ({
              id: item.id,
              content: (
                <div className="rounded-lg bg-muted px-4 py-3">{item.name}</div>
              ),
            }))}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Order changes immediately; the movement helps you follow it. These
            are unsaved examples.
          </p>
        </div>
      </div>
      <BlurFade key={replay}>
        <p className="text-body">
          Blur Fade example: a softer entrance for an optional presentation
          detail.
        </p>
      </BlurFade>
      <noscript>
        Motion examples are static without JavaScript. All example content
        remains readable.
      </noscript>
    </div>
  );
}
