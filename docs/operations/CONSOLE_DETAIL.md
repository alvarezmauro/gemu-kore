# Console detail page

Task 10.1 arranges the private `/app/consoles/[id]` page as an object showcase using the existing authorized console projection.

- The responsive hero pairs the on-demand 3D viewer (or static catalog image/empty fallback) with the selected logo, platform, model, separately labeled manufacturers, generation and release years.
- Section links lead to My Console, Console Information, Technical Specifications and Gallery.
- My Console distinguishes canonical commercial markets from observed copy markings and retains serial number, location, box status and private notes.
- Console Information contains model identity, region locking, descriptions and platform history. Technical Specifications presents the existing normalized facts, dimensions and weight, with an explicit empty state.
- Gallery separates catalog imagery from personal copy photos. Existing photo management, defect records, copy editing/deletion and custom media controls remain available according to server-authorized permissions.

The page remains a Server Component with small existing client islands for media, controls and the viewer. Interactive 3D still loads only after explicit activation. Private data and media use the existing authorized services; no schema, migration, dependency or public endpoint was added. Unknown fields remain labeled rather than inferred. Animation polish remains Task 10.2.

A stale-edit error receives focus after React commits it and the pending save re-enables the form. This avoids trying to focus an absent or disabled element; component and browser checks cover draft preservation and error focus.

## Verification

Use `pnpm lint`, `pnpm typecheck` and `pnpm test`. Console service regression checks run with `pnpm test:integration tests/integration/consoles.test.ts`. Run the isolated desktop/mobile flows with:

```sh
pnpm test:e2e:access console-crud.spec.ts model-viewer.spec.ts model-performance.spec.ts
```

The console CRUD suite verifies section navigation, separate canonical/private content, existing management flows, and 320px dark/reduced-motion presentation. The viewer suites cover lazy loading, rendering, cancellation, fullscreen sizing and cleanup. Browser tests save console detail screenshots for visual inspection.

The stable-drawing-buffer stress check allows 20 seconds for orbit damping on slower software WebGL hosts. It still requires zero idle frames over four seconds and zero canvas-resolution writes; this is a test synchronization allowance, not a measured mobile performance claim.

Verified on 2026-10-17: lint, typecheck, production builds, 752 unit/component tests, 32 console PostgreSQL tests and 48 distinct desktop/mobile browser scenarios across the full run and focused corrective reruns. Desktop, active-viewer and 320px dark/reduced-motion screenshots were inspected. Initial missing-browser setup, source-label and focus failures were resolved before completion.
