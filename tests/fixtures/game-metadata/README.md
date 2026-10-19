# Game metadata fixtures

These files contain invented data for offline provider regressions. They are not captured IGDB responses, verified catalog mappings, production credentials or evidence of live provider availability. The game, company and platform labels are fictional; numeric reference IDs deliberately differ from deprecated enum values.

| File                 | Purpose                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `igdb-game.json`     | Task 12.2's complete game example: identity, platform, partial release date, company roles, media and three distinct rating kinds.                                                                                       |
| `mapping-cases.json` | Named inputs and explicit expected results for original/port/remake/remaster/compilation identities, calendar precision, unknown/deprecated mappings, commercial markets, rating scales and sampled duration conversion. |
| `http-cases.json`    | Named HTTP failures, invalid token envelopes and Retry-After inputs, with expected codes, retry counts or delays.                                                                                                        |

`src/server/providers/game-metadata/igdb-mapping.test.ts` applies fixture fragments to a cloned base record, then asserts normalized facts, source links and scope. Additional structural cases cover mismatched IDs, duplicate observations, company roles, incomplete arrays, malformed media, source URLs/timestamps, privacy, evidence integrity and output limits. Oversized inputs are generated locally in the test rather than committed as large files.

`src/server/providers/game-metadata/igdb-adversarial.test.ts` invokes the public search/fetch interface with an injected scripted transport. Every expected request has a fixed endpoint and response, and each case checks the total request count. The suite forbids real global fetch calls. It covers sanitized failures, retries/cooldowns, token validation, optional-endpoint failures, cancellation, query/cursor validation, redirects and actual streamed byte limits. The exact-size response test includes a deliberately false Content-Length; it verifies the received-byte boundary independently of that header.

The baseline `igdb.test.ts` retains token lifecycle, shared-acquisition cancellation, in-flight scheduling and deadline checks. Array-valued test-table inputs are wrapped in objects so the test runner passes the entire response envelope rather than spreading it across callback arguments.

Run the provider suites with:

```sh
pnpm exec vitest run src/server/providers/game-metadata --maxWorkers=2
```

When adding cases, record the expected product semantics rather than deriving the expected value with the same transformation as the implementation. Preserve unknown values, broad-versus-release evidence and separate rating/playtime groups. Use `null` for unknown JSON values; nonfinite numeric values, stream behavior, limits and cancellation belong in TypeScript cases. Never insert real tokens, personal collection data, local UUIDs or an unreviewed dump of provider responses.

Task 12.3 changes tests, fixtures and documentation only. It does not change provider architecture, runtime contracts, configuration, catalog data or the future enrichment workflow.
