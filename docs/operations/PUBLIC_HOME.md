# Public collection home

Task 18.3 introduces `/collection` and consistently redirects `/` there. `/app` remains the private dashboard. The static foundation examples moved to `/design-preview`; they contain illustrative data and are not the public collection.

The home reads the existing public home service, without loading a session or accepting an audience override. It shows the configured name/description, published-only counts and up to eight recent approved owned copies. A disabled or missing policy shows only the fixed private message and static branding. A database failure shows generic unavailable text and a retry link; Next page rendering does not provide a custom 503 status here. Empty published collections show real zero counts and an empty exhibit.

Public category/detail destinations are deliberately absent until Tasks 18.4/18.5. The home uses an in-page exhibit link and noninteractive display cards. Neutral, labelled photo placeholders never request private images. No viewer, model, trailer, personal photo or catalog artwork is delivered by this step.

## Administrator workflow

Administrators open **Public collection** from the private dashboard, or visit `/app/settings/public`. Editors, viewers and anonymous requests cannot open this management page. Current server-side authorization is repeated for every review and write.

1. Choose visibility settings, then select **Review settings**. The review shows the public name/description, whether the collection will open, and how many approved copies will return to private if personal-field visibility expands.
2. Explicitly acknowledge the review, then save. Widening personal-field visibility atomically removes affected approvals. Pausing the entire collection preserves individual approvals; reopening it requires a fresh review.
3. Search owned copies by name/platform and choose **Review copy**. Search results use the existing private search service with a twenty-copy page limit and bounded offsets. The selection is private and distinguishes duplicate copies by UUID.
4. Review the labelled public text projection. Select **Review publication**, acknowledge the fresh preview, and approve the copy. Published copies offer the corresponding removal review.

The text preview includes all fields allowed by current visibility policy, including optional serial/location/note/defect fields, so it also covers what subsequent public detail pages may show. The current public home displays the card summary. No media approval is implied. Personal photos and indexing are unavailable in these controls; the server action rejects attempts to enable either capability. Public metadata remains noindex/nofollow.

Reviews are bound to current copy/settings revisions and the existing publication digest. Changes to reviewed content, policy or current access make saving fail with a generic actionable message. The administrator reloads and reviews again; a failed save does not silently refresh or approve changed content. JavaScript is required for private review/save controls; without it an explicit message explains that no changes were made. Public exhibit text, counts, links and empty/private states are complete without JavaScript.

## Response and presentation policy

The request proxy applies `Cache-Control: no-store` to `/`, `/collection` and all public descendants, including HEAD, Flight and generic not-found responses. Private publication settings use `private, no-store`. It does not inspect authentication. Pages are dynamic and do not use shared response caching, persistent memoization or ISR. Root metadata remains generic and configured collection details are not used in disabled/error metadata.

The public shell has no private navigation or role-dependent controls. The warm editorial layout uses the existing Magic UI Blur Fade, Number Ticker and Bento components. All values exist in server HTML; motion is finite and responds to live reduced-motion changes. Theme selection reuses the established theme provider. No dependency or migration was added.

## Verification

`tests/access-e2e/public-home.spec.ts` exercises production HTML and Flight privacy, cookie-independent views, redirects/HEAD/not-found cache policy, pause/reopen and empty states, widening-impact invalidation, individual approval/removal, stale reviews, revoked administrators, no-JavaScript public rendering, themes, reduced motion, long titles, 320px layouts and enlarged text. It runs through `pnpm test:e2e:access public-home.spec.ts` against disposable PostgreSQL/MinIO and test-only TLS.

Action unit tests cover origin checks, unsupported capabilities, server-created identities, explicit review acknowledgement and sanitized errors. Public component tests cover complete static output, honest empty/private states and absence of premature detail/media links. Existing publication integration tests exercise the transaction and policy contracts. The foundation browser suite retains the design/theme/motion checks at their new preview address and verifies the generic public failure state using an intentionally unreachable test database.

Verified on 2026-10-21: lint, typecheck, production builds, formatting, documentation links and whitespace; 1,321 unit/component tests; twenty publication integration tests; ninety distinct desktop/mobile browser checks (ten public home/review, thirty-four access/dashboard, forty-six foundation/auth/theme/motion), plus a focused rerun of the final anchored review flow on both devices. Light/dark public and administrator review screenshots were inspected. No personal database migration or publication change was performed.

See [public query operations](PUBLIC_QUERIES.md) and the [public privacy architecture](../architecture/PUBLIC_PRIVACY_ARCHITECTURE.md) for the underlying publication boundaries and later task responsibilities.
