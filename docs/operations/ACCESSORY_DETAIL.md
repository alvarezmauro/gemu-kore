# Accessory detail

Task 16.4 expands the private copy page at `/app/accessories/[id]` with the accessory hero and My copy, Product information, Compatibility, Gallery, Specifications and Video sections. Native section links work without JavaScript. The existing edit/delete, enrichment, photo/defect management and custom-model upload/selection controls remain available to authorized managers.

## Catalog and copy scope

The hero identifies the selected accessory family and variant, producer, release year and compatible platforms. Personal serials, location, observed markings, box possession, notes and defects stay under My copy. Missing values stay unknown. Box possession does not establish completeness, and an empty defect list does not establish an inspected or defect-free copy. The bounded defect preview links to all copy defects.

Product description, producer, release year, specifications and video reuse the existing variant-first, family-default domain policy. The displayed source scope distinguishes the selected variant from the family default. A variant specification object replaces the entire family specification group, including an explicitly empty object. Nested specification values are formatted for reading; false and zero remain meaningful values. Typed accessory ratings remain unavailable and display as not recorded.

Compatibility always comes from the selected variant's explicit platform links and includes per-platform notes and archived labels. A sibling variant's platform list is never borrowed. Commercial markets and region-lock facts are displayed separately. Existing copies retain their archived catalog identities.

## Images and private delivery

The gallery separates variant catalog images, family images and personal photos. Family images may depict a different color or edition. Images preserve proportions, have alternative text/captions and expose retained source/license information through the shared safe attribution presenter. They open through authorized private media URLs, with a fallback if delivery fails.

Only ready display images of the matching catalog/collection scope are selected. Catalog image roles are PREVIEW, COVER and GALLERY. Personal photos exclude model/logo uses. Catalog groups each show 12 images plus a next-page sentinel using a validated `galleryPage`; copy photos show the first 12 with a link to the existing photo manager. Gallery pagination does not change the hero poster. The hero prefers a selected-variant image, then a family image, then a personal photo. It never fetches source URLs or remote images.

## Interactive model and video

Model selection is the same for download and interactive viewing: this copy's selected ready custom model, then the variant's primary catalog model, then the family's primary catalog model. Unselected custom files, sibling variants and other copies never supply the preview. Source labels and retained attribution distinguish copy, variant and family files. Existing model management remains independent of viewing; upload does not select a file automatically.

The shared viewer loads the renderer and GLB only after View in 3D. The server action rechecks private access, owned accessory identity, copy revision and a selection key containing family/variant revisions and selected asset/use identities. A changed or removed choice requires a refresh. No storage locator or personal field enters the interactive descriptor. The shared size/complexity budgets, controls, reduced-motion behavior, theme lighting, focus restoration and static/download fallback remain authoritative. No synthetic model is substituted for a missing catalog model.

Video reuses the validated structured video reference and shared player with product-video labels. External media is loaded only after Load video; playback uses its controls without autoplay. The original link remains available. Variant/family scope is explicit. Enrichment observations never become playable video or gallery files by themselves.

## Access and verification

All reads use current private authorization and a Repeatable Read transaction. Repositories own database access; services resolve facts and presentation. Viewers can inspect permitted private detail/media but receive no edit, enrichment or upload controls. Direct model activation and media delivery recheck access independently. No public endpoint, shared response cache, schema change or dependency is introduced.

Verification uses synthetic images/geometry and disposable PostgreSQL/MinIO. No personal database migration or live provider request is needed. Checks pass: lint, typecheck, production builds, formatting/whitespace, the unchanged deferred 3D bundle budget, 1,273 unit/component cases, 62 relevant database cases and 22 distinct desktop/mobile browser checks across full and focused runs. Coverage includes actual private GLB rendering, field scopes, gallery boundaries, explicit video activation, stale model selection, delivery failures, permission revocation, accessory CRUD and game detail regressions. Light desktop/mobile and dark narrow screenshots were reviewed; long titles, reduced motion and 200% text size remain usable. Final task status and the next task are recorded in [the development plan](../../DEVELOPMENT_PLAN.md).
