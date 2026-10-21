"use client";

import { copyLink } from "@/features/collection/copy-links";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Search, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { BlurFade } from "@/components/magic/blur-fade";
import { requestPaletteSearch } from "../client";
import { usePrivateSearch } from "../use-private-search";
import type { SearchHit } from "../contracts";
import type { CatalogHit } from "../palette-contracts";

const PaletteContext = createContext<((trigger?: HTMLElement) => void) | null>(
  null,
);
const kinds = {
  company: "Company",
  platform: "Console platform",
  model: "Console model",
  game: "Game",
  release: "Game release",
  accessory: "Accessory family",
  variant: "Accessory variant",
  region: "Region",
};
const groups = [
  { type: "CONSOLE", label: "Consoles" },
  { type: "GAME", label: "Games" },
  { type: "ACCESSORY", label: "Accessories" },
] as const;
const destinations = [
  { title: "Your collection", href: "/app" },
  { title: "Browse collection", href: "/app/collection" },
  { title: "Search collection", href: "/app/search" },
  { title: "Manage locations", href: "/app/locations" },
  { title: "Manage defects", href: "/app/defects" },
  { title: "Manage photos", href: "/app/media" },
];

export function PaletteTrigger({ compact = false }: { compact?: boolean }) {
  const open = useContext(PaletteContext);
  if (!open) return null;
  return (
    <Button
      variant="outline"
      size={compact ? "icon" : "default"}
      aria-label="Open command palette"
      aria-haspopup="dialog"
      onClick={(event) => open(event.currentTarget)}
    >
      <Search aria-hidden="true" />
      {!compact && (
        <>
          Quick search{" "}
          <kbd className="ml-2 hidden text-xs text-muted-foreground sm:inline">
            ⌘K / Ctrl+K
          </kbd>
        </>
      )}
    </Button>
  );
}

export function CommandPalette({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  function show(trigger?: HTMLElement) {
    opener.current =
      trigger ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setOpen(true);
  }
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "k"
      )
        return;
      // Do not interrupt another modal's form, confirmation or navigation sheet.
      if (!open && document.querySelector('[role="dialog"][data-state="open"]'))
        return;
      event.preventDefault();
      if (open) setOpen(false);
      else show();
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [open]);
  return (
    <PaletteContext.Provider value={show}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
            else document.getElementById("main-content")?.focus();
          }}
        >
          <DialogTitle className="sr-only">Quick search</DialogTitle>
          <DialogDescription className="sr-only">
            Search owned copies and catalog identities, or go to a collection
            page. Use arrow keys and Enter to select. Escape closes the palette.
          </DialogDescription>
          {open && <PaletteSession close={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}

type Selection =
  { scope: "copy"; item: SearchHit } | { scope: "catalog"; item: CatalogHit };
function PaletteSession({ close }: { close: () => void }) {
  const { q, state, update, retry, valid } =
    usePrivateSearch(requestPaletteSearch);
  const [selected, setSelected] = useState<Selection | null>(null);
  const router = useRouter();
  const result = state.status === "ready" ? state.result : null;
  const visiblePages = destinations.filter((page) =>
    q
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) => page.title.toLowerCase().includes(word)),
  );
  function go(href: string) {
    close();
    router.push(href);
  }
  return (
    <Command
      shouldFilter={false}
      vimBindings={false}
      loop
      label="Search copies, catalog or pages"
    >
      <CommandInput
        autoFocus
        placeholder="Search copies, catalog or pages…"
        aria-label="Search copies, catalog or pages"
        aria-invalid={!valid}
        aria-describedby={
          state.status === "error"
            ? "palette-help palette-error"
            : "palette-help"
        }
        value={q}
        maxLength={640}
        autoComplete="off"
        spellCheck={false}
        onValueChange={(value) => {
          setSelected(null);
          update(value);
        }}
      />
      <p id="palette-help" className="px-4 pt-3 text-xs text-muted-foreground">
        {selected
          ? "Identity preview · Choose an action below."
          : "Search copies or catalog names. Enter at least two characters."}
      </p>
      <CommandList
        aria-label="Quick search results"
        aria-busy={state.status === "pending"}
      >
        {selected ? (
          <>
            <div className="space-y-2 px-3 py-3">
              <p className="text-xs text-muted-foreground">
                {selected.scope === "copy"
                  ? `Owned copy · ${selected.item.id.slice(0, 8)}`
                  : `Catalog · ${kinds[selected.item.kind]}`}
              </p>
              <h2 className="break-words font-heading text-lg">
                {selected.item.title}
              </h2>
              <p className="break-words text-sm text-muted-foreground">
                {selected.item.context}
              </p>
              {selected.item.identificationStatus === "INCOMPLETE" && (
                <p className="text-sm">Identity incomplete</p>
              )}
              {selected.scope === "catalog" && (
                <p className="text-xs text-muted-foreground">
                  Canonical identity; this record does not represent a physical
                  copy.
                </p>
              )}
            </div>
            <CommandGroup heading="Actions">
              <CommandItem value="back" onSelect={() => setSelected(null)}>
                <ArrowLeft aria-hidden="true" />
                Back to results
              </CommandItem>
              {selected.scope === "copy" && (
                <>
                  <CommandItem
                    value="copy-detail"
                    onSelect={() =>
                      go(copyLink(selected.item.type, selected.item.id).href)
                    }
                  >
                    {copyLink(selected.item.type, selected.item.id).label}
                  </CommandItem>
                  <CommandItem
                    value="photos"
                    onSelect={() => go(`/app/media?itemId=${selected.item.id}`)}
                  >
                    <Camera aria-hidden="true" />
                    View copy photos
                  </CommandItem>
                  <CommandItem
                    value="defects"
                    onSelect={() =>
                      go(`/app/defects?itemId=${selected.item.id}`)
                    }
                  >
                    <Wrench aria-hidden="true" />
                    View copy defects
                  </CommandItem>
                </>
              )}
            </CommandGroup>
          </>
        ) : (
          <>
            <div role="status" className="px-3 text-sm text-muted-foreground">
              {state.status === "pending"
                ? "Searching…"
                : result
                  ? `${result.collection.items.length} ${result.collection.items.length === 1 ? "copy" : "copies"} and ${result.catalog.length} catalog ${result.catalog.length === 1 ? "match" : "matches"}`
                  : ""}
            </div>
            {state.status === "error" && (
              <>
                <p
                  id="palette-error"
                  role="alert"
                  className="px-3 py-3 text-sm text-destructive"
                >
                  {state.message}
                </p>
                {valid && (
                  <CommandItem value="retry" onSelect={retry}>
                    Try search again
                  </CommandItem>
                )}
              </>
            )}
            {result && (
              <BlurFade key={q}>
                {groups.map((group) => {
                  const items = result.collection.items.filter(
                    (item) => item.type === group.type,
                  );
                  return items.length ? (
                    <CommandGroup key={group.type} heading={group.label}>
                      {items.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={`copy:${item.id}`}
                          onSelect={() => setSelected({ scope: "copy", item })}
                        >
                          <span className="min-w-0">
                            <span className="block break-words font-medium">
                              {item.title}
                            </span>
                            <span className="block break-words text-xs text-muted-foreground">
                              {item.context} · Copy {item.id.slice(0, 8)}
                            </span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : null;
                })}
                {result.catalog.length > 0 && (
                  <CommandGroup heading="Catalog">
                    {result.catalog.map((item) => (
                      <CommandItem
                        key={`${item.kind}:${item.id}`}
                        value={`catalog:${item.kind}:${item.id}`}
                        onSelect={() => setSelected({ scope: "catalog", item })}
                      >
                        <span className="min-w-0">
                          <span className="block break-words font-medium">
                            {item.title}
                          </span>
                          <span className="block break-words text-xs text-muted-foreground">
                            {kinds[item.kind]}
                            {item.context ? ` · ${item.context}` : ""}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {!result.collection.items.length && !result.catalog.length && (
                  <p className="px-3 py-4 text-sm">
                    No matching copies or catalog identities. Try another name
                    or fewer words.
                  </p>
                )}
                {(result.collection.hasMore || result.catalogHasMore) && (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    More matches available. Add another word to narrow your
                    search.
                  </p>
                )}
              </BlurFade>
            )}
            {visiblePages.length > 0 && (
              <CommandGroup heading="Go to">
                {visiblePages.map((page) => (
                  <CommandItem
                    key={page.href}
                    value={`page:${page.href}`}
                    onSelect={() => go(page.href)}
                  >
                    {page.title}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        ↑ ↓ Navigate · Enter Select · Esc Close
      </p>
    </Command>
  );
}
