# Console detail page

Task 10.1 arranges the private `/app/consoles/[id]` page as an object showcase using the existing authorized console projection.

- The responsive hero pairs the on-demand 3D viewer (or static catalog image/empty fallback) with the selected logo, platform, model, separately labeled manufacturers, generation and release years.
- Section links lead to My Console, Console Information, Technical Specifications and Gallery.
- My Console distinguishes canonical commercial markets from observed copy markings and retains serial number, location, box status and private notes.
- Console Information contains model identity, region locking, descriptions and platform history. Technical Specifications presents the existing normalized facts, dimensions and weight, with an explicit empty state.
- Gallery separates catalog imagery from personal copy photos. Existing photo management, defect records, copy editing/deletion and custom media controls remain available according to server-authorized permissions.

The page remains a Server Component with small existing client islands for media, controls and the viewer. Interactive 3D still loads only after explicit activation. Private data and media use the existing authorized services; no schema, migration, dependency or public endpoint was added. Unknown fields remain labeled rather than inferred. Task 10.2’s presentation additions are documented below.

A stale-edit error receives focus after React commits it and the pending save re-enables the form. This avoids trying to focus an absent or disabled element; component and browser checks cover draft preservation and error focus.

## Verification

Use `pnpm lint`, `pnpm typecheck` and `pnpm test`. Console service regression checks run with `pnpm test:integration tests/integration/consoles.test.ts`. Run the isolated desktop/mobile flows with:

```sh
pnpm test:e2e:access console-crud.spec.ts model-viewer.spec.ts model-performance.spec.ts
```

The console CRUD suite verifies section navigation, separate canonical/private content, existing management flows, and 320px dark/reduced-motion presentation. The viewer suites cover lazy loading, rendering, cancellation, fullscreen sizing and cleanup. Browser tests save console detail screenshots for visual inspection.

The stable-drawing-buffer stress check allows 20 seconds for orbit damping on slower software WebGL hosts. It still requires zero idle frames over four seconds and zero canvas-resolution writes; this is a test synchronization allowance, not a measured mobile performance claim.

Verified on 2026-10-17: lint, typecheck, production builds, 752 unit/component tests, 32 console PostgreSQL tests and 48 distinct desktop/mobile browser scenarios across the full run and focused corrective reruns. Desktop, active-viewer and 320px dark/reduced-motion screenshots were inspected. Initial missing-browser setup, source-label and focus failures were resolved before completion.

## Task 10.2 — restrained presentation polish

The identity panel reuses the owned Magic Card spotlight. Its neutral highlight is enabled only for a fine mouse pointer with no reduced-motion preference. It adds no movement or hidden controls. A small, static grid uses theme border tokens and a faded corner mask; it is decorative, ignores pointer input and stays outside the 3D canvas.

Only the platform/model summary uses the existing 180ms Blur Fade. Server HTML stays fully visible, opacity never starts below 0.96, and the shared component completes playback at its static end state when reduced motion changes. A reduced-motion CSS rule also overrides late animation writes. This fixes cancellation rewinding the internal Motion value to the initial four-pixel offset.

`ConsoleSectionNav` preserves ordinary fragment anchors and tracks the URL hash, including Back/Forward and direct links. A scoped Motion layout indicator moves between selected links over the shared 200ms timing. Reduced motion keeps a static selection marker and `aria-current="location"`. The marker reserves its width so selection does not shift the links. There is no scroll-driven observer or continuous animation; the marker describes the selected anchor, not the currently visible section.

The page and its data projection remain server-rendered. The nav is a small client island receiving no collection data; Magic Card and Blur Fade receive server-rendered children. No new dependency, database change, public delivery, cross-route animation or automatic 3D loading is introduced.

The console browser suite covers keyboard activation, hash history, live reduced-motion changes, fine-pointer versus touch behavior, 320px wrapping, and readable content/working fragment links with JavaScript disabled. Existing console CRUD and viewer browser checks cover the surrounding interactions.

Task 10.2 verification on 2026-10-17: lint, typecheck, formatting and production builds passed; 752 unit/component cases passed across full/focused reruns, 32 console PostgreSQL cases passed, and 32 console/viewer plus six shared motion browser scenarios passed across full/focused runs. Light desktop and 320px dark/reduced-motion screenshots were inspected. Default-parallel unit timing failures were rechecked individually, with all cases passing; no unrelated test assertions or application code were changed.
