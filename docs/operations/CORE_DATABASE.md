# Core catalog and collection database

Task 4.1 implements the core subset in [DOMAIN_MODEL.md §10](../architecture/DOMAIN_MODEL.md#10-core-schema-versus-later-feature-migrations), without changing the agreed entity splits. The Prisma schema is [schema.prisma](../../prisma/schema.prisma); the additive migration is [20261004070000_core_catalog_collection](../../prisma/migrations/20261004070000_core_catalog_collection/migration.sql).

## Included structures

| Area                          | Core models                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Settings                      | AppSettings, PublicSettings                                                                                              |
| Canonical identity            | Company, Region, ConsolePlatform, ConsoleModel, Game, GameRelease, Accessory, AccessoryVariant                           |
| Markets/compatibility/credits | ConsoleModelRegion, GameReleaseRegion, GameCompany, GameReleaseCompany, AccessoryVariantRegion, AccessoryVariantPlatform |
| Catalog evidence              | ProductIdentifier, ExternalReference, MetadataChange                                                                     |
| Shared collection             | CollectionItem, OwnedConsole, OwnedGame, OwnedAccessory, Location, Defect                                                |

These 25 new models sit beside the five existing authentication/policy models. There is one shared collection, no per-user owner, stock quantity, catalog superclass or unchecked polymorphic target ID. Creator/updater/publisher/history actors are optional attribution, not ownership or authority. No new dependency or application endpoint is needed.

Catalog roots have UUIDs, unique slugs and optional stable seed keys, nullable archival timestamps and positive revision numbers. Names, hardware model numbers, commercial identifier values and observed serial numbers are not globally unique. Multiple physical printings with the same game/platform/edition labels and multiple owned copies of one release are valid.

Settings are fixed-ID singletons (`id = 1`) with revision counters; the migration creates their default rows and prevents ordinary deletion. General settings default to GemuKore, system theme and UTC. Every public visibility flag starts false, and the only global publication toggle belongs to PublicSettings. No catalog, inventory or administrator seeds are added. These rows establish future contracts; they do not implement settings/publication UI.

## Database enforcement

- Every surviving CollectionItem has exactly one matching subtype. Child primary keys, fixed category checks and composite `(id,type)` foreign keys prevent duplicates/mismatches. Deferred constraint triggers reject a parent with no child at transaction completion, including after child deletion or movement. Root category is immutable. A same-category model/release/variant reassignment remains possible.
- Owned root deletion cascades the matching subtype and defects, preserving shared catalog identities and other copies. Referenced canonical entities, companies and markets use restrictive deletion. Catalog market/compatibility joins can cascade with their deletable catalog parent. User deletion nulls attribution and preserves owned/catalog data and publication facts.
- Model/release/variant markets are explicit joins, independent of nullable technical locking and variant compatibility. A release-company market-scoped credit must reference that release's market join. Partial unique indexes handle both scoped and unscoped credits; generic development credits use only DEVELOPER.
- Release market dates keep unknown/year/month/day precision, with prefix dependencies, year/month bounds and actual calendar-day checks including leap years. No competing exact date or artificial January 1 exists. GameRelease.firstReleaseYear is only the approved unknown-market fallback.
- ProductIdentifier has exactly one model/release/variant target; codes stay text, retaining leading zeros. ExternalReference has exactly one of the seven approved catalog targets and requires an external ID with object type, a URL, or both. Identity uniqueness is target-scoped, including partial URL-only uniqueness. `normalizedUrl` is the future service's consistently normalized key, not a second editable URL.
- Location has a real parent FK, normalized sibling/root-name uniqueness, a self-parent check and restrictive deletion while occupied or containing children. This is an adjacency list, not a closure table. Multi-level cycle prevention remains the approved serialized hierarchy-service responsibility for Phase 6; this migration does not claim arbitrary SQL moves are cycle-safe.
- Defects preserve severity/status records. REPAIRED requires resolvedAt; ACTIVE/ACCEPTED require it to remain null. ACCEPTED remains unresolved. Defects target the copy; optional physical-component targeting arrives with that feature.
- MetadataChange has exactly one of eight canonical targets, unique target/revision/field facts and immutable before/after snapshots. Ordinary fact edits/deletion are rejected. Deleted-user actor attribution may become null without changing facts. Canonical target deletion remains restricted while history exists.

Prisma does not represent the migration's CHECK constraints, triggers or the partial indexes used here without opting into its experimental partial-index feature. The reviewed SQL remains authoritative for those invariants; no new preview feature was enabled. Keep those statements in version-controlled migrations and preserve them in later migrations. Never replace this migration with `db push`. This follows [Prisma's custom migration workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/unsupported-database-features) and [PostgreSQL's deferred constraint-trigger semantics](https://www.postgresql.org/docs/16/sql-createtrigger.html).

## Column and service contracts

New core instants use `timestamptz(3)`. Existing auth timestamp columns are unchanged. Core entity IDs use PostgreSQL's built-in UUID function; schema annotations use the introspected `gen_random_uuid()` spelling, while migration SQL qualifies `pg_catalog.gen_random_uuid()`. This avoids spurious Prisma default-expression drift without changing existing auth tables or ID behavior.

Dimensions use exact decimals in millimeters; weight uses grams. Unknown values stay null. Aliases and language codes are descriptive string arrays, not hidden relationship IDs. Optional technical/provider JSON uses an envelope `{ "schemaVersion": 1, "data": { ... } }`. Database checks enforce that outer shape; feature services must enforce content schemas, bounds, URL validation and redaction when implemented. MetadataChange.before/after are typed JSON values, including JSON null for a missing previous fact, governed by snapshotSchemaVersion.

A collection aggregate must be created inside one transaction: create its root, create the matching owned child, then commit. Prisma nested create is also verified. Creating the root in one committed operation and adding its child later is invalid. Deleting/replacing a subtype alone must retain the root's valid subtype at commit. Explicit `SET CONSTRAINTS ... IMMEDIATE` can force the check sooner, so callers must not force it before finishing aggregate creation.

This task provides storage contracts only. Future authorized services must revalidate current permissions inside write transactions, validate input/domain rules, increment aggregate revisions and persist manual/seed/provider provenance atomically. Catalog writes/history are ADMIN responsibilities. Publication approval/reset, Region Worldwide redundancy, full hierarchy acyclicity and normalized URL/content rules remain service responsibilities; database constraints do not replace them. Repositories and CRUD are Task 4.3 and later, not implemented here.

## Deferred schema

No Asset or media-use table/FK, component-presence table, packaging/media template or artwork binding, GamePlaytime, rating/trailer groups, EnrichmentRun/Suggestion, suggestion-history FK, search extension or rendering structure is introduced. Their feature migrations add them at the stages specified in the approved model. CollectionItem.hasBox remains nullable manual data until primary-package presence tracking arrives. Public routes, catalog CRUD and collection forms remain unchanged.

## Migration and verification

The migration is additive and explicitly transactional. It changes no existing auth/policy table or rows. Existing applied migration files remain untouched. After validation against disposable PostgreSQL, apply locally using the existing commands:

```sh
pnpm db:deploy
pnpm db:generate
pnpm db:status
pnpm db:check
```

The core integration suite exercises the actual Prisma client and direct SQL against disposable PostgreSQL. It verifies fresh migration replay, repeat deployment, Prisma-visible drift, all three aggregate types, invalid roots/subtypes, child movement/replacement, independent printings/copies, delete rules, markets/credits, date precision, typed targets/uniqueness, location names, defects, immutable provenance, deleted-user attribution and versioned JSON. It never uses personal collection data; its isolated fixture reset deliberately uses TRUNCATE to discard immutable test history.

Task 4.2 remains the next independent schema review before major features. Test results and local deployment verification are recorded in [DEVELOPMENT_PLAN.md](../../DEVELOPMENT_PLAN.md) and [TESTING.md](TESTING.md).

Verified 2026-10-04: 40 new core integration cases pass; the complete suite passes 82 unit/component, 177 integration and 64 desktop/mobile browser tests (323 total). Schema validation, lint, TypeScript, formatting, production builds and whitespace checks pass. Local migration status/drift/connectivity are healthy. Docker regenerated all 30 models and its existing login/private redirect/design preview remain functional. Temporary test databases were removed.
