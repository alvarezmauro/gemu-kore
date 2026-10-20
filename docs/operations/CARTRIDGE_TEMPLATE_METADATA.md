# Cartridge format and variant metadata

Task 14.5 adds curator-supplied format metadata to the cartridge workflow established in Task 14.4. The format identifies the intended shell family; the curator supplies the actual model, measurements, label mapping and review. Selecting a format does not load a preset GLB, supply retail dimensions, link a ConsolePlatform or confirm historical suitability.

## Available choices

The nine named choices come from PROJECT_SPEC §44:

| Key                | Display name     |
| ------------------ | ---------------- |
| `nes-us`           | NES US           |
| `famicom`          | Famicom          |
| `snes-us`          | SNES US          |
| `super-famicom`    | Super Famicom    |
| `genesis`          | Genesis          |
| `game-boy`         | Game Boy         |
| `game-boy-color`   | Game Boy Color   |
| `game-boy-advance` | Game Boy Advance |
| `nintendo-64`      | Nintendo 64      |

**Unspecified** preserves an unidentified or older template. **Other** requires a shell-variant description. For any format, **Shell variant** can describe the measured shell revision or market variant in up to 200 characters. Choosing a name is a curator declaration; it does not certify a particular shell or imply that every regional, licensed or unlicensed variant shares its geometry.

## Curation

1. Open **Manage release cartridges → Create cartridge template**.
2. Select **Cartridge format** and describe the **Shell variant** where known. Describe Other formats in that field.
3. Supply the template name, unique slug, unused cartridge-family revision, actual dimensions, measurement evidence and explicit FRONT_LABEL mapping as before. Revision numbers remain shared across the `cartridge` family, including different format choices.
4. Upload the private GLB with known source and rights metadata. Review its actual shape, dimensions, label surface and suitability before marking it ready. Follow the [cartridge authoring guide](CARTRIDGE_AUTHORING.md).
5. Select the ready template on an expected media component and explicitly assign label artwork. Administration and private game details display the declared format and shell variant alongside the template identity.

The renderer remains `cartridge-v1`: opaque authored housing and one upright rectangular FRONT_LABEL surface. A format choice does not add wraparound/top/back labels, transmission, opening animation or another media renderer. Curate only geometry that satisfies the implemented contract. The application ships no new retail model, measurement claim, production template seed or automatic release assignment in this metadata expansion. The existing synthetic study remains labeled synthetic.

## Storage and compatibility

New template commands validate a strict optional/defaulted `format` value:

```json
{
  "schemaVersion": 1,
  "formatKey": "snes-us",
  "variant": "Curator-supplied shell variant"
}
```

The value is stored under `PhysicalMediaTemplate.metadata.format`. Its keys are descriptive controlled values, not catalog foreign keys. Existing template metadata retains its version-1 envelope, synthetic flag and measurement note. An older row without `format` reads as `{ "schemaVersion": 1, "formatKey": "unspecified", "variant": "" }`; reading or retrying its original creation command does not rewrite it. No schema migration or backfill is required.

Creation retries compare the effective format and variant as well as geometry metadata. A conflicting retry fails instead of changing manual metadata. Ready-template guards already freeze the whole metadata object. Correcting an approved format or variant requires a new template revision and explicit reassignment. Current administrator permissions, stored-byte approval, source retention, explicit labels and cleanup references remain in force.

Template choices include the latest 50 revisions per format plus every assigned template. A large catalog for one format cannot crowd out another format or a retained older assignment. The server bounds per-format candidates before loading full contracts. Legacy rows participate in the unspecified group. The assembled renderer descriptor and R3F resource/camera/controls code are unchanged; private detail summaries receive only the descriptive format and variant, while measurement notes and storage details remain excluded.

This task does not activate owned presence, primary packaging or public presentation. Task 14.6 — 3D System Review remains a separate step.

## Verification

Verified 2026-10-20: 1,211 unit/component tests (82 files, two workers, unchanged timeouts), 11 media + 10 packaging + 8 game-catalog integration checks and all 45 PostgreSQL/MinIO upload checks pass. Coverage includes all eleven format choices, bounded variant text, Other descriptions, required explicit dimensions/targets, rejection of unsupported or invented preset fields, independently defaulted legacy metadata, no read/retry writes, conflicting retries, immutable approved metadata, permissions, private summary labels and bounded per-format choices with retained older assignments.

All 14 distinct desktop/mobile cartridge/packaging browser cases pass. The initial run passed all 12 packaging cases and identified that the new select needed an explicit accessible name. After that fix, both cartridge cases passed in a fresh production-build run. The flow verifies all choices, Other's required description, empty dimensions/mappings after format selection, persistence through private upload/approval, format/variant labels on game details, preserved crop errors, lazy model/art transfers, independent labels, component teardown, 320px/reduced-motion controls and revoked access. The 320px detail screenshot was reviewed; no physical-phone performance claim is made.

Lint, typecheck, production build, formatting/whitespace and documentation links pass. The deferred 3D bundle remains 1,011,263 raw / 270,732 gzip bytes, below 1.25 MiB / 320 KiB. No R3F/resource-loader/descriptor, Prisma schema, migration or dependency file changes are introduced. Tests use disposable PostgreSQL/MinIO; the personal development database is unchanged. The broader pre-existing search-plan benchmark limitation recorded under Task 14.2 was not rerun or suppressed.
