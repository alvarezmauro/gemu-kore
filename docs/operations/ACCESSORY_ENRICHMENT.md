# Accessory enrichment

Task 16.3 extends the existing enrichment runner, saved runs, suggestions, receipts, authorization, admission limits and metadata history to `Accessory` and `AccessoryVariant`. It adds one optional structured source adapter. There is no separate AI system, background worker or public review endpoint. The accepted architecture's optional web/AI stages remain explicitly skipped when unconfigured.

## Setup

Apply `20261020200000_accessory_enrichment` through the normal migration deployment workflow. It extends the existing database provider and suggestion-field allowlists to include Wikidata, release year and producer ID. Existing explicit target FKs, constraints, immutable snapshots, history and workflow tables remain in use. Verification deploys migrations only to disposable PostgreSQL; the personal database is not migrated.

Set `ACCESSORY_METADATA_PROVIDER=wikidata` to enable the source, then restart the app. It defaults to `none`. No API key or SDK is required. `WIKIDATA_USER_AGENT` optionally supplies an identifying agent with a public contact URL; the default identifies this repository. These are server-only settings and appear in `.env.example`. Configuration is lazy and source construction performs no network access. Disabled, invalid, unavailable or rate-limited lookup never prevents manual copy creation.

The adapter uses the fixed Wikidata Action API, bounded JSON transport already used by metadata providers, explicit deadlines/cancellation, no redirects, a 512 KiB response limit and a process-local scheduler. Search returns at most 20 candidates; a fetch loads one selected item and at most ten manufacturer labels in one batch. There is no crawl, arbitrary URL fetch, SPARQL query or automatic media download. Rate limits and transient failures use the shared explicit retry workflow. One operation still has the shared 45-second deadline, three-attempt cap, requester quota and persisted fencing/lease protections.

## Review scope

| Target            | Eligible acceptance                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessory family  | Name, description, unambiguous release year, one explicitly resolved manufacturer/producer, selected product video, appended source reference |
| Accessory variant | Explicit source reference only                                                                                                                |

A product match does not establish a particular color, edition, commercial market or platform compatibility. No family evidence is copied into those variant facts. Manufacturer selection binds a sourced identity to an existing active local company; it never creates a company. One unambiguous accepted company mapping may resolve automatically. Multiple source manufacturers require one explicit selection; no first-result guess is accepted. Company revisions are frozen and rechecked before acceptance.

Wikidata labels support English and multilingual default values (`mul`), including fallback labels returned with a different language code. Publication date P577 supplies a year only when precision, calendar and uncertainty validate and supplied values agree. Inception P571 is not treated as a release date. Qualified, deprecated, malformed and ambiguous statements do not silently become global facts. Optional malformed sections remain unavailable while valid independent fields survive.

Descriptions stay plain text. Product videos are selected explicitly from validated YouTube identifiers and start with public approval cleared. Source image/file pages, edition/version-number observations, catalog-code observations and unverified rating text remain inspectable observations. They never become attached files, ratings or edition facts. Images still require the existing authorized ingestion path; typed accessory rating and package-contents persistence remain unavailable. Missing facts remain unknown, never zero, deletions or invented specifications.

## Using it

After selecting a family and variant in Add accessory, open **Review accessory metadata** or **Review variant reference**. The new tab retains the copy draft, defects and browser-local files. Active saved copies offer the same entries to editors and administrators. Viewers have no enrichment entry or review access.

Choose the matching source record, select eligible groups, match a manufacturer to a local company when needed, and prepare the fixed preview. Editors can prepare their own reviews and share the retained URL with an authorized administrator themselves. Only an administrator may accept canonical changes. Every selected populated manual or unknown-origin field requires its own acknowledgement. Current grants, root/parent revisions, manufacturer dependencies and frozen suggestions are checked inside the existing catalog transaction. History, decisions and receipt commit atomically; repeated acceptance returns the original receipt.

Return to Add accessory and choose **Refresh catalog choices**, then review the copy again. Personal notes, defects and staged files remain intact. The server independently rejects stale creation revisions. Enrichment never retargets or resubmits a copy, changes personal fields, publishes an item or approves media.

Review URLs and observations are private feature DTOs, not public projections. Sources retain provider, item identity, retrieval/update times, normalization, scope, local bindings and linked immutable history. No personal serials, notes, locations, photos or defects are supplied to the adapter. Other editors cannot open a requester's review; administrators can review retained runs. Revoked access is rechecked after locks and external retrieval.

## Verification

Verification passes 1,272 unit/component cases, 134 disposable-PostgreSQL integration cases and 14 desktop/mobile browser checks, including existing game enrichment and accessory-copy regressions. Deterministic tests cover the adapter and shared service workflow using synthetic records and disposable databases/storage. Browser flows exercise optional unconfigured lookup, field preparation, administrator acceptance, manual acknowledgements, scope restrictions and retained copy drafts/files. A read-only live search validated discovery of the DualShock 2 item; live fetching also exposed multilingual default labels and informed a regression fixture. Transient network failures remain sanitized retryable outcomes. Final check results are recorded in the development plan.

Primary API references: [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API), [API etiquette and maxlag](https://www.mediawiki.org/wiki/API:Etiquette), [default labels](https://www.wikidata.org/wiki/Help:Default_values_for_labels_and_aliases), [publication date](https://www.wikidata.org/wiki/Property:P577), [manufacturer](https://www.wikidata.org/wiki/Property:P176), [YouTube video ID](https://www.wikidata.org/wiki/Property:P1651).
