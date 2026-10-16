"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls.js";
import { PerspectiveCamera } from "three";
import { Button } from "@/components/ui/button";
import { useMotionAllowed } from "@/lib/motion/use-motion-preference";
import { fetchModel } from "@/lib/three/fetch-model";
import {
  ModelError,
  modelLimits,
  type ModelPresentation,
} from "@/lib/three/contracts";
import { drawingDpr } from "@/lib/three/camera";
import { fitModelCamera, installStudio } from "./model-stage";
import { parseModel } from "./model-resources";
type Loaded = Awaited<ReturnType<typeof parseModel>>;
type Command = "left" | "right" | "up" | "down" | "in" | "out" | "reset";
type Controller = { run: (command: Command) => void };
type Controls = ComponentRef<typeof OrbitControls>;
function Scene({
  model,
  presentation,
  visible,
  rotate,
  motion,
  controllerRef,
  onReady,
  onError,
}: {
  model: Loaded;
  presentation: ModelPresentation;
  visible: boolean;
  rotate: boolean;
  motion: boolean;
  controllerRef: RefObject<Controller | null>;
  onReady: () => void;
  onError: (message: string) => void;
}) {
  const { camera, size, gl, scene, invalidate, setDpr } = useThree();
  const orbit = useRef<Controls>(null),
    fitted = useRef(false),
    first = useRef(false),
    alive = useRef(true);
  const settings = presentation.settings;
  const fit = useCallback(
    (reset: boolean) => {
      if (!(camera instanceof PerspectiveCamera) || !orbit.current) return;
      fitModelCamera(
        camera,
        orbit.current,
        model.radius,
        size.width / Math.max(size.height, 1),
        settings,
        reset || !fitted.current,
      );
      invalidate();
      fitted.current = true;
    },
    [camera, invalidate, model.radius, settings, size.height, size.width],
  );
  useEffect(() => {
    fit(false);
    setDpr(
      drawingDpr(
        size.width,
        size.height,
        Math.min(
          gl.capabilities.maxTextureSize,
          gl.getContext().getParameter(gl.getContext().MAX_RENDERBUFFER_SIZE),
        ),
      ),
    );
  }, [fit, gl, setDpr, size.width, size.height]);
  useEffect(() => {
    controllerRef.current = {
      run: (command) => {
        const controls = orbit.current;
        if (!controls) return;
        if (command === "reset") {
          fit(true);
          return;
        }
        if (command === "in") controls.dollyIn(0.85);
        else if (command === "out") controls.dollyOut(0.85);
        else if (command === "left" || command === "right")
          controls.setAzimuthalAngle(
            controls.getAzimuthalAngle() + (command === "left" ? 0.25 : -0.25),
          );
        else
          controls.setPolarAngle(
            controls.getPolarAngle() + (command === "up" ? -0.2 : 0.2),
          );
        controls.update();
        invalidate();
      },
    };
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef, fit, invalidate]);
  useEffect(() => {
    alive.current = true;
    const loss = (event: Event) => {
      event.preventDefault();
      onError(
        "The 3D display was interrupted. Close or try the preview again.",
      );
    };
    gl.domElement.addEventListener("webglcontextlost", loss);
    const releaseStudio = installStudio(gl, scene);
    return () => {
      alive.current = false;
      gl.domElement.removeEventListener("webglcontextlost", loss);
      releaseStudio();
    };
  }, [gl, scene, onError]);
  useEffect(() => {
    if (visible) invalidate();
  }, [visible, invalidate]);
  useFrame(() => {
    if (first.current || !visible) return;
    first.current = true;
    queueMicrotask(() => {
      if (!alive.current) return;
      if (gl.info.render.calls > modelLimits.draws)
        onError(new ModelError().message);
      else onReady();
    });
  });
  return (
    <>
      <hemisphereLight args={["#ffffff", "#b6b0a5", 1]} />
      <directionalLight position={[4, 5, 5]} intensity={2} />
      <directionalLight position={[-4, 2, -3]} intensity={0.6} />
      <primitive object={model.scene} dispose={null} />
      <OrbitControls
        ref={orbit}
        makeDefault
        enabled={visible}
        enablePan={false}
        enableDamping={motion}
        autoRotate={rotate && visible}
        autoRotateSpeed={1}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
      />
    </>
  );
}
export default function ModelViewerRuntime({
  presentation,
  onReady,
  onError,
  onExpand,
  container,
  descriptionId,
}: {
  presentation: ModelPresentation;
  onReady: () => void;
  onError: (message: string) => void;
  onExpand: () => void;
  container: RefObject<HTMLDivElement | null>;
  descriptionId: string;
}) {
  const [model, setModel] = useState<Loaded | null>(null),
    [message, setMessage] = useState("Downloading model…"),
    [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true),
    [auto, setAuto] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
  const controllerRef = useRef<Controller>(null),
    viewport = useRef<HTMLDivElement>(null),
    loadController = useRef<AbortController>(null),
    loaded = useRef(false);
  const motion = useMotionAllowed();
  const rendered = useCallback(() => {
    setReady(true);
    onReady();
  }, [onReady]);
  useEffect(() => {
    const abort = new AbortController();
    loadController.current = abort;
    let decoded: Loaded | undefined;
    void (async () => {
      try {
        const bytes = await fetchModel(
          presentation,
          abort.signal,
          (received, total) =>
            setMessage(
              received === total
                ? "Preparing 3D model…"
                : `Downloading model… ${Math.round((received / total) * 100)}%`,
            ),
        );
        const signal = AbortSignal.any([
          abort.signal,
          AbortSignal.timeout(10_000),
        ]);
        decoded = await parseModel(bytes, presentation.settings, signal);
        if (abort.signal.aborted) {
          decoded.owner.dispose();
          return;
        }
        loaded.current = true;
        setModel(decoded);
      } catch (error) {
        if (!abort.signal.aborted)
          onError(
            error instanceof ModelError
              ? error.message
              : "This model couldn't be displayed. Try again or use its private download.",
          );
      }
    })();
    return () => {
      abort.abort();
      decoded?.owner.dispose();
      loaded.current = false;
    };
  }, [presentation, onError]);
  useEffect(() => {
    if (!model || ready || !visible) return;
    const timeout = setTimeout(
      () =>
        onError(
          "The 3D display did not start. Try again or use the private download.",
        ),
      10_000,
    );
    return () => clearTimeout(timeout);
  }, [model, ready, visible, onError]);
  useEffect(() => {
    let intersecting = true,
      seen = false;
    const update = () => {
      const active = document.visibilityState !== "hidden" && intersecting;
      setVisible(active);
      if (!active) {
        setAuto(false);
        if (
          !loaded.current &&
          (seen || document.visibilityState === "hidden")
        ) {
          loadController.current?.abort();
          onError("Loading paused. Open the preview again when it is visible.");
        }
      }
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            intersecting = entry.isIntersecting;
            if (intersecting) seen = true;
            update();
          });
    if (viewport.current) observer?.observe(viewport.current);
    const media = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const preference = () => {
      if (!media.matches) setAuto(false);
    };
    const full = () =>
      setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("visibilitychange", update);
    document.addEventListener("fullscreenchange", full);
    media.addEventListener("change", preference);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      document.removeEventListener("fullscreenchange", full);
      media.removeEventListener("change", preference);
    };
  }, [container, onError]);
  async function expand() {
    if (document.fullscreenElement === container.current) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      if (!container.current?.requestFullscreen) throw new Error();
      await container.current.requestFullscreen();
    } catch {
      onExpand();
    }
  }
  const commands: { key: Command; label: string }[] = [
    { key: "left", label: "Rotate left" },
    { key: "right", label: "Rotate right" },
    { key: "up", label: "Rotate up" },
    { key: "down", label: "Rotate down" },
    { key: "in", label: "Zoom in" },
    { key: "out", label: "Zoom out" },
    { key: "reset", label: "Reset camera" },
  ];
  return (
    <div className="min-w-0 space-y-4">
      <div
        ref={viewport}
        tabIndex={ready ? 0 : -1}
        role="img"
        aria-label={`Interactive 3D model: ${presentation.title}`}
        aria-describedby={descriptionId}
        className="relative w-full aspect-[4/3] max-h-[60dvh] overflow-hidden rounded-xl bg-stone outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerDown={() => viewport.current?.focus({ preventScroll: true })}
        onKeyDown={(e) => {
          const key: Record<string, Command> = {
            ArrowLeft: "left",
            ArrowRight: "right",
            ArrowUp: "up",
            ArrowDown: "down",
            "+": "in",
            "=": "in",
            "-": "out",
            Home: "reset",
          };
          if (key[e.key]) {
            e.preventDefault();
            controllerRef.current?.run(key[e.key]);
          }
        }}
      >
        {model && (
          <Canvas
            dpr={1}
            frameloop={
              visible ? (auto && motion ? "always" : "demand") : "never"
            }
            camera={{ fov: presentation.settings.fov, position: [3, 2, 4] }}
            gl={{ powerPreference: "low-power", antialias: true }}
            fallback={<p>3D is unavailable on this device.</p>}
          >
            <Scene
              model={model}
              presentation={presentation}
              visible={visible}
              rotate={auto && motion}
              motion={motion}
              controllerRef={controllerRef}
              onReady={rendered}
              onError={onError}
            />
          </Canvas>
        )}
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {ready ? (visible ? "3D preview ready" : "3D preview paused") : message}
      </p>
      {ready && (
        <>
          <p className="text-sm text-muted-foreground">
            Drag to rotate, pinch or scroll to zoom. Use the buttons or focus
            the model and use arrow keys, +, − and Home.
          </p>
          <div
            role="group"
            aria-label="3D controls"
            className="flex flex-wrap gap-2"
          >
            {commands.map((command) => (
              <Button
                key={command.key}
                variant="outline"
                onClick={() => controllerRef.current?.run(command.key)}
              >
                {command.label}
              </Button>
            ))}
            <Button
              variant="outline"
              aria-pressed={auto && motion}
              disabled={!motion || !visible}
              onClick={() => setAuto(!auto)}
            >
              {auto && motion ? "Stop auto rotate" : "Auto rotate"}
            </Button>
            <Button variant="outline" onClick={() => void expand()}>
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </Button>
          </div>
          {!motion && (
            <p className="text-sm text-muted-foreground">
              Auto rotation is off for reduced motion. Manual controls remain
              available.
            </p>
          )}
        </>
      )}
    </div>
  );
}
