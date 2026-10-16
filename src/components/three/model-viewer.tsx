"use client";
import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  modelPresentation,
  modelLimits,
  ModelError,
  type ModelPresentation,
  type ModelPoster as Poster,
  type ModelPresentationResult,
} from "@/lib/three/contracts";
import { ModelPoster } from "./model-poster";
const Runtime = dynamic(() => import("./model-viewer-runtime"), {
  ssr: false,
  loading: () => (
    <div>
      <div className="w-full aspect-[4/3] max-h-[60dvh]" />
      <p role="status" className="mt-3 text-sm">
        Opening 3D viewer…
      </p>
    </div>
  ),
});
class ViewerBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError(
      "The 3D viewer is unavailable on this device. The console details and download remain available.",
    );
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function ModelViewer({
  title,
  source,
  poster = null,
  available = true,
  load,
}: {
  title: string;
  source: string;
  poster?: Poster | null;
  available?: boolean;
  load: () => Promise<ModelPresentationResult>;
}) {
  const [presentation, setPresentation] = useState<ModelPresentation | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const generation = useRef(0),
    pending = useRef(false),
    mounted = useRef(true);
  const descriptionId = useId();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const failed = useCallback((message: string) => {
    setPresentation(null);
    setReady(false);
    setError(message);
  }, []);
  const rendered = useCallback(() => setReady(true), []);
  function close() {
    generation.current++;
    pending.current = false;
    setPresentation(null);
    setReady(false);
    setBusy(false);
    setExpanded(false);
    setError("");
    if (document.fullscreenElement === container.current)
      void document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => trigger.current?.focus());
  }
  async function activate(dialog = false) {
    if (pending.current || !available) return;
    pending.current = true;
    const ticket = ++generation.current;
    setBusy(true);
    setReady(false);
    setError("");
    setPresentation(null);
    setExpanded(dialog);
    try {
      const result = await load();
      if (!mounted.current || ticket !== generation.current) return;
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      const parsed = modelPresentation.safeParse(result.data);
      if (!parsed.success) {
        setError(
          "This model preview is unavailable. Refresh before trying again.",
        );
        return;
      }
      if (parsed.data.resource.byteLength > modelLimits.bytes) {
        setError(new ModelError().message);
        return;
      }
      setPresentation(parsed.data);
      requestAnimationFrame(() =>
        container.current?.scrollIntoView({ block: "nearest" }),
      );
    } catch {
      if (mounted.current && ticket === generation.current)
        setError("We couldn't load this model preview. Refresh or try again.");
    } finally {
      if (mounted.current && ticket === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  function expand() {
    setPresentation(null);
    setReady(false);
    void activate(true);
  }
  const panel = (
    <div
      ref={container}
      className="min-w-0 space-y-4 bg-background p-1 [overflow-wrap:anywhere] [&:fullscreen]:h-dvh [&:fullscreen]:overflow-y-auto [&:fullscreen]:p-4"
    >
      <p id={descriptionId} className="text-sm text-muted-foreground">
        {presentation?.title ?? title} · {presentation?.source ?? source}
      </p>
      <div className="relative min-w-0">
        {!ready && (
          <div
            className={
              presentation
                ? "pointer-events-none absolute inset-x-0 top-0 z-10"
                : ""
            }
          >
            <ModelPoster poster={presentation?.poster ?? poster} />
          </div>
        )}
        {presentation && (
          <ViewerBoundary key={presentation.presentationKey} onError={failed}>
            <Runtime
              presentation={presentation}
              onReady={rendered}
              onError={failed}
              onExpand={expand}
              container={container}
              descriptionId={descriptionId}
            />
          </ViewerBoundary>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm">
          Checking access to this model…
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {!presentation && available && (
          <Button
            ref={trigger}
            disabled={busy}
            onClick={() => void activate(expanded)}
          >
            {error ? "Try 3D again" : "View in 3D"}
          </Button>
        )}
        {(presentation || busy || expanded) && (
          <Button variant="outline" onClick={close}>
            Close 3D preview
          </Button>
        )}
      </div>
      {!available && (
        <p className="text-sm text-muted-foreground">
          No 3D model is available. You can still use the console details and
          photos.
        </p>
      )}
      <noscript>
        Interactive 3D needs JavaScript. All console details and available
        static images remain readable.
      </noscript>
    </div>
  );
  return (
    <section
      aria-label="3D preview"
      aria-busy={busy || Boolean(presentation && !ready)}
      className="min-w-0 space-y-4 rounded-xl bg-card p-4 sm:p-6"
    >
      <h2 className="font-heading text-xl">3D preview</h2>
      <Dialog
        open={expanded}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {!expanded && panel}
        <DialogContent
          className="h-[calc(100dvh-2rem)] content-start sm:max-w-[min(90vw,70rem)]"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => trigger.current?.focus());
          }}
        >
          <DialogTitle>Expanded 3D preview</DialogTitle>
          <DialogDescription>
            Rotate or zoom using touch, pointer, keyboard or the labeled
            controls. Close returns to the console page.
          </DialogDescription>
          {expanded && panel}
        </DialogContent>
      </Dialog>
    </section>
  );
}
