# Switch-case authoring

This final Task 14.3 increment adds `switch-case` to the private authored-packaging workflow. A curated closed slim case supplies clear housing and three independently bound artwork planes. Curators supply lawful geometry, measured dimensions, measurement evidence and an appropriate edition/market variant name. Selecting Switch does not infer packaging from the game platform or assert that every regional or special edition uses this case.

## Curate and preview

1. In **Manage release packaging → Create packaging template**, select **Switch case**. Enter X width, Y height and Z depth in millimeters, their source and a family revision. Mark demonstration dimensions synthetic.
2. Enter **Artwork surface mappings (JSON)** with exactly `FRONT`, `BACK` and `SPINE`. Supply scene/node/mesh/primitive/material indices, matching diagnostic names, UV0 and physical art rectangle sizes. Each target must be distinct. Switch does not use the jewel case's optional opposite spine.
3. Create the draft and **Upload Switch case geometry**. Preserve known author, source, license, attribution and restrictions. The private GLB attaches directly to this draft; it creates no artwork or console-model use and grants no public display permission.
4. Download the model and review its silhouette, slim rounded housing, hinge, seam, latch, empty card retainer, dimensions, source and art mappings. Confirm the review checkbox and mark it ready. The server hashes and validates stored bytes before rechecking current permission, revision and model identity under the write guard. Numeric checks cannot establish historical suitability or rights.
5. Select the ready template for an expected release packaging component. Upload artwork separately and explicitly bind front/back/spine. All three bindings determine completeness. Missing artwork stays neutral; a geometry-only preview is labeled incomplete. Atlas scans require explicit per-surface crops; no automatic wrap splitting or image reuse occurs.
6. Open an owned game's **Physical packaging** section and activate **View in 3D**. Artwork uses proportional containment, neutral margins and clockwise quarter-turn controls. The shared viewer provides front/back views, keyboard/touch, fullscreen, reduced motion, safe fallback and fresh-session cleanup.

These are expected catalog components. Manual `hasBox`, owned presence and condition remain unchanged. Ready geometry and mappings are immutable; corrections require a new revision. Archiving blocks new assignments while preserving existing references. Draft replacement and uncertain-upload completion follow the [existing authored workflow](GENESIS_PACKAGING_AUTHORING.md). Current administrators curate/upload; current private readers view. Cleanup protects referenced geometry and artwork.

## Clear housing and artwork profile

Switch reuses the bounded single-sided standard PBR clear-housing profile introduced for jewel cases: `alphaMode: BLEND`, alpha 0.05–0.8, metallic factor explicitly zero, no emission and at most eight visible blended primitives, counting every node instance. `MASK`, double-sided and fully invisible housing are rejected. Opaque materials require alpha 1. Genesis and PS2 still require opaque housing.

Artwork is always neutral white, opaque and non-emissive before compositing, including planes behind clear covers. The synthetic case places art slightly inside the covers and outside the opaque inner retainer. Preserve separation to avoid z-fighting and opaque occlusion. Housing keeps its reviewed PBR material when art is applied. This is bounded alpha blending; optical refraction/transmission, opening animation and a game-card renderer are outside this profile.

Use a self-contained static GLB with one default scene (index 0), meter units, +Y up, positive finite transforms and normalized quaternions. Bounds must match supplied dimensions within 2% or 1 mm per axis, whichever is larger. Art is two outward-facing triangles forming a full [0,1] UV0 rectangle. UV (0,0) is top left, +V down. Front normal is +Z with artwork right +X; back normal −Z with right −X; spine normal −X with right +Z. All artwork is upright along +Y. Indices identify targets; names are matching diagnostics. Nested multi-primitive nodes and shared original materials use existing per-target resolution and cloning.

Embedded textures/images, external resources, alternate scenes, animation, skinning, morphs, sparse accessors, vertex colors, extensions and extras remain unsupported. No labels may be baked into unbound housing. Artwork references prepared private CATALOG DISPLAY images explicitly.

## Original synthetic fixture and limits

Run `pnpm three:fixtures` for `test-results/three-fixtures/synthetic-switch-case.glb` and its complete `synthetic-switch-case-slots.json`. The original study uses **synthetic 106 × 174 × 11 mm** dimensions and art rectangles of 96 × 164 mm front/back and 9 × 164 mm spine. It models two rounded clear panels, hollow rim rails, opening-edge lips, a hinge, latch and empty card-retainer rails/base. It contains no game card, brand artwork or retail measurement claims. Mark the template synthetic and retain this evidence when using it.

Existing budgets remain: 8 MiB geometry, 12 MiB combined geometry/unique artwork transfer, 2 MiB per image, 2,048-pixel source edges, 8 million source pixels and at most 1,024-pixel composites. Two transfer workers share 60 seconds; parsing/composition share 10 seconds. The three cloned art materials count toward the material cap. Existing node/triangle/draw/geometry/texture budgets remain enforced. A shared image fetches once but receives an independent composite per surface. Every session disposes geometry, original/cloned materials, textures, bitmaps and canvas backing stores.

Migration `20261020150000_switch_case_packaging` admits Switch and rejects opposite-spine slots for its templates. Existing three-slot readiness, ready freeze guards, model foreign keys and cleanup references remain in force. Apply normal migrations before using the format. Verification uses disposable PostgreSQL/MinIO; it does not migrate the personal development database.

Task 14.3 now covers NES, SNES, Genesis, PlayStation, PS2 and Switch. Task 14.4 cartridge rendering, owned presence/primary packaging, public presentation and nested containment are outside this increment.

## Verification

Verified 2026-10-20: 1,179 unit/component tests (78 files, two workers, unchanged timeouts), 10 packaging + 52 core-schema + 8 game-catalog integration checks and 41 PostgreSQL/MinIO upload checks pass. Focused reruns confirm that translucent art fails the art rule independently of the eight-primitive blend cap. Coverage includes standards-valid geometry, bounded clear housing, three distinct upright targets, dimensions/UVs/winding, opaque-art enforcement, aggregate transfer budgets, original housing preservation, isolated art composites and disposal, private stored-byte approval, immutable ready templates, role checks, cross-template bindings and cleanup references.

All 28 desktop/mobile packaging/shared-viewer browser checks pass against a production build and disposable PostgreSQL/MinIO. Switch flows exercise attributed geometry upload/review, labeled geometry-only preview, explicit artwork binding, retained invalid-crop input, distinct front/back views, lazy model/art transfers, fresh reopen, component switching, revoked access and 320px/reduced-motion controls. Neutral and textured desktop/mobile screenshots were inspected. The synthetic GLB is 74,184 bytes; no retail or physical-phone performance claim is made.

Lint, typecheck, schema validation, production build, fixture generation, documentation links and formatting/whitespace checks pass. The deferred chunk is 1,010,956 raw / 270,628 gzip bytes, below 1.25 MiB / 320 KiB. Migrations replay successfully in disposable databases/storage; the personal development database is unchanged. The broader search-plan benchmark limitation recorded under Task 14.2 was not rerun or suppressed; no search behavior or timeout was changed.
