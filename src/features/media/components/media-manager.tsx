"use client";
import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  movePhoto,
  photoLabels,
  type MediaItem,
  type Photo,
} from "../contracts";
import { submitMediaChange } from "../client";
import { PhotoUpload } from "./photo-upload";
import { PhotoDialog } from "./photo-dialog";
type Modal = {
  photo: Photo;
  mode: "view" | "edit" | "delete";
  trigger: HTMLElement;
};
export function MediaManager({
  item,
  photos,
  canManage,
}: {
  item: MediaItem;
  photos: Photo[];
  canManage: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<Modal | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    to: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const disabled = uploading || pending || modal !== null;
  function saveOrder(ids: string[]) {
    if (disabled || ids.every((id, index) => id === photos[index]?.id)) return;
    setError("");
    startTransition(async () => {
      const result = await submitMediaChange({
        operation: "reorder",
        collectionItemId: item.id,
        expectedRevision: item.revision,
        ids,
      });
      if (result.status === "error") setError(result.message);
      else {
        setMessage("Photo order saved.");
        router.refresh();
      }
    });
  }
  return (
    <div className="space-y-6">
      {canManage ? (
        <PhotoUpload
          itemId={item.id}
          disabled={disabled}
          onBusy={setUploading}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Your account can view photos. An editor or administrator can add and
          organize them.
        </p>
      )}
      <section aria-label="Collection photos" className="space-y-4">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="font-heading text-xl outline-none"
          >
            Photos{" "}
            <span className="text-muted-foreground">({photos.length})</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{item.label}</p>
          {canManage && photos.length > 1 && (
            <p
              id="photo-order-help"
              className="mt-2 text-sm text-muted-foreground"
            >
              Drag a photo&apos;s handle to change its position, or use the Move
              earlier and Move later buttons.
            </p>
          )}
        </div>
        <p role="status" className="text-sm">
          {pending ? "Saving photo order…" : message}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {photos.length === 0 ? (
          <EmptyState
            title="No photos for this copy"
            description="Add photos to record this physical copy's appearance, packaging and condition."
          />
        ) : (
          <ol
            aria-label="Photo gallery"
            className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
          >
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                data-photo-id={photo.id}
                className={`min-w-0 overflow-hidden rounded-xl bg-card ${over === photo.id ? "outline-2 outline-ring" : ""}`}
              >
                <button
                  className="block w-full focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`View photo ${index + 1}`}
                  onClick={(event) =>
                    setModal({
                      photo,
                      mode: "view",
                      trigger: event.currentTarget,
                    })
                  }
                  disabled={uploading || pending}
                >
                  <Image
                    unoptimized
                    src={photo.thumbnailUrl}
                    alt={
                      photo.altText ??
                      photo.caption ??
                      `${photoLabels[photo.type]} of ${item.label}`
                    }
                    width={photo.width}
                    height={photo.height}
                    className="aspect-[4/3] w-full bg-stone object-contain"
                  />
                </button>
                <div className="space-y-4 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{photoLabels[photo.type]}</Badge>
                    <Badge variant="outline">
                      {photo.publicApproved ? "Approved use" : "Private"}
                    </Badge>
                  </div>
                  <p className="break-words text-sm">
                    {photo.caption ?? `Photo ${index + 1}`}
                  </p>
                  {canManage && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={disabled}
                          onClick={(event) =>
                            setModal({
                              photo,
                              mode: "edit",
                              trigger: event.currentTarget,
                            })
                          }
                          aria-label={`Edit photo ${index + 1}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={disabled}
                          onClick={(event) =>
                            setModal({
                              photo,
                              mode: "delete",
                              trigger: event.currentTarget,
                            })
                          }
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          Remove
                        </Button>
                      </div>
                      {photos.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="touch-none cursor-grab"
                            disabled={disabled}
                            aria-label={`Drag photo ${index + 1}`}
                            aria-describedby="photo-order-help"
                            onPointerDown={(event) => {
                              if (!event.isPrimary || event.button !== 0)
                                return;
                              drag.current = {
                                id: photo.id,
                                to: index,
                                moved: false,
                                x: event.clientX,
                                y: event.clientY,
                              };
                              event.currentTarget.setPointerCapture(
                                event.pointerId,
                              );
                            }}
                            onPointerMove={(event) => {
                              const current = drag.current;
                              if (!current) return;
                              if (
                                Math.hypot(
                                  event.clientX - current.x,
                                  event.clientY - current.y,
                                ) < 6
                              )
                                return;
                              current.moved = true;
                              const target = document
                                .elementFromPoint(event.clientX, event.clientY)
                                ?.closest<HTMLElement>("[data-photo-id]");
                              const to = photos.findIndex(
                                (value) => value.id === target?.dataset.photoId,
                              );
                              if (to >= 0) {
                                current.to = to;
                                setOver(photos[to].id);
                              }
                            }}
                            onPointerUp={() => {
                              const current = drag.current;
                              drag.current = null;
                              setOver(null);
                              if (current?.moved)
                                saveOrder(
                                  movePhoto(
                                    photos.map((value) => value.id),
                                    current.id,
                                    current.to,
                                  ),
                                );
                            }}
                            onPointerCancel={() => {
                              drag.current = null;
                              setOver(null);
                            }}
                          >
                            <GripVertical aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={disabled || index === 0}
                            aria-label={`Move photo ${index + 1} earlier`}
                            onClick={() =>
                              saveOrder(
                                movePhoto(
                                  photos.map((value) => value.id),
                                  photo.id,
                                  index - 1,
                                ),
                              )
                            }
                          >
                            <ArrowUp aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={disabled || index === photos.length - 1}
                            aria-label={`Move photo ${index + 1} later`}
                            onClick={() =>
                              saveOrder(
                                movePhoto(
                                  photos.map((value) => value.id),
                                  photo.id,
                                  index + 1,
                                ),
                              )
                            }
                          >
                            <ArrowDown aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      {modal && (
        <PhotoDialog
          key={`${modal.photo.id}-${modal.mode}`}
          item={item}
          photo={modal.photo}
          mode={modal.mode}
          onClose={() => setModal(null)}
          onSuccess={(value) => {
            setMessage(value);
            router.refresh();
          }}
          returnFocus={() => {
            if (modal.mode === "delete") heading.current?.focus();
            else if (modal.trigger.isConnected) modal.trigger.focus();
            else heading.current?.focus();
          }}
        />
      )}
    </div>
  );
}
