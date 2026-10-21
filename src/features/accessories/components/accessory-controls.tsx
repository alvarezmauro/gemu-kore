"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PhysicalDetails } from "@/features/consoles/components/physical-details";
import { ConsolePicker } from "@/features/consoles/components/console-picker";
import { CopyConfirm } from "@/features/collection/components/copy-confirm";
import type { CopyPhysicalDraft } from "@/features/collection/copy-validation";
import {
  lookupAccessories,
  lookupAccessoryVariants,
  refreshSelectedAccessory,
} from "../copy-actions";
import { submitAccessoryChange } from "../copy-client";
import { accessoryCopyUpdate } from "../copy-validation";
import type {
  AccessoryCopyDetail,
  AccessoryChoice,
  VariantChoice,
  Choices,
  CopyLocation,
} from "../copy-contracts";
import { AccessoryChoiceSummary } from "./accessory-choice-summary";
export function AccessoryControls({
  detail,
  locations,
}: {
  detail: AccessoryCopyDetail;
  locations: CopyLocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<CopyPhysicalDraft>({
      ...detail.fields,
      defects: [],
    }),
    [revision, setRevision] = useState(detail.revision);
  const [accessory, setAccessory] = useState(detail.accessory),
    [variant, setVariant] = useState<VariantChoice | null>(detail.variant),
    [accessories, setAccessories] = useState<Choices<AccessoryChoice> | null>(
      null,
    ),
    [variants, setVariants] = useState<Choices<VariantChoice> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const pending = useRef(false),
    alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  async function task(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch {
      setError("We couldn't load these choices. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Dialog
          open={open}
          onOpenChange={(value) => {
            if (pending.current) return;
            setOpen(value);
            setError("");
            if (value) {
              setDraft({ ...detail.fields, defects: [] });
              setRevision(detail.revision);
              setAccessory(detail.accessory);
              setVariant(detail.variant);
              setAccessories(null);
              setVariants(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>Edit accessory</Button>
          </DialogTrigger>
          <DialogContent
            className="min-w-0 [overflow-wrap:anywhere] sm:max-w-2xl [&_button]:max-w-full [&_button]:whitespace-normal"
            showCloseButton={!busy}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogTitle>Edit your accessory</DialogTitle>
            <DialogDescription>
              Change this physical copy. Meaningful edits return a published
              copy to private. Manage defects, photos and custom models
              separately.
            </DialogDescription>
            <form
              className="min-w-0 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!variant) {
                  setError("Choose a variant before saving.");
                  return;
                }
                const { defects, ...fields } = draft;
                void defects;
                const input = {
                  operation: "update",
                  id: detail.id,
                  expectedRevision: revision,
                  ...fields,
                  accessoryId: accessory.id,
                  accessoryRevision: accessory.revision,
                  variantId: variant.id,
                  variantRevision: variant.revision,
                };
                const valid = accessoryCopyUpdate.safeParse(input);
                if (!valid.success) {
                  setError(
                    valid.error.issues[0]?.message ?? "Check these details.",
                  );
                  return;
                }
                void task(async () => {
                  const result = await submitAccessoryChange(input);
                  if (result.status === "error") setError(result.message);
                  else {
                    setOpen(false);
                    setMessage("Accessory saved.");
                    router.refresh();
                  }
                });
              }}
            >
              <fieldset disabled={busy} className="min-w-0 space-y-6">
                {variant && (
                  <AccessoryChoiceSummary
                    accessory={accessory}
                    variant={variant}
                  />
                )}
                {!accessories ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 max-w-full whitespace-normal"
                    onClick={() =>
                      task(async () => {
                        const result = await lookupAccessories({});
                        if (result.status === "error") setError(result.message);
                        else setAccessories(result.data);
                      })
                    }
                  >
                    Correct variant identification
                  </Button>
                ) : (
                  <>
                    <ConsolePicker
                      label="accessories"
                      choices={accessories}
                      selectedId={accessory.id}
                      search={(query, page) =>
                        lookupAccessories({ query, page })
                      }
                      detail={(a) => a.slug}
                      choose={(a) => {
                        setAccessory(a);
                        setVariant(null);
                        setVariants(null);
                        void task(async () => {
                          const result = await lookupAccessoryVariants({
                            accessoryId: a.id,
                          });
                          if (result.status === "error")
                            setError(result.message);
                          else setVariants(result.data);
                        });
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        task(async () => {
                          const result = await lookupAccessoryVariants({
                            accessoryId: accessory.id,
                          });
                          if (result.status === "error")
                            setError(result.message);
                          else setVariants(result.data);
                        })
                      }
                    >
                      Find variants
                    </Button>
                    {variants && (
                      <ConsolePicker
                        key={accessory.id}
                        label="variants"
                        choices={variants}
                        selectedId={variant?.id}
                        search={(query, page) =>
                          lookupAccessoryVariants({
                            accessoryId: accessory.id,
                            query,
                            page,
                          })
                        }
                        optionName={(v) => `${v.name} (${v.slug})`}
                        detail={(v) => v.slug}
                        choose={(v) => setVariant(v)}
                      />
                    )}
                  </>
                )}
                {variant && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      task(async () => {
                        const result = await refreshSelectedAccessory({
                          accessoryId: accessory.id,
                          variantId: variant.id,
                        });
                        if (result.status === "error") setError(result.message);
                        else {
                          setAccessory(result.data.accessory);
                          setVariant(result.data.variant);
                        }
                      })
                    }
                  >
                    Refresh catalog choices
                  </Button>
                )}
                <PhysicalDetails
                  identity="variant"
                  data={draft}
                  change={setDraft}
                  locations={locations}
                  showDefects={false}
                />
              </fieldset>
              {error && (
                <p
                  ref={alert}
                  role="alert"
                  tabIndex={-1}
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <CopyConfirm
          label="Delete accessory"
          title="Delete this accessory copy?"
          description={`Delete this ${detail.accessory.name} (${detail.variant.name}) copy, its defects and attached media links? This cannot be undone. Shared catalog records, other copies and stored files remain available.`}
          input={{
            operation: "delete",
            id: detail.id,
            expectedRevision: detail.revision,
          }}
          submit={submitAccessoryChange}
          done={() => {
            router.push("/app/collection");
            router.refresh();
          }}
        />
      </div>
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
