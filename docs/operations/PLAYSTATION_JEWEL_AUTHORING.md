# PlayStation jewel-case authoring

This Task 14.3 increment adds `playstation-jewel` to the existing private authored-packaging path. It represents a curated closed jewel case with a separately modeled lid, hinges and tray. It does not infer packaging from a platform, supply universal retail measurements, or represent every regional longbox/multidisc variant. Curators must supply lawful geometry, measured dimensions, source evidence and an appropriate variant name. NES/SNES and Genesis retain their existing contracts.

## Curate and preview

1. Open **Manage release packaging → Create packaging template** and select **PlayStation jewel case**. Supply X width, Y height and Z depth in millimeters, the measurement source and the next revision within this format. Mark synthetic measurements explicitly.
2. Enter **Artwork surface mappings (JSON)** from the authored model. A jewel draft needs four distinct indexed targets: `FRONT`, `BACK`, `SPINE` and `OPPOSITE_SPINE`. All four planes must exist. Binding artwork to the opposite spine is optional; the other three bindings determine completeness. The application does not copy one spine image to the other.
3. Create the draft and upload the GLB with known source, author, license, attribution and usage restrictions. The private original attaches directly to the draft template; no release gallery or console-model use is fabricated. Geometry uploads do not authorize public display.
4. Download and inspect the attached model, its physical bounds, target mappings, neutral placeholders and clear housing. Confirm the review checkbox and mark it ready. Approval hashes and validates actual stored bytes, then rechecks current permission, template revision and model identity before committing. Numeric validation cannot establish historical accuracy, rights or the suitability of the housing.
5. Assign the ready template to an expected release packaging component. Upload release artwork separately and bind each desired surface explicitly. Crops and clockwise quarter-turns use the existing proportional contain operation. Assign no artwork for a labeled geometry-only preview; missing required artwork is incomplete. A neutral unbound opposite spine does not make the three required surfaces incomplete.
6. On an owned game, activate **View in 3D**. Front/back views, keyboard/touch interaction, fullscreen, reduced motion and static fallback reuse the shared viewer. This is expected catalog packaging, not confirmation of owned presence or condition. Manual `hasBox` remains unchanged.

Draft replacement, uncertain-upload completion checks, stale revision handling, current administrator permission, immutable ready revisions, archiving and cleanup references follow the [Genesis workflow](GENESIS_PACKAGING_AUTHORING.md). Correct a ready export through a new template revision. Measurements, mappings and bindings do not transfer between formats automatically.

## Geometry and surface contract

Use the existing self-contained `gltf-slots-v1` GLB contract: one default scene at index 0, static single-sided PBR triangle geometry, float positions/normals/UV0, unsigned triangle indices, positive finite transforms and upright +Y. No external resources, embedded images/textures, extensions, extras, alternate scenes, animation, skinning, morphs, sparse accessors or vertex colors are admitted. Bounds must match curator-supplied dimensions within 2% or 1 mm, whichever is larger. No axis is stretched to fit claimed measurements.

Each artwork target records schema version 1, `GLB_PRIMITIVE`, scene/node/mesh/primitive/material indices, UV channel 0, matching diagnostic node/material names and physical art width/height in millimeters. Targets must be distinct. Names are diagnostics, not identity; nested multi-primitive meshes and shared source materials retain the existing indexed resolution and per-target clones. Each art plane is exactly two outward-facing triangles with four UV corners, (0,0) at top left, +U right and +V down. Art must use neutral white, opaque, non-emissive PBR materials.

| Surface        | Outside normal | Artwork right | Artwork up | Artwork required |
| -------------- | -------------- | ------------- | ---------- | ---------------- |
| FRONT          | +Z             | +X            | +Y         | Yes              |
| BACK           | −Z             | −X            | +Y         | Yes              |
| SPINE          | −X             | +Z            | +Y         | Yes              |
| OPPOSITE_SPINE | +X             | −Z            | +Y         | No               |

Place artwork outside opaque tray/hinge geometry and slightly inside any clear outer cover, without coplanar overlap. Review occlusion from both faces and both spines. The second spine has its own UV orientation, physical size and binding; it is not a mirrored alias of the first.

For **jewel housing only**, standard PBR `alphaMode: BLEND` is allowed with alpha from 0.05 through 0.8, metallic factor explicitly zero, no emission and no double-sided materials. At most eight visible blended primitives, counting every node instance, are allowed. `MASK` and fully invisible housing are rejected. Opaque materials require alpha 1. Art remains opaque even when behind the clear lid. Genesis continues to reject blended materials. This is a bounded alpha-blending approximation; optical refraction/transmission and opening animation are outside the profile.

## Synthetic assets and limits

Run `pnpm three:fixtures` to generate `test-results/three-fixtures/synthetic-playstation-jewel.glb` and its full `synthetic-playstation-jewel-slots.json`. The original fixture uses **synthetic 150 × 135 × 12 mm** dimensions and models a clear lid/rear/rims, opaque tray, hinge bar/pins, tray recess and hub. The hub/recess are part of the empty tray; no disc, media artwork or media-presence claim is introduced. These values and assets are demonstration evidence, not retail catalog seeds. Mark a template synthetic when using them.

The existing limits remain: 8 MiB geometry before processing; 12 MiB model plus unique artwork transfers; 2 MiB per prepared image; 2,048-pixel source edges; 8 million source pixels; at most 1,024-pixel output edges. Two transfer workers share 60 seconds; composition and parsing share 10 seconds. Four cloned artwork materials count toward the material cap. Source artwork may share one transfer while each surface gets an independent composite/texture. Each session releases housing geometry/materials, cloned art materials, textures, bitmaps and canvas backing stores. Transparent primitives also remain subject to the overall triangle/draw/resource budgets.

Migration `20261020130000_playstation_jewel_packaging` extends format admission and the four-slot readiness contract, with an optional opposite-spine binding. It preserves existing ready NES/SNES/Genesis revisions, model foreign keys, immutability and cleanup protections. Apply normal migrations before using the format. Automated tests use disposable PostgreSQL and MinIO; the personal database is not migrated.

PS2 DVD cases are now implemented as a [separate opaque three-surface increment](PS2_DVD_AUTHORING.md). Switch cases remain a later increment of Task 14.3. Task 14.4 media rendering, owned presence/primary packaging, public presentation and nested containment remain outside this change.

Verified 2026-10-20: all 1,160 unit/component cases pass with two workers and unchanged timeouts; 8 packaging + 52 core-schema + 8 game-catalog integration checks and 37 real PostgreSQL/MinIO upload checks pass. All 24 distinct desktop/mobile packaging/console-viewer browser cases pass across the full run and a focused rerun. The first run had one console-fixture module-load failure while another check regenerated the database client; its isolated desktop/mobile rerun passes with no product change or relaxed timeout. Coverage includes real attributed jewel uploads/approval, family-specific readiness, retained Genesis/cardboard data, independent opposite-spine bindings, neutral optional artwork, transparent housing limits, opaque art/Genesis, invalid UV/orientation/targets, source-byte and cleanup protection, lazy activation, fresh reopen and 320px/reduced-motion behavior. Desktop/mobile screenshots were inspected.

Lint, typecheck, schema validation, production build, fixture generation, formatting/whitespace and deferred bundle budget pass. The deferred 3D chunk is 1,010,935 raw / 270,614 gzip bytes, below 1.25 MiB / 320 KiB. Tests replay the migration on disposable databases/storage; no personal database was migrated. The previously recorded broader search-plan benchmark issue was not rerun or suppressed. No physical-phone performance claim is made.
