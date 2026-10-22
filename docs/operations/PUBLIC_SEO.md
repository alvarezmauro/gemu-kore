# Public SEO controls

Task 18.6 connects the existing `allowSearchEngineIndexing` setting to public page metadata, crawler instructions, sitemaps and independently eligible OpenGraph images. The setting remains false by default. Changing it uses the existing current-ADMIN, same-origin, revision-reviewed settings workflow; indexing alone does not publish/unpublish copies or approve media. The private form retains the saved value and explains that indexing covers details deliberately made public and that previously collected copies cannot be recalled.

## Page metadata

Public home, category and owned-copy routes generate metadata through a separate canonical-only repository/service contract. It never selects copy serials, notes, locations, defects, condition, accounts, audit history, provider snapshots or storage metadata, even when those fields are permitted in the detail body. Only published copies in the correct category contribute item titles/descriptions. Site identity is read only while the collection is enabled. Metadata normalizes whitespace and bounds display strings without changing stored manual values.

Enabled, index-permitted base home/category/detail URLs receive `index, follow`. Search and parameterized URLs receive `noindex, nofollow`; search/filter values never become metadata text or canonical query strings. Valid filtered category pages canonicalize to their base category. Invalid/private/wrong-category/disabled metadata is generic, with no item title, image or canonical URL. Database failures likewise produce generic noindex page metadata. Private application/login routes retain the root noindex default.

Absolute URLs use the existing validated `BETTER_AUTH_URL` origin, independently of OAuth provider availability. Request Host/forwarding headers cannot select canonical or sitemap hosts. An absent/invalid configured origin suppresses canonical URLs, indexing, sitemap entries and SEO images rather than inventing an origin.

Metadata is resolved in the head before page content streams, using `htmlLimitedBots: /.*/`. This deliberately adds metadata-read latency in exchange for a complete initial head for every crawler and browser. [Next.js documents the blocking metadata setting and its performance tradeoff](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots).

## Crawling and sitemaps

Dynamic handlers serve `/robots.txt`, `/sitemap.xml` and `/sitemap.xml?part=[part]`. They use current policy and `Cache-Control: no-store` for GET/HEAD, failures and unsupported-method responses. Custom handlers preserve explicit generic 503 responses on policy/database failure instead of returning a fabricated successful empty collection. Missing/disabled/indexing-off policy produces no sitemap entries or sitemap advertisement.

Crawler rules disallow the general application surface while permitting public collection HTML and static framework resources. Public HTML remains crawlable when indexing is off so crawlers can observe the current `noindex` directive. SEO image crawling and sitemap advertising are allowed only when publication and indexing are both enabled with a trusted origin. Robots directives do not grant access. Blocking HTML crawling would prevent Google from reading its noindex rules; see [Google's robots metadata guidance](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag).

The sitemap index lists `/sitemap.xml?part=pages` plus only UUID-prefix maps reached from currently published copies. The `pages` partition includes the base home and three categories. Each of the 256 possible two-hex-digit UUID prefixes has a bounded query over the UUID range, ordered by owned identity, selecting only `id` and `type`. All maps stay at the site root so they can describe `/collection` URLs under the protocol’s directory-scope rules. Each map admits at most 50,000 entries; overflow returns generic 503 rather than silently dropping copies. XML is escaped and capped at 50 MiB. These follow the [sitemap protocol limits](https://www.sitemaps.org/protocol.html). There is no offset paging, unowned catalog directory, private count, invented last-modified timestamp or sitemap entry for searches/filters. Separate published copies of one release keep separate URLs.

## OpenGraph images

Public item metadata may advertise a canonical image only while indexing is enabled. Eligible canonical uses retain model/release/variant and platform/game/family precedence, with included-component candidates in their existing scope. Personal photos are deliberately excluded from SEO imagery even when permitted in the detail gallery. Metadata image labels come from canonical identity, not use captions, alternative text or personal observations. OpenGraph/Twitter output never includes source filenames, hashes, provenance URLs or private delivery URLs.

The dedicated `/api/media/public/seo/[itemId]/[useId]` endpoint requires current global enablement, indexing permission, a trusted origin, the published copy and its actual canonical image use. It then applies the existing exact pinned DISPLAY, content-review, MIME/scope and recursive current-input-rights gates. It serves the reviewed output without generating a crop/poster or discovering sibling derivatives. GET/HEAD/range/conditional requests all reauthorize before lengths or bytes. Success is no-store with `X-Robots-Tag: index, follow`; denials/errors retain noindex and generic 404/503. Rights, approval, item or indexing withdrawal immediately denies subsequent requests. Normal gallery/model/presentation/search endpoints retain noindex, and the existing optimizer restriction prevents cached optimizer access to revocable media.

## Verification and boundaries

Each SEO operation uses a short read-only Repeatable Read public-policy snapshot. Metadata and page content have their own admitted reads; no policy-dependent result is shared across requests. A previously admitted response, search result or externally saved image cannot be recalled. Changing settings controls subsequent application output and crawler instructions, not a search engine's removal schedule.

Tests use disposable PostgreSQL and MinIO. Coverage includes policy combinations, indexing without publication changes, metadata field selection, permitted personal-body fields excluded from metadata, personal gallery imagery excluded from OpenGraph, private/wrong-category IDs, bounded sitemap overflow, independent copy URLs, trusted origins, every visitor role, initial head metadata, sitemap/HEAD/method caching, exact image/range/conditional admission, rights/indexing/publication withdrawal and unavailable-database output. No dependency, migration, personal database/publication change or preview generator is added. The complete adversarial privacy review remains Task 18.7.

Focused commands:

```sh
pnpm exec vitest run --maxWorkers=1
pnpm test:integration tests/integration/public-collection.test.ts
pnpm test:e2e:access public-seo.spec.ts public-home.spec.ts public-browse.spec.ts public-detail.spec.ts
pnpm test:e2e foundation.spec.ts --workers=1
pnpm lint
pnpm typecheck
pnpm format:check
```
