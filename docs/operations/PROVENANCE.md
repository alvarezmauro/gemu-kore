# Metadata and media provenance

Task 13.4 completes attribution reads and presentation using the persisted records introduced in Tasks 13.2/13.3. It adds no second mutable source-of-truth table and makes no calls to a live provider.

## What is retained

Accepting enrichment commits canonical values, one root revision, one immutable `MetadataChange` per changed field/group, its versioned source snapshot, the unique accepted-suggestion link, final review decisions and a receipt together. Snapshots retain provider/object identity, retrieval and source-update times, selected evidence, original scalars and normalization/transformation versions. For example, the stored playtime evidence retains original seconds even though the catalog uses minutes.

Later manual edits append `MANUAL` history; they do not rewrite or delete the earlier imported source. Exact acceptance retries return the stored receipt. Actor deletion can null attribution IDs while preserving source snapshots, change and decision timestamps, and accepted links. Referenced targets/history remain protected from hard deletion. There is no automatic purge or retroactive source backfill.

Manually recording a sourced external playtime estimate remains a manual edit, even when its typed estimate says `sourceType: PROVIDER`. Existing playtime presentation retains that entered source name, URL and recorded date; the metadata-source label describes how the catalog value was entered.

## Current sources on private game details

The **Metadata sources** section is available to every authorized private reader, including viewers. Game and release groups remain separate. It covers the supported game fields (title, description, aliases, developers, references, trailer, playtime) and implemented release groups (description override, release year, company credits, market dates, references, trailer, playtime). Release import acceptance remains limited to the supported reference mapping; this read display does not enable new enrichment fields.

A bounded per-field history lookup determines the latest recorded change, independently of the administrator history's 50-row display window. Before attributing a current value, the service compares it with the change's saved after-value. Object-key order is immaterial; array order remains meaningful. Manual trailer history's approval flag does not change the source of its video reference.

- Matching manual history: **Manually entered**.
- Matching provider history: **Imported metadata**, with supported retained source details.
- Matching seeded/AI-classified history: explicitly labelled by its stored origin; unsupported details stay unavailable.
- No matching history, including legacy untracked corrections: **Source unknown**. A provider reference is not proof of another field's origin.
- Missing values: explicitly say no current value is recorded. A deliberate manual clear retains its manual-change attribution.
- Unknown record/source-snapshot versions: do not guess their contents or invent source details.

For imported evidence the projection shows the stored source name, safe source-page links, retrieval/update dates, supported scope and transformations. Confidence stays **Not provided** for the current structured provider. A sourced addition to an array/group is labelled as retaining existing values; it does not claim that every retained manual entry came from that provider.

Descriptions, trailers and playtime follow the existing release-override/game-default rules. The source groups do not merge those scopes or infer a physical edition from broad game evidence.

The private-reader projection excludes run IDs, queries, diagnostics, review tokens, reviewers, raw before/after values and source snapshots. Authorization precedes the read; revocation is checked through the existing private access service. No public source projection, endpoint, shared cache or page metadata is introduced.

## Manual replacement safety

Both review preparation/read and acceptance use a field origin only when its recorded after-value matches the current canonical value at the known snapshot version. A populated untracked correction is treated conservatively as unknown, even if an older provider change exists. Replacing it requires the existing per-field manual-value acknowledgement. Current permissions, root/dependency revisions and all-or-nothing writes still apply; a source label never grants permission to overwrite.

## Administrator history

The game catalog's **Change history** keeps the existing latest-50 view and before/after inspection, adding a source/origin projection for each retained entry. Older provider entries remain visible with their captured source when a later entry is manual. Complete history remains stored even when it is outside that page's display window. Private readers do not gain access to this administrator history or enrichment review data.

## Media attribution and rights

Private cover and personal-photo source disclosures now show the stored source classification/provider, source URL, author, license, attribution, usage restrictions and retrieval date where recorded. Covers explicitly identify a release cover versus a game-level fallback. Screenshots use the same attribution projection and display in their existing gallery/viewer. Blank licenses remain **Not recorded**; unknown sources remain unknown.

Unsafe source/license schemes, credential-bearing links and excessive URLs are omitted. Text is rendered as text. Source disclosures do not expose object keys, original filenames or uploader/reviewer IDs. They do not fetch remote images, create placeholder assets, approve rights, make bytes public-safe or publish a use. Media source information is separate from redistribution permission and existing publication checks.

The current optional AI/web stages and provider image ingestion remain unavailable as documented in the [enrichment guide](ENRICHMENT.md). No AI/model selection, asset import flow, rating storage or public-attribution UI is enabled by this task.

## Verification

Unit/component checks cover source projections, unknown/unsupported versions, URL sanitization, plain-text rendering, scope labels, confidence and media rights wording. Disposable-PostgreSQL cases cover every supported accepted group, preserved manual entries, later corrections, source history beyond 50 unrelated changes, original normalization evidence, deleted actors, manual/cleared trailers, zero-minute playtime, private media and revoked readers. An additional acceptance regression proves untracked corrections require acknowledgement despite older provider history.

Authenticated production-browser checks cover viewer source reads, administrator history after manual correction, anonymous/viewer restrictions, desktop/mobile and 320px dark/reduced-motion layouts, existing screenshot source/keyboard flows, manual game creation and real personal-photo uploads. Tests use isolated databases/storage and deterministic provider fixtures; no live metadata credentials or personal database are used.
