"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PhysicalDetails } from "./physical-details";
import { ConsolePicker } from "./console-picker";
import { ConsoleConfirm } from "./console-confirm";
import { lookupConsolePlatforms, lookupConsoleModels } from "../actions";
import { submitConsoleChange } from "../client";
import { consoleUpdate, type ConsolePhysicalDraft } from "../validation";
import type {
  ConsoleDetail,
  ConsoleLocation,
  ConsolePlatformOption,
  ConsoleModelOption,
  ConsoleChoices,
} from "../contracts";
export function ConsoleControls({
  detail,
  locations,
}: {
  detail: Pick<
    ConsoleDetail,
    "id" | "revision" | "fields" | "model" | "platform"
  >;
  locations: ConsoleLocation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ConsolePhysicalDraft>({
    ...detail.fields,
    defects: [],
  });
  const [revision, setRevision] = useState(detail.revision);
  const [platform, setPlatform] = useState<ConsolePlatformOption>(
    detail.platform,
  );
  const [model, setModel] = useState<ConsoleModelOption | null>(detail.model);
  const [platforms, setPlatforms] =
    useState<ConsoleChoices<ConsolePlatformOption> | null>(null);
  const [models, setModels] =
    useState<ConsoleChoices<ConsoleModelOption> | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, startTransition] = useTransition();
  const pending = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => alert.current?.focus());
  }
  function task(run: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    startTransition(async () => {
      try {
        await run();
      } catch {
        showError("We couldn't load these choices. Try again.");
      } finally {
        pending.current = false;
      }
    });
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
              setPlatform(detail.platform);
              setModel(detail.model);
              setPlatforms(null);
              setModels(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>Edit console</Button>
          </DialogTrigger>
          <DialogContent
            className="sm:max-w-2xl"
            showCloseButton={!busy}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogTitle>Edit your console</DialogTitle>
            <DialogDescription>
              Change this physical copy. Catalog facts belong to the selected
              model. Meaningful edits return a published copy to private.
            </DialogDescription>
            <form
              className="min-w-0 space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (!model) {
                  showError("Choose a model before saving.");
                  return;
                }
                const fields = {
                  serialNumber: draft.serialNumber,
                  observedMarkings: draft.observedMarkings,
                  hasBox: draft.hasBox,
                  locationId: draft.locationId,
                  notes: draft.notes,
                };
                const input = {
                  operation: "update",
                  id: detail.id,
                  expectedRevision: revision,
                  ...fields,
                  platformId: platform.id,
                  platformRevision: platform.revision,
                  modelId: model.id,
                  modelRevision: model.revision,
                };
                const valid = consoleUpdate.safeParse(input);
                if (!valid.success) {
                  showError(
                    valid.error.issues[0]?.message ?? "Check these details.",
                  );
                  return;
                }
                task(async () => {
                  const result = await submitConsoleChange(input);
                  if (result.status === "error") showError(result.message);
                  else {
                    setOpen(false);
                    setMessage("Console saved.");
                    router.refresh();
                  }
                });
              }}
            >
              <fieldset disabled={busy} className="min-w-0 space-y-6">
                <section
                  className="min-w-0 space-y-3 rounded-xl bg-muted p-4"
                  aria-label="Catalog identity"
                >
                  <h3 className="font-medium">Catalog identity</h3>
                  <p className="break-words">
                    {platform.name} · {model?.name ?? "Choose a model"}
                  </p>
                  {model && (
                    <p className="text-sm text-muted-foreground">
                      {model.modelNumber ?? "Model number unknown"} · Commercial
                      markets: {model.markets.join(", ") || "Unknown"} ·{" "}
                      {model.identificationStatus === "INCOMPLETE"
                        ? "Identity incomplete"
                        : "Identity confirmed"}
                    </p>
                  )}
                  {!platforms ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-11 max-w-full whitespace-normal"
                      onClick={() =>
                        task(async () => {
                          const result = await lookupConsolePlatforms({});
                          if (result.status === "error")
                            showError(result.message);
                          else setPlatforms(result.data);
                        })
                      }
                    >
                      Correct model identification
                    </Button>
                  ) : (
                    <>
                      <ConsolePicker
                        label="consoles"
                        choices={platforms}
                        selectedId={platform.id}
                        search={(query, page) =>
                          lookupConsolePlatforms({ query, page })
                        }
                        detail={(p) => p.manufacturer ?? "Manufacturer unknown"}
                        choose={(p) => {
                          if (pending.current) return;
                          setPlatform(p);
                          setModel(null);
                          setModels(null);
                          setError("");
                          task(async () => {
                            const result = await lookupConsoleModels({
                              platformId: p.id,
                            });
                            if (result.status === "error")
                              showError(result.message);
                            else {
                              setModels(result.data);
                              if (
                                result.data.items.length === 1 &&
                                !result.data.hasMore
                              )
                                setModel(result.data.items[0]);
                            }
                          });
                        }}
                      />
                      {models && (
                        <ConsolePicker
                          key={platform.id}
                          label="models"
                          choices={models}
                          selectedId={model?.id}
                          search={(query, page) =>
                            lookupConsoleModels({
                              platformId: platform.id,
                              query,
                              page,
                            })
                          }
                          detail={(m) =>
                            `${m.modelNumber ?? "Model number unknown"} · ${m.markets.join(", ") || "Markets unknown"}`
                          }
                          choose={(m) => {
                            if (!pending.current) {
                              setModel(m);
                              setError("");
                            }
                          }}
                        />
                      )}
                      {!models && (
                        <p className="text-sm">
                          Select a console above to load its active models.
                        </p>
                      )}
                    </>
                  )}
                </section>
                <PhysicalDetails
                  data={draft}
                  change={setDraft}
                  locations={locations}
                  showDefects={false}
                />
              </fieldset>
              {error && (
                <p
                  ref={alert}
                  tabIndex={-1}
                  role="alert"
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
        <ConsoleConfirm
          label="Delete console"
          title="Delete this console copy?"
          description={`Delete this ${detail.platform.name} (${detail.model.name}) copy, its defects and attached media links? This cannot be undone. Shared catalog records, other copies and stored files remain available.`}
          input={{
            operation: "delete",
            id: detail.id,
            expectedRevision: detail.revision,
          }}
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
