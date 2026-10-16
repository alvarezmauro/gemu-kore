// Paste in browser DevTools before opening 3D, or inject before navigation in Playwright.
// Test/manual diagnostics only: no app import, network traffic, URLs, IDs or model contents.
(() => {
  if (window.__gemu3dProbe) return;
  const records = [],
    contexts = new WeakMap();
  let frame = null,
    sample = null;
  const nativeRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = (callback) =>
    nativeRaf.call(window, (time) => {
      const previous = frame;
      frame = time;
      try {
        callback(time);
      } finally {
        frame = previous;
      }
    });
  function register(gl) {
    if (!gl || !gl.canvas?.closest?.("[data-model-stage]")) return null;
    if (contexts.has(gl)) return contexts.get(gl);
    const debug = gl.getExtension("WEBGL_debug_renderer_info");
    const entry = {
      renderer: String(
        gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
      ),
      id: records.length + 1,
      canvas: new WeakRef(gl.canvas),
      lost: false,
      frames: 0,
      draws: 0,
      lastFrame: null,
      resources: {},
    };
    for (const name of [
      "buffers",
      "textures",
      "programs",
      "framebuffers",
      "renderbuffers",
    ])
      entry.resources[name] = {
        created: 0,
        deleted: 0,
        owned: new WeakSet(),
        retired: new WeakSet(),
      };
    gl.canvas.addEventListener(
      "webglcontextlost",
      () => {
        entry.lost = true;
      },
      { once: true },
    );
    contexts.set(gl, entry);
    records.push(entry);
    return entry;
  }
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = Reflect.apply(getContext, this, args);
    if (args[0] === "webgl2" || args[0] === "webgl") register(gl);
    return gl;
  };
  for (const constructor of [
    window.WebGLRenderingContext,
    window.WebGL2RenderingContext,
  ]) {
    if (!constructor) continue;
    const prototype = constructor.prototype;
    for (const [suffix, name] of [
      ["Buffer", "buffers"],
      ["Texture", "textures"],
      ["Program", "programs"],
      ["Framebuffer", "framebuffers"],
      ["Renderbuffer", "renderbuffers"],
    ]) {
      for (const operation of ["create", "delete"]) {
        const method = operation + suffix;
        if (!Object.hasOwn(prototype, method)) continue;
        const original = prototype[method];
        prototype[method] = function (...args) {
          const result = Reflect.apply(original, this, args);
          const entry = contexts.get(this);
          if (!entry) return result;
          const resource = entry.resources[name];
          const object = operation === "create" ? result : args[0];
          if (object && operation === "create" && !resource.owned.has(object)) {
            resource.owned.add(object);
            resource.created++;
          } else if (
            object &&
            resource.owned.has(object) &&
            !resource.retired.has(object)
          ) {
            resource.retired.add(object);
            resource.deleted++;
          }
          return result;
        };
      }
    }
    for (const method of ["drawArrays", "drawElements"]) {
      if (!Object.hasOwn(prototype, method)) continue;
      const original = prototype[method];
      prototype[method] = function (...args) {
        const entry = contexts.get(this);
        if (entry) {
          entry.draws++;
          if (frame !== null && entry.lastFrame !== frame) {
            entry.frames++;
            entry.lastFrame = frame;
            if (sample && !entry.lost) {
              if (sample.last !== null && sample.intervals.length < 3600)
                sample.intervals.push(frame - sample.last);
              sample.last = frame;
              sample.frames++;
            }
          }
        }
        return Reflect.apply(original, this, args);
      };
    }
  }
  function snapshot() {
    return {
      contexts: records.map((entry) => {
        const canvas = entry.canvas.deref();
        return {
          id: entry.id,
          renderer: entry.renderer,
          lost: entry.lost,
          connected: Boolean(canvas?.isConnected),
          frames: entry.frames,
          draws: entry.draws,
          pixels: (canvas?.width ?? 0) * (canvas?.height ?? 0),
          resources: Object.fromEntries(
            Object.entries(entry.resources).map(([name, resource]) => [
              name,
              {
                created: resource.created,
                deleted: resource.deleted,
                live: entry.lost ? 0 : resource.created - resource.deleted,
              },
            ]),
          ),
        };
      }),
    };
  }
  Object.defineProperty(window, "__gemu3dProbe", {
    value: {
      snapshot,
      startSample() {
        sample = {
          started: performance.now(),
          last: null,
          frames: 0,
          intervals: [],
        };
      },
      stopSample() {
        if (!sample) return null;
        const result = sample;
        sample = null;
        const sorted = [...result.intervals].sort((a, b) => a - b);
        const percentile = (p) =>
          sorted.length
            ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
            : null;
        return {
          durationMs: performance.now() - result.started,
          frames: result.frames,
          intervalP50Ms: percentile(0.5),
          intervalP95Ms: percentile(0.95),
        };
      },
    },
  });
})();
