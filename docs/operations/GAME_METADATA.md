# Game metadata provider

Task **12.2 — IGDB Integration** implements the server-only provider described in the [provider architecture](../architecture/GAME_METADATA_PROVIDER_ARCHITECTURE.md). It searches IGDB and retrieves normalized, sourced evidence for a selected game. It does not change catalog records. Candidate selection, review, accepted mappings, run history and enrichment controls arrive in Phase 13.

## Configuration

Set both `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` for a Twitch confidential application in the server environment. The empty entries in `.env.example` disable lookup. Keep the existing private `.env.local`; never commit credentials or put them in `NEXT_PUBLIC_*` variables. Token requests use a form body, and tokens remain in server memory.

Provider configuration is validated when `getGameMetadataProvider()` is first called. Missing credentials produce a disabled provider with a typed `NOT_CONFIGURED` result. Incomplete/invalid pairs throw a configuration error containing field names only. This optional capability does not participate in startup validation: manual creation and existing routes remain available even if the integration is absent or misconfigured. Restart the server after credential changes; the process reuses its provider instance and token cache.

The setup and endpoint contracts follow the [official IGDB documentation](https://api-docs.igdb.com/) and [Twitch client-credentials flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow). No live account or API credentials were used for implementation verification.

## Server use

`src/server/providers/game-metadata/index.ts` is the explicit composition point. A future authorized application service uses `GameMetadataProvider` and its neutral contracts. The adapter itself is a trusted server capability, not an authorization endpoint. There is deliberately no new route, server action or UI in Task 12.2.

Illustrative service-level use after the service has checked the current actor and allowed public-catalog terms:

```ts
const provider = getGameMetadataProvider();
const result = await provider.search(
  { query: "Chrono Trigger", limit: 10 },
  { signal, deadlineAt: performance.now() + 30_000 },
);
```

The deadline uses the process monotonic clock, not `Date.now()`. Cancellation covers scheduling, token acquisition, HTTP headers and response-body reading. Search accepts optional external PLATFORM and year filters plus a cursor. Fetch takes the chosen external GAME reference; it never takes a local GameRelease ID or an arbitrary URL. Both return a discriminated success/error result. Operational errors expose only stable codes, retryability and an optional retry interval.

A valid search can return no candidates. Fetching a missing game returns `NOT_FOUND`. Search cursors bind the normalized query, platform, year, page size and offset, with an offset ceiling of 1,000. A full last page can provide a cursor whose following page is empty; no total count or exhaustive coverage is promised. The adapter never follows pages or related games automatically.

## Returned evidence

Each result has schema/mapping versions, retrieval time, bounded diagnostics and source evidence. External IDs remain provider/object-type/string triples; cover 12 and screenshot 12 are different identities. Runtime schemas validate normalized output, evidence links, release-observation scope and the 512 KiB output ceiling. Provider records never become local UUIDs or catalog mutation commands.

| Section              | Behavior                                                                                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search identity      | Title, aliases, neutral game classification, related parent/version references, platform evidence, description excerpt and a conservative broad first-release year. Ordering does not imply verified identity or confidence.                                                                                                      |
| Release observations | Platform, commercial market, release status and valid day/month/year/quarter precision. Current reference labels determine mappings; deprecated numeric codes do not. Unknown labels retain unknown values. A provider observation cannot establish a physical edition or printing.                                               |
| Companies            | Separate evidenced developer, publisher, port-developer and supporting roles. IGDB involved-company information remains broad GAME evidence; it does not establish a specific physical release's credit.                                                                                                                          |
| Images               | Cover, screenshot and artwork candidates using constructed HTTPS CDN locators from validated image IDs. Source URLs are never fetched. All rights remain UNKNOWN, and nothing is uploaded, attached, displayed or published automatically.                                                                                        |
| Videos               | Structured validated YouTube IDs, optionally titled, at GAME scope. No arbitrary HTML or player configuration.                                                                                                                                                                                                                    |
| Ratings              | Community, critic and combined scores stay separate, on the adapter's declared 0–100 scale, with optional sample counts. They are not personal scores or age certifications; no group is selected automatically.                                                                                                                  |
| Playtime             | Positive sampled provider estimates convert seconds to nearest integer minutes, with a minimum of one minute for positive subminute estimates. Main, extras and completionist categories stay distinct; original seconds remain in evidence. Missing values stay null and ambiguous zero values are not treated as measured zero. |

Sections distinguish present, absent, unsupported, invalid and limited evidence. Invalid optional facts produce bounded diagnostics while retaining usable fields. A failed optional playtime endpoint is marked unsupported with an unavailable-section diagnostic; it does not erase successfully fetched game evidence. Cancellation, deadline expiry and credential failures still fail the whole operation. No missing section means “delete the current catalog value.”

Search limits each candidate to 10 platforms and a 500-character excerpt. Full retrieval caps platforms/releases at 30, company credits at 60, images at 20, videos at 5 and rating groups at 3, with at most 50 diagnostics. Over-limit or partly invalid arrays are marked limited. Invalid core identities, wrong selected-game IDs, oversized bodies and malformed root responses fail closed.

## Network behavior

Requests go only to the fixed HTTPS Twitch token endpoint and IGDB v4 games/time-to-beat endpoints, with selected expanded fields. Authenticated requests reject redirects. Query literals are escaped, filter IDs validated and endpoint/field names compiled into the adapter. Credentials never enter URLs, normalized evidence or returned errors. No logging of payloads or query strings is introduced.

Each operation has a maximum 30-second deadline and 8-second HTTP attempts. It permits at most six data attempts and two token acquisitions, eight total, including retries. Transient data failures receive at most one retry; a 401 may reacquire credentials once. Long Retry-After intervals return a typed failure instead of holding the request. The data scheduler spaces starts by 500 ms, permits at most two in flight and shares cooldowns within its provider instance. Shared token acquisition lets individual callers cancel independently and aborts when its last waiter leaves.

Actual streamed/decompressed response bytes are bounded at 2 MiB for data and 64 KiB for tokens, including absent or false Content-Length declarations. Media bytes are never downloaded here. Future ingestion must separately enforce storage/content validation, destination safety, rights review and private delivery.

The scheduler and token cache are process-local. Multiple replicas or other tools sharing credentials can exceed aggregate provider quotas; upstream 429 handling remains necessary. There is no distributed quota guarantee, Redis, worker, persistent queue, shared result cache or background fetching. No request occurs on module import, construction, build or startup.

## Verification and next task

The fixture at `tests/fixtures/game-metadata/igdb-game.json` is invented test data with deliberately non-enum numeric reference IDs; it is not a captured live response or a verified real game/platform/company mapping. Adapter tests exercise complete/empty search, full retrieval, partial evidence, pagination, escaped queries, scopes, token lifecycle, concurrent callers, cancellation, deadlines, throttling, transient errors and streamed-body rejection. ESLint tests enforce server-only and service/provider boundaries. Browser smoke tests explicitly clear metadata credentials.

Run the relevant checks from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test --maxWorkers=2
pnpm exec playwright test tests/e2e/foundation.spec.ts tests/e2e/auth.spec.ts --workers=2
```

The browser runner builds the production application with isolated unavailable database credentials. It checks startup, public liveness, sign-in and private redirects on desktop/mobile Chromium; it does not claim authenticated enrichment coverage. No schema or repository behavior changes, so database integration tests are not a new provider verification mechanism in this task. No live API reliability, production quota capacity or asset usage rights are asserted by fixtures.

## Task 12.3 — Mapping and adversarial coverage

Task 12.3 adds 181 regressions using the [fixture guide](../../tests/fixtures/game-metadata/README.md), bringing the three provider suites to 222 cases. The mapping cases cover identity relationships, date precision/calendar validity, current and deprecated references, commercial markets, company scope, incomplete arrays, malformed media, separate ratings, sampled durations, provenance, privacy and normalized-output bounds. Scripted adapter cases cover token failures, retry intervals/cooldowns, refresh/retry limits, optional-endpoint failures, cancellation, private/unexpected inputs, quoted Unicode search, forged cursors, redirects, response shapes and received-byte limits.

The existing malformed-response table now wraps array payloads so the test runner passes each complete envelope to the adapter. The new transport suite forbids global fetch and asserts every scripted endpoint and request count. No live API access or credentials are required.

Verification for Task 12.3: lint, typecheck, changed-file formatting and all **1,080 unit/component tests** across 61 files pass. The strengthened output-budget case also passes on recheck with its original evidence links preserved. This task changes tests, fixtures and documentation only; provider architecture and runtime files remain unchanged. Production builds, database and browser suites were not rerun for these test-only additions; the Task 12.2 browser/build verification remains historical.

Run only the provider regression suites with:

```sh
pnpm exec vitest run src/server/providers/game-metadata --maxWorkers=2
```

Next: **13.1 — Enrichment Architecture**. User-facing review and acceptance remain in their assigned Phase 13 tasks.
