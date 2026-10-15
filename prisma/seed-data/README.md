# Console seed format — version 1

Task 8.2 defines version-controlled, production-safe catalog **inputs**. It does not apply them to a database. Task 8.3 expands the data after this format is reviewed. The starter contains one company, one market, one platform and one hardware model, with no owned copies or synthetic catalog products.

Run from the project root:

```sh
pnpm seed:validate
```

This command reads the four files below, validates them as one complete dataset, reports counts and exits nonzero on an error. It accepts no arguments, loads no environment file, needs no credentials, opens no database connection and fetches no source URLs. Repeating it changes neither files nor catalog data. It is independent of application startup, installation, migrations and production builds. There is deliberately no `db:seed` command or automatic Prisma seed hook yet.

## Files and identity

| File                                                 | Required JSON envelope                  |
| ---------------------------------------------------- | --------------------------------------- |
| [companies/companies.json](companies/companies.json) | `{"schemaVersion":1,"companies":[...]}` |
| [regions/regions.json](regions/regions.json)         | `{"schemaVersion":1,"regions":[...]}`   |
| [consoles/platforms.json](consoles/platforms.json)   | `{"schemaVersion":1,"platforms":[...]}` |
| [consoles/models.json](consoles/models.json)         | `{"schemaVersion":1,"models":[...]}`    |

Edit the arrays in these four files. Files are explicit and read in the order above; adding an unlisted JSON file does not silently add data. Each file has a 2 MiB limit and each category permits at most 2,000 records. Arrays may be empty. All four files must be present and use schema version 1; unknown properties and unsupported versions fail validation. [The executable contract](../../src/features/catalog/seeds/format.ts) defines the exact field bounds and exports `ConsoleSeedData`. [The checker](../../scripts/check-console-seeds.ts) uses a bounded file loader and this contract.

Every record has an immutable, namespaced `seedKey`, for example:

- `company:sony`
- `region:jp`
- `platform:sony.playstation`
- `model:sony.playstation.scph-1000`

Keys contain lowercase letters, digits and dot/hyphen-separated components, with the matching entity prefix and at most 160 characters. Once assigned, retain the key when correcting a display name or slug. Relationships use seed keys, never names, slugs, array positions, database UUIDs or provider IDs. Keys and slugs must be unique within their entity category; market codes must also be unique. Names and model numbers may repeat. Database UUIDs remain generated database identities; the seed key is not substituted for a UUID.

## Fields

All records require `seedKey`, `name`, `slug` and `provenance`. Names have at most 200 characters; slugs use lowercase letters/numbers separated by single hyphens, at most 200 characters. `description` is optional/nullable, at most 4,000 characters.

| Category        | Additional fields                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company         | Optional/nullable `countryCode` (two uppercase letters), `foundedYear`, `website`; optional `aliases`, `references`.                                                                                                                                                                     |
| Region          | Required `code` (uppercase letters/digits with optional hyphen/underscore separators, at most 40 characters). No external-reference target.                                                                                                                                              |
| ConsolePlatform | Optional/nullable `manufacturerSeedKey`, `generation` (1–100), `originalReleaseYear`, `discontinuedYear`, `history` (16,000 characters); optional `aliases`, `references`.                                                                                                               |
| ConsoleModel    | Required `platformSeedKey` and `identificationStatus` (`INCOMPLETE` or `CONFIRMED`). Optional/nullable `manufacturerSeedKey`, `modelNumber`, `releaseYear`, `discontinuedYear`, measurements, `regionLock`, `regionLockNote`, `specifications`; optional `regionSeedKeys`, `references`. |

Years are JSON integers from 1 to 9999. Discontinuation cannot precede a known release year. Aliases are unique nonempty strings, at most 30 names of 200 characters each. Model number is at most 200 characters. `regionLockNote` is at most 4,000 characters. Sources do not automatically fill unspecified fields.

Optional properties may be omitted when not supplied. Nullable fields may explicitly use `null` to document an unknown value. Neither absence nor `null` authorizes clearing an existing catalog fact in a future import. Empty strings and fabricated zeros are rejected. The parser does not fill defaults, infer an actual model manufacturer from the platform brand, copy platform launch years into model years, or promote identification status.

Market links use `regionSeedKeys` (at most 30 unique keys). Every linked company, platform and market must exist in the complete dataset. Region is commercial coverage only: no PAL, NTSC, SECAM, Region Free or unknown sentinel. Omitted/empty model markets mean unknown coverage; Worldwide must be deliberate and cannot be combined with specific markets. Company country codes are not market relationships. Region lock is independently `UNRESTRICTED`, `RESTRICTED`, `NOT_APPLICABLE` or unknown.

Measurements are **decimal strings**, preserving the database's units and precision: `widthMm`, `heightMm`, `depthMm` allow up to seven whole digits; `weightGrams` allows nine. Values must be positive with up to three fractional digits, for example `"270.125"`. Never mix centimeters, kilograms or numeric placeholders into these fields.

Specifications use the existing database envelope, unlike the manual form's data-only text editor:

```json
{
  "schemaVersion": 1,
  "data": {
    "cpu": { "name": "Example processor" },
    "videoOutputs": ["composite"]
  }
}
```

This is an illustrative shape, not asserted hardware data. The data must be a JSON object with at most 16,000 serialized characters, ten levels of nesting and 200 entries per array. Nonfinite numbers, executable/non-JSON values and unsafe prototype property names are rejected. Hardware facts should be sourced for the exact model; avoid copying a family-wide specification into every revision.

## References and provenance

Company, platform and model records may contain up to 30 external `references`. Each has a lowercase `provider` key and either `externalId`, `url`, or both. An external ID requires `providerObjectType`. URLs must be HTTP/HTTPS without embedded credentials. URL-only uniqueness uses the existing catalog URL normalization, including fragment removal. Identity uniqueness is per target, not global across unrelated catalog products.

```json
{
  "provider": "example-provider",
  "providerObjectType": "console",
  "externalId": "12345",
  "url": "https://example.com/consoles/12345"
}
```

Omit absent optional identity fields or use null. Do not commit database reference IDs, target FKs, `normalizedUrl`, arbitrary provider payloads, credentials or unreviewed asset URLs. Reference targets come from their parent record. Provider adapters and raw metadata imports belong to later tasks.

Each record's `provenance` requires a `sources` array and optionally a `note` (up to 2,000 characters). Sources contain `title`, `url` and a real calendar `checkedOn` date (`YYYY-MM-DD`), at most ten per record. At least one source or an explicit curation note is required. Controlled vocabulary may cite a project requirement in its note with an empty source list. Facts about actual hardware should cite reliable sources, preferably the manufacturer, and use the note to distinguish what each source supports from what remains unknown. Validation checks structure and links, not historical truth or source availability.

Provenance is distinct from ExternalReference and Asset provenance. A citation explains why a seed fact is being proposed; a provider reference identifies a catalog object; neither authorizes downloading or publishing image/model files. A future applicator should persist bounded seed source snapshots with `MetadataChange.origin = SEED`; it must not route these records through the manual action and incorrectly mark them MANUAL. The source check date is not the import execution timestamp.

## Future application contract

The format is ready for a later, separately implemented applicator. That applicator must satisfy the accepted [domain model](../../docs/architecture/DOMAIN_MODEL.md) and [catalog transaction contract](../../docs/operations/CONSOLE_CATALOG.md):

1. Validate the complete dataset before writing. Resolve companies and markets before platforms, then models and explicit relationship rows.
2. Match existing roots only by their entity's stable seed key. Do not match names or silently attach a seed key to a manually curated row with a matching slug/code. Report that collision for an administrator to resolve.
3. Default to insert-only behavior. Matching seeded roots retain their UUIDs, current facts, manual edits, revision, archive state, market links and references. A no-change rerun must create neither duplicate rows nor duplicate history and must not advance revisions. Removing an entry from a JSON file must not delete or archive catalog data.
4. Treat any update, adoption of an existing manual row, deletion, reference reconciliation, key change or restoration as a separate explicitly reviewed administrator operation against current revisions. Omitted values, nulls and empty arrays are never implicit destructive update instructions.
5. Use current administrator authorization, the existing catalog write lock, domain checks and atomic field-level SEED history. Existing manual fields are never silently overwritten. Imports are not a shortcut around permissions or provenance.
6. Store resolved relationships as the existing FKs/join rows, never only as JSON. Root and dependent changes belong in one transaction, without HTTP requests during it. Do not create owned copies, user/grant rows, publication choices or asset files from these inputs.

These are requirements for a future writer, not a claim that this task implements database seeding or exercises its idempotence. The validation command is read-only. No database schema change is necessary for this format.

## Small starter and evidence

The starter contains Sony, Japan, PlayStation and SCPH-1000. It establishes a linked example without expanding Task 8.3's catalog. [Sony's corporate history](https://www.sony.com/en/SonyInfo/CorporateInfo/History/) supports the company origin; the [official PlayStation timeline](https://www.playstation.com/en-us/playstation-history/1994-ps-one/) supports the platform's 1994 Japanese launch. [Sony's 2005 CSR report, printed page 9](https://www.sony.com/en/SonyInfo/csr/library/reports/sis4ug000000jyws-att/CSR2005E.pdf) identifies the SCPH-1000 and year, and the [Japanese hardware support list](https://www.playstation.com/ja-jp/support/hardware/repairs-no-longer-available/) supplies model/market context. That context is deliberately limited: a repair-support end date is not a manufacturing discontinuation date, and the support list is not a complete worldwide distribution record. The model remains INCOMPLETE; unsupported measurements, actual manufacturer, locking and detailed specifications are omitted.

For Task 8.3, add a few reviewed systems at a time to the same files, retain existing keys, cite evidence, leave uncertainty explicit, and run `pnpm seed:validate` before review. Do not change the Prisma schema to fit seed data. Keep synthetic test fixtures and private collection records out of this directory.

## Task 8.2 verification

All 66 seed-format/tooling checks and the full 689-test unit/component suite pass, along with lint, TypeScript, formatting, documentation links and whitespace checks. Tests cover linked starter data, field bounds and unknowns, source dates, duplicate/cross-category identities, unresolved relationships, market/locking distinctions, specifications, reference scope and normalization, compatibility with the existing manual catalog input, malformed/oversized/missing files, repeated offline CLI execution and unchanged input hashes. Existing UI, services, schema and database writes are outside this task, so database and browser suites were not rerun for this format-only change.
