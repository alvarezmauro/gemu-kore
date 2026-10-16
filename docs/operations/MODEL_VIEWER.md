# ModelViewer

Task **9.2 — ModelViewer** adds an optional private 3D preview to existing console detail pages. It follows the [3D architecture](../architecture/3D_ARCHITECTURE.md). The console hero redesign, physical packaging/media renderers and public museum remain in their assigned phases.

## Using the preview

Open a console from the collection. When a ready model is selected, its detail page offers **View in 3D**. Upload a self-contained GLB under **Copy artwork and 3D file**, then choose **Use for this copy** to select a custom model. Uploading alone does not select it. Existing catalog model/platform defaults also work; the page labels the selected source.

Drag to orbit, scroll or pinch to zoom, or use the labeled buttons. Focus the stage for arrow keys, `+`/`−` and `Home` (reset). Pan is disabled. Auto rotation starts off, stops when hidden/offscreen and respects live reduced-motion preferences. Manual controls remain available. Fullscreen uses the browser API when permitted and an accessible expanded dialog otherwise. Closing returns focus to the activation button.

The viewer is optional. Console information, copy management, existing photos and private downloads remain useful when 3D cannot start. A missing/broken poster uses a neutral placeholder. An unsupported or oversized model keeps its selected source and download; the viewer never silently substitutes another console's geometry.

## Private delivery and selection

`loadConsoleModelView` authenticates the request. The presentation service rechecks current `private.read` and the expected collection revision in a repeatable-read transaction. VIEWER accounts can preview without edit permission. The download and presentation share copy → model → platform selection. An archived catalog identity remains valid for an existing copy.

The strict versioned descriptor contains the selected asset ID, same-origin private resource URL, verified MIME/byte length, bounded presentation settings, title/source and optional static poster. It omits storage locators, original filenames, audit identities, serial numbers and notes. Automatic posters prefer PHOTO/FRONT display images, then model/platform previews; SERIAL images are excluded. The existing `/api/media/private/[id]` route independently checks current access and READY bytes on every request. A descriptor is never a delivery credential.

No public endpoint, publication permission, asset approval or database structure changes. Current GLB originals remain private. Viewing changes neither copy revision nor canonical data.

## Loading and resource ownership

The shared shell lives in `src/components/three/model-viewer.tsx`. A client-only dynamic import loads the runtime after activation and a fresh presentation query. Collection grids do not import the renderer or request models. Three.js, R3F and Drei are pinned in the package manifest; only the needed Drei controls module is imported.

Each session streams one model with same-origin credentials, no-store and redirect refusal. It checks status, MIME, exact advertised and received length, an 8 MiB cap and a 60-second deadline. Before GLTFLoader decodes images, a dependency-light inspector bounds GLB JSON/BIN, scene complexity, accessors and PNG/JPEG headers. Only core static triangle meshes and optional unlit materials qualify. Remote/data URIs, required/unknown extensions, animation, skinning and morph targets do not.

Initial admission limits follow the architecture: 200,000 rendered triangles counting instances, 80 estimated draw calls including transparent double-sided passes, 256 nodes, 64 materials, eight textures/images, 2,048-pixel image edges, eight million pixels, estimated texture allocation within 64 MiB and geometry within 24 MiB. JSON remains bounded to 1 MiB, depth 32, 100,000 values, 4,096-element arrays and one million total accessor elements. Actual parsed resource allocation and visible draw calls are also checked.

The stage centers and normalizes the selected object, fits a perspective camera to aspect ratio, bounds zoom/clipping, and uses generated neutral reflections plus basic lights. No environment/model/decoder CDN is used. DPR starts at one and is bounded by two million drawing-buffer pixels and hardware dimensions. Rendering uses demand frames while static and pauses offscreen/background work. A 10-second decode/first-frame watchdog gives an explicit fallback; it cannot preempt synchronous JavaScript.

There is one active Canvas in the page host; native fullscreen reuses it, while expanded-dialog replacement ends the old session and requests fresh access. Closing, unmounting or interrupted loads abort transfers. Each session owns its parsed meshes, materials, textures and ImageBitmaps, including late dependency completions. Shared resources are disposed once; the generated environment, controls and listeners are released. R3F owns renderer teardown. No persistent/global private model cache is enabled. Dependency completion tracking wraps the pinned GLTFLoader parser's `getDependency`; recheck ownership and cancellation tests when upgrading Three.js.

## Verification and next task

Verified **2026-10-16**: lint, typecheck, formatting and production builds; **749** unit/component cases, **447** PostgreSQL cases and **240** desktop/mobile browser cases. The browser evidence comprises the complete 194-case private regression run, two additional embedded-texture cases and the 44-case general UI suite. Run `pnpm test`, `pnpm test:integration`, `pnpm test:e2e:access` and `pnpm test:e2e` to reproduce the suites. Browser runners build production output; run them sequentially with type generation because they share `.next`.

Tests use an original synthetic asymmetric tetrahedron rather than downloaded console models. Utility/component cases cover admission boundaries, bounded transfer, camera math, cleanup, late/cancelled answers, descriptor validation and fallback. PostgreSQL cases exercise current access, source precedence, archived identity, stale/missing copies, poster selection, private DTO scope and unchanged revisions. Production browser cases use the real private upload and streaming flow, then inspect rendered interaction and failure behavior on desktop/mobile Chromium.

The verified story is console detail → authorized presentation → private streamed GLB → interactive stage. Regression evidence lives in [the browser suite](../../tests/access-e2e/model-viewer.spec.ts) and [PostgreSQL console tests](../../tests/integration/consoles.test.ts).

| Boundary             | Evidence                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI → presentation    | Explicit activation only; stale/revoked selection fails safely; VIEWER read permission is independent of edit rights.                                      |
| Presentation → bytes | Current private authorization, exact MIME/length and no-store stream; close cancels a pending transfer; reopening makes a fresh request.                   |
| Bytes → stage        | Real uploaded synthetic GLB renders; rotation/zoom change captured pixels and reset restores the camera; pointer/touch/keyboard and fullscreen paths pass. |
| Texture → cleanup    | An embedded PNG is decoded in the real browser; two open/close sessions create and close each owned ImageBitmap exactly once.                              |
| Failure → page       | Unsupported content, failed WebGL and context loss keep static details/downloads and an explicit retry.                                                    |

The Docker app's dependency volume was refreshed after installation; `/api/health` returns 200 at localhost:3002 and an unauthenticated console request redirects to `/login`. Test records and uploads use disposable infrastructure, separate from the development collection.

Task **9.3 — 3D Performance** must calibrate these provisional limits on physical iOS Safari and Android Chrome devices. Browser emulation/software rendering verifies behavior and does not establish physical-phone frame rates, GPU memory or thermal performance.
