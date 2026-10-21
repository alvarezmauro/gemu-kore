# Accessory catalog

Task 16.1 adds administrator catalog management at `/app/catalog/accessories`, linked from the console and game catalogs. It reuses the existing `Accessory`, `AccessoryVariant`, `AccessoryVariantRegion`, `AccessoryVariantPlatform` and `OwnedAccessory` tables. Specification §§48–54 and the accepted [domain model](../architecture/DOMAIN_MODEL.md#44-accessories) govern the family/variant/copy boundaries.

## Family defaults and variants

Families hold shared description, specifications, producer, release year and structured video. Variants record a concrete identity with a unique slug, optional model number, color, edition, identification state, commercial markets and region-lock information. Names and colors are not unique identities.

The private domain service resolves each optional variant description, specifications, producer, year and video against its family, labeling the chosen scope. A specifications override replaces the whole object; it never deep-merges with family specifications. Blank overrides restore family fallback. Specifications reuse the existing versioned JSON-object validator, including size/depth limits and prototype-key rejection. Variant locking and market fields remain specific to that variant.

Video reuses the game contract: a validated YouTube ID or direct HTTPS URL, with one complete group per target. Raw HTML and arbitrary embed URLs are not accepted. The catalog only records the reference; it does not activate external playback. New or changed video starts unapproved for public use. Unrelated edits preserve an unchanged group's approval. Typed rating persistence remains deferred; no accepted rating is placed in generic metadata JSON.

## Explicit compatibility

Each variant has its own confirmed platform links and optional compatibility notes, including adapter or hardware-model restrictions. Missing links mean unconfirmed compatibility. Commercial markets and region locking are separate facts. A family shows a read-only union across its active variants, labeled accordingly and limited to 30 platforms with an overflow notice. Retained archived platforms stay visibly labeled.

When creating a variant, an administrator can load another active variant from the same family as a compatibility draft. This replaces the visible draft list only after the explicit load action. The administrator can edit it and must confirm review before saving. The service checks source identity, family, revision and review acknowledgement. Saved links are independent; subsequent source changes do not change the new variant. No authoritative family compatibility list exists.

## Access, integrity and scope

Catalog reads, lookups, compatibility drafts, writes and archives require current administrator permission. Mutations validate input server-side, acquire the existing shared catalog lock, recheck permission, reject stale revisions and commit roots, relations, references and manual history atomically. Foreign reference IDs are rejected. Archived records require restoration before editing; archived relations may be retained on existing records but cannot become new links. Archives are reversible and preserve owned references.

Bounded lists use 25 records plus a next-page sentinel; lookups return at most 25 active matches with slugs to distinguish names. Compatibility and market input lists are limited to 30 each. Their linked-record validation and join writes are batched. Change history shows the latest 50 field changes, retaining the complete history in storage.

Private catalog resolution and owned-accessory identity reads require `private.read` and revalidate access. Owned resolution lives in the collection service/repository and returns only copy ID/revision plus explicit family/variant facts, preserving archived identities. It does not expose personal notes, serials, media storage fields or audit payloads. Copy CRUD is Task 16.2, enrichment is Task 16.3 and the accessory detail/media presentation is Task 16.4. No new provider, public query, viewer, dependency or owned-copy mutation is introduced here.

## Migration and verification

`20261020180000_accessory_videos` adds the four structured video columns and group constraint to each existing catalog table, reusing `TrailerProvider`. Existing records start with empty video and false public approval. Apply it through the normal migration deployment workflow. Verification uses disposable PostgreSQL; the personal development database is not migrated.

Verification passes: lint, typecheck, Prisma schema validation, production builds, formatting/whitespace, all 1,236 unit/component cases, 89 distinct disposable-PostgreSQL accessory/catalog/repository/core-schema cases and 26 distinct desktop/mobile browser cases across full and focused runs. The deferred 3D bundle remains unchanged and within budget. Browser fixtures contain only synthetic catalog records. Validation, schema replay, scoped persistence/rollback, authorization, stale writes, reviewed copying, family fallback, owned subtype references, compatibility unions, narrow layouts and existing catalog workflows are exercised. Light desktop and dark mobile screenshots were reviewed, including long titles and compact Edit actions. Final task status is recorded in [the development plan](../../DEVELOPMENT_PLAN.md).

Implementation: [validation](../../src/features/accessories/validation.ts), [catalog service](../../src/server/services/catalog/accessories.ts), [catalog repository](../../src/server/repositories/catalog/accessories.ts), [owned identity service](../../src/server/services/collection/accessories.ts), [catalog editor](../../src/features/accessories/components/accessory-catalog-editor.tsx), [database tests](../../tests/integration/accessory-catalog.test.ts), [browser tests](../../tests/access-e2e/accessory-catalog.spec.ts).
