# Genesis clamshell authoring

Task 14.3 adds the closed `genesis-clamshell` format with authored GLB housing and three explicit artwork surfaces. Curators supply their own lawful geometry and measured edition/market dimensions. No retail measurements, scans or models are shipped as catalog seeds. NES/SNES retain their procedural cardboard contracts.

## Create and review

1. In **Manage release packaging → Create packaging template**, choose **Genesis clamshell**. Record measured X width, Y height and Z depth in millimeters, the measurement source, format revision and name. Label demonstration dimensions as synthetic.
2. Paste the three surface mappings described below. Create the draft, then upload its GLB with known author, source, license, attribution and restrictions. Geometry attaches directly to this template. It does not become release artwork or a console model. Uploads remain private and unapproved for publication.
3. Download and inspect the attached model. Check that it represents the measured closed clamshell, including appropriate housing, seam, hinge and clasp details, with upright front/back/spine surfaces outside the housing. Numeric admission cannot establish historical accuracy, rights or a truthful silhouette. Confirm the review checkbox and **Mark ready**. The server reads and hashes the actual stored bytes and validates the mapping before approval.
4. Choose the ready template on an expected packaging component. Upload release artwork and explicitly bind front, back and spine; crop/clockwise rotation and proportional containment follow the existing packaging workflow. Unbound surfaces are neutral and labeled incomplete. A geometry-only preview is valid.
5. Open the owned game and activate **View in 3D**. The shared viewer supplies front/back views, keyboard/touch controls, fullscreen and reduced-motion behavior. The preview describes expected catalog packaging; it does not assert owned presence or condition.

A replacement GLB is allowed only on an active draft and advances its revision. Refresh after uploads or uncertain responses; use **Check pending upload** if an upload ID returned. A stale upload cannot attach over a newer revision. Ready geometry, dimensions and mappings are frozen; corrections require a new template revision. Archiving blocks new assignments while existing assignments and model references remain readable. Referenced model bytes participate in both application and database cleanup protections.

## Authored profile

Use GLB 2.0 with one default scene (index 0), static opaque single-sided PBR geometry, embedded binary buffers and no embedded images, textures, external resources, animation, skinning, morphs, extensions, extras or alternate scenes. Export positions/normals/UVs as float accessors and triangle indices as unsigned integers. The first profile accepts `POSITION`, optional `NORMAL` and optional `TEXCOORD_0`; art primitives require `TEXCOORD_0`. Sparse accessors and vertex colors are outside this profile. Units are meters; +Y is up, front faces +Z, back faces −Z and spine faces −X. The overall geometry bounds must match supplied dimensions within 2% or 1 mm, whichever is larger. Use positive finite transforms and unit quaternions.

Each art surface is exactly two outward-facing triangles forming one rectangular plane. UV0 covers the full [0,1] rectangle with (0,0) at the artwork’s top left, +U right and +V down. Looking at each surface from outside, front right is +X, back right is −X and spine right is +Z. Each surface must have a neutral white, non-emissive, opaque PBR material; housing retains its authored plastic color. Put planes just outside the housing to avoid occlusion or z-fighting. Give nodes and materials stable diagnostic names, but map by indices; names alone do not identify a target. Shared source materials are supported through per-primitive material clones. Multi-primitive node groups are supported.

Mappings are a JSON array with exactly `FRONT`, `BACK` and `SPINE`, each with a distinct node/mesh/primitive tuple. Example **for an original synthetic fixture only**, never assumed for another export:

```json
[
  {
    "name": "FRONT",
    "target": {
      "schemaVersion": 1,
      "kind": "GLB_PRIMITIVE",
      "sceneIndex": 0,
      "nodeIndex": 0,
      "meshIndex": 0,
      "primitiveIndex": 0,
      "materialIndex": 0,
      "uvChannel": 0,
      "nodeName": "FRONT",
      "materialName": "art:FRONT",
      "artWidthMm": 108,
      "artHeightMm": 166
    }
  }
]
```

The example shows one entry; supply all three from the actual model. Scene and UV channel are currently zero. Diagnostic names must match the indexed node and material. Artwork physical width/height must match that surface, independently of the overall housing dimensions. A changed export requires new mappings and a new revision after readiness.

## Synthetic fixture and verification

Run `pnpm three:fixtures` to generate `test-results/three-fixtures/synthetic-genesis-clamshell.glb` and its complete `synthetic-genesis-clamshell-slots.json`. These original test assets model two rounded shells, rim lips, hinge barrels and a clasp at **synthetic 120 × 180 × 28 mm**. They are for orientation, upload and resource checks, not historical catalog claims. Mark the template synthetic and record this note when using them.

Geometry is bounded to 8 MiB before processing; upload admission also runs the existing GLB validator. Approval and client admission enforce the authored profile, actual dimensions, indexed targets, neutral materials, rectangular UVs and winding. Existing 3D limits cap nodes, triangles, draw calls, materials and decoded geometry; three cloned artwork materials count toward the material cap. Model plus unique image transfers share the 12 MiB packaging budget, two workers and a 60-second deadline. Artwork retains its 2 MiB/image, 2,048 source-edge, 8 million pixel and 1,024 output-edge limits. Composition and model parsing share a 10-second deadline. Every preview owns and releases its geometry, original/replacement materials, textures, canvases and bitmaps; reopening creates a fresh session.

Migration `20261020120000_genesis_authored_packaging` adds the direct model foreign key, geometry/slot constraints and cleanup references. It extends existing box tables and leaves existing ready NES/SNES revisions intact. Apply normal migrations before using Genesis. Tests use disposable PostgreSQL and MinIO; the personal development database is not migrated by this work.

PlayStation jewel, PS2 DVD and Switch cases remain later increments of Task 14.3. Cartridge rendering, opening animations, owned presence/primary packaging and public presentation are outside this increment.

Verified 2026-10-20: all 1,150 unit/component tests pass (`pnpm exec vitest run --maxWorkers=2`, unchanged timeouts), along with 6 packaging + 52 core-schema + 8 game-catalog integration checks, 35 real PostgreSQL/MinIO upload checks, and 22 desktop/mobile packaging/console-viewer browser checks. Coverage includes three explicit art mappings, shared source materials, nested multi-primitive nodes, neutral geometry-only loading, invalid dimensions/UVs/winding/diagnostics, legacy manifests/descriptors, draft replacement and completion recovery, current-role checks, ready immutability, cleanup references, mobile form bounds, lazy transfer, distinct front/back views and fresh sessions. Lint, typecheck, schema validation, production build, formatting/whitespace, fixture generation and deferred bundle checks pass. The deferred 3D chunk is 1,010,432 raw / 270,461 gzip bytes, within 1.25 MiB / 320 KiB. An initial unrestricted unit run reached the existing five-second ESLint architecture-check timeout under concurrent load; the focused check and full two-worker run pass without changing that deadline. The pre-existing broader search-plan benchmark issue recorded under Task 14.2 was not rerun or suppressed. Physical-phone performance is not claimed.
