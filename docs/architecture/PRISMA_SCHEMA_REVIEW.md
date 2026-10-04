# Prisma schema review — Task 4.2

Reviewed: 2026-10-04. Scope: the 30 implemented models, their relations and migration SQL, against PROJECT_SPEC.md and the approved Task 0.2 domain model. This is a review of storage contracts before repositories and major features; it does not certify services that have not been implemented.

**Decision: retain the approved architecture and proceed to Task 4.3 after the corrections below.** One aggregate-integrity bypass was reproduced and fixed. Required string-list storage was tightened, approved history indexes were added, and one premature index was removed. No unresolved major schema defect was identified within this core scope.

## Findings and corrections

| Finding                                                         | Severity | Evidence and correction                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 — Mutable collection IDs bypassed subtype enforcement        | High     | The deferred check captured the original ID. Creating a root and changing its ID before commit, or deleting an existing child and changing its root ID, let the queued check skip the now-missing original root. Both transactions committed an orphan. Six regression cases reproduce the two paths across CONSOLE, GAME and ACCESSORY. A BEFORE UPDATE guard now makes CollectionItem.id immutable; category immutability and deferred checks remain in place.                          |
| S2 — Required scalar lists admitted SQL NULL                    | Medium   | Company.aliases, ConsolePlatform.aliases, Game.aliases and GameRelease.languages were declared String[] with empty defaults but their migrated columns allowed SQL NULL. Four regression cases failed before correction. NOT NULL and row-local checks now enforce flat lists with nonnull string elements. Each case also rejects a null element and a multidimensional array, and accepts a populated or empty list. No alias or language naming convention is invented by this review. |
| S3 — Approved history access indexes were missing               | Low      | DOMAIN_MODEL.md §8.1 calls for target/time indexes. Existing target/revision/field uniqueness covers revision lookup and target FKs, but not a chronological ordering prefix. Eight ordinary `(targetId, createdAt, id)` indexes now support deterministic target-history pagination. A database-catalog regression checks every target. This restores the approved access path; it is not a measured performance claim.                                                                  |
| S4 — An unused future component candidate key was created early | Low      | OwnedGame's `(collectionItemId, gameReleaseId)` unique index had no FK consumer; its first column is already the primary key. Removed it from Prisma and SQL. Add the candidate key together with the actual OwnedGameComponent consistency FK in Phase 14. No current relationship or uniqueness guarantee is weakened.                                                                                                                                                                  |

Corrections are in [20261004135000_core_schema_review](../../prisma/migrations/20261004135000_core_schema_review/migration.sql). Existing applied migrations were preserved. Subtype/list enforcement and history-index creation share an explicit transaction, which locks the owned aggregate tables while checking existing roots and refuses existing orphans. Required-list constraints validate existing rows rather than silently rewriting catalog facts. The unused candidate index is dropped before that transaction; if validation fails, this redundant index removal remains, but no current FK or uniqueness guarantee depends on it. The migration contains no data deletion, normalization, seeds or auth-table changes.

If a database contains an orphan or invalid list, migration application must stop for explicit repair using verified source information. Do not invent a catalog selection, discard a copy, clear historical facts, or edit an applied migration to get past validation. After a failed deployment, inspect migration status and reconcile the failed migration before retrying; restoring the dropped candidate index is necessary if rolling back and replaying this exact SQL. Never retry against partial state blindly.

## Review of the required areas

### Relationships and canonical identity

The catalog and owned collection remain separate. ConsolePlatform describes a family and ConsoleModel its hardware product; Game describes a title and GameRelease a specific platform/edition/printing; Accessory describes a family and AccessoryVariant its actual compatible product. Every owned subtype requires its corresponding model, release or variant. Unknown identification uses an explicitly incomplete canonical record, not a nullable selection that erases the distinction.

CollectionItem supplies shared copy data, publication state and attribution. Its primary key and category are immutable; its canonical selection may change within that category. Matching fixed child types, composite FKs, child primary keys and deferred presence checks jointly enforce exactly one matching subtype at commit. Root and child creation must share a transaction. Same-category child replacement and whole-root deletion remain valid. There is no per-user owner, stock quantity, universal catalog superclass or unchecked polymorphic ID.

The apparently redundant `(collectionItemId,type)` child unique keys are retained: removing them in a temporary schema produced Prisma P1012 on all three one-to-one relations. The root `(id,type)` key also provides the referenced candidate key. Replacing these relationships with application-only type checks would lose database enforcement.

Region is exclusively a commercial market. Zero market links mean unrecorded coverage; Worldwide is a real controlled entry. Nullable technical region locking, hardware video standards and language lists express different facts. Owned records do not add conflicting authoritative region overrides. Company is one reusable identity with roles supplied by its relationships; there are no competing publisher/developer/manufacturer identities.

### Indexes and uniqueness

A PostgreSQL catalog audit confirms every FK in the public schema has a valid, ready, nonpartial index whose leading columns match that FK. Primary and unique indexes supply this coverage where suitable; reverse indexes cover region/platform/company joins. Existing collection `(createdAt,id)` and `(type,createdAt,id)` indexes permit stable ordering. The added history indexes follow the same tie-breaking convention.

Slugs, region codes and optional seed keys identify catalog records. Names, model numbers, serials and commercial codes are deliberately not globally unique. Different physical printings may share game/platform/edition labels; multiple owned copies may reference one product. Product codes remain text so leading zeros survive.

ProductIdentifier uniqueness is target/scheme/normalized-value scoped. ExternalReference identity is target/provider/object-type/external-ID scoped; URL-only references use target/provider/normalized-URL partial uniqueness. References require exactly one real catalog FK and usable ID/URL data. NULL semantics are handled explicitly for URL-only references, root locations and unscoped company credits. Provider object identity may appear on different canonical targets; a global provider-ID uniqueness rule would be too restrictive.

No speculative global boolean, JSON, publication, full-text or trigram indexes were added. Phase 7 will examine actual search queries before choosing those indexes. The chronological history indexes implement an already-approved contract.

### Cascading deletes and nullable properties

Deleting a copy cascades its subtype and defects, preserving catalog identities and other copies. Referenced catalog roots, companies, regions and platforms are restricted. Dependent market/compatibility/development-credit links may cascade with their deletable catalog parent. Product identifiers are dependent data; external references and immutable history instead restrict their target's deletion. Archive a curated target with retained evidence rather than deleting it. User deletion removes auth dependents and nulls attribution while preserving collection and publication facts.

Settings are fixed-ID singleton rows with safe defaults and ordinary-deletion guards. All public flags start false; owned items start PRIVATE. Unknown hasBox, location, serial, dimensions, locking and optional descriptive fields remain null. Actor nullability supports deleted-user attribution and system writes; an actor FK is neither collection ownership nor authorization. PUBLISHED requires a publication timestamp even if the original approving user has since been removed.

Aliases and languages use required empty lists when there are no recorded entries. Core instants use timestamptz; existing auth timestamps retain their adapter contract. Positive exact-decimal dimensions use millimeters and weight uses grams. Calendar precision stays year/month/day nullable fields with prefix and real-day validation; an unknown day is not an invented January 1.

### Join tables

Commercial markets, variant compatibility and company credits are explicit relational associations. Composite primary keys prevent duplicate membership; separate reverse indexes permit traversal in either direction. Accessory family compatibility is the union of variants, not a second writable source.

GameCompany allows only generic DEVELOPER credits. GameReleaseCompany supports release-specific roles and optional scope through that release's own GameReleaseRegion row. Its shared release-ID composite FK prevents attaching a market-specific credit to another release's market. Partial unique indexes separately enforce scoped and unscoped credits. Restricting removal of a market still used by a credit requires deliberate reconciliation; deleting a deletable release removes its dependent associations together. Existing integration coverage exercises this behavior.

### JSON usage

Optional hardware/provider payloads use checked `{ schemaVersion: 1, data: { ... } }` envelopes. Identity, markets, compatibility, credits and active target relationships remain columns and FKs. MetadataChange.before/after preserve immutable typed historical values, including JSON null; historical IDs in a snapshot do not replace live target FKs.

Envelope checks are storage protection, not complete content validation. Future feature services must enforce allowlisted fields, content bounds, URL safety, snapshot redaction and version handling before persistence. Manual canonical mutations, seed changes and accepted suggestions must increment the root revision and write provenance in the same transaction. No automatic SQL audit trigger, provider-specific columns, JSON search index or event-sourced current catalog is warranted.

### Future extensibility and hobby-project complexity

Retain the 25 core models plus five auth/policy models. The three explicit subtype tables and nullable target FK sets are justified by database integrity and clear domain boundaries. No extra catalog superclass, closure table, generic relation store, quantity inventory, worker, extension or queue is introduced.

Assets/media uses, release components and owned component presence, playtime, packaging/media templates and texture bindings, enrichment runs/suggestions and rendering details arrive through their approved feature migrations. Existing IDs, root revisions, provenance and publication gates provide their attachment points. Add candidate keys and component-specific defect FKs with their actual relationships. Do not pre-create media FKs to nonexistent tables or store future relationships in JSON.

The physical-edition feature must reconcile component mappings when an owned game's release changes and replace the manual hasBox fallback with its approved presence rules. Asset delivery/provenance belongs to the asset architecture; schema publication fields alone do not make uploads or public DTOs safe.

## Service and operational boundaries

These are approved later responsibilities, not defects to conceal behind an early schema expansion:

- Before any catalog/collection write endpoint exists, enforce current server permissions, validated input, transactional aggregate edits and revision/provenance rules. Canonical mutation is ADMIN-only; attribution does not grant authority.
- Phase 6 location mutations must serialize the small shared hierarchy and validate ancestors. The current self-parent check and FK do not prevent multi-level cycles caused by arbitrary SQL.
- Catalog services must normalize slugs, provider keys and URLs consistently and reject Worldwide alongside redundant specific markets. SQL uniqueness protects the stored key, not every equivalent unnormalized spelling.
- Publication services must require current ADMIN approval and reset approvals when public content changes. Phase 18 queries must apply global/item/media eligibility and explicit DTO field allowlists. Private notes, serials, locations and audit snapshots must not leak through eager relation loading.
- Runtime privileges must be separated from migration/maintenance privileges during deployment. Row-level guards protect ordinary DML, not a privileged operator disabling triggers, truncating tables or altering schema. Disposable fixture TRUNCATE is maintenance, not an application cleanup operation.
- Prisma-visible drift cannot prove custom SQL invariants. Preserve and test CHECK constraints, partial indexes and triggers across every future migration; use the reviewed migration workflow rather than db push.

## Verification and sources

The regression run before the correction produced 11 expected failures: six orphan bypasses, four nullable-list cases and the missing history-index inventory. The foreign-key index audit already passed. After the new migration, all 52 core cases and all 189 isolated integration tests pass, including fresh migration replay, idempotent redeployment, Prisma-visible drift, deletion semantics and prior core constraints.

Full quality checks and local deployment/browser verification are recorded in [TESTING.md](../operations/TESTING.md). No real provider credentials or personal collection fixtures are used by these tests. Existing services and UI are unchanged; repository conventions remain Task 4.3.

The approved domain model remains the design authority. PostgreSQL explains [CHECK/NULL, uniqueness and FK semantics](https://www.postgresql.org/docs/16/ddl-constraints.html) and [leading-column behavior for multicolumn indexes](https://www.postgresql.org/docs/16/indexes-multicolumn.html). Prisma documents [NULL scalar-list filter behavior and empty defaults](https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types/working-with-scalar-lists-arrays) and the [custom SQL migration workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features). This review also applies the Supabase Postgres best-practices skill's foreign-key index guidance; no Supabase service or new dependency is introduced.
