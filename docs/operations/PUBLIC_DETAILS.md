# Public copy details and contextual media

Task 18.5 adds `/collection/consoles/[id]`, `/collection/games/[id]` and `/collection/accessories/[id]`. IDs identify owned copies. Home/browse titles link to these pages; duplicate copies retain separate URLs. Pages use the public service directly, with the same published-only projection for anonymous visitors and all signed-in roles. Catalog facts, expected edition contents and estimates are distinct from optional copy observations. Hidden personal fields are absent from HTML and Flight. Invalid/private/wrong-category IDs and paused collections return the same generic not-found page. Unavailable databases show generic recovery text with a retry link.

## Reading and presentation

Server-rendered details, navigation and approved static images work without JavaScript. Neutral stages preserve text when images are absent or fail. Public pages use warm semantic surfaces, contained images, wrapping titles, light/dark themes and 320px layouts. The existing viewer loads its runtime and resources only after activation. Reduced motion disables automatic rotation; close, camera controls, keyboard interaction and mobile orbit retain the shared behavior. No private management links, downloads, provider metadata, audit history or account information enter public detail props.

Catalog/gallery media resolves independently of personal settings. Personal photos/custom models additionally require `showPersonalPhotos`. Independently approved personal candidates precede approved canonical model/release/variant candidates and then platform/game/family fallbacks. SERIAL uses are always denied. Images have reviewed captions/alternative text and contextual URLs; no sibling thumbnail discovery or framework image optimizer is used. Optimizer local patterns allow only static `/brand/` files, so direct optimizer requests cannot cache revocable media either. Browse/home cards retain neutral media stages; photos are displayed on detail pages.

## Delivery contracts

| Route                                                                  | Context                                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/media/public/items/[itemId]/[useKind]/[useId]`                   | Published item plus its exact `personal` or `catalog` use, resolved through the actual canonical relationship.                                            |
| `/api/media/public/components/[itemId]/[componentId]/[slotKey]`        | Published game copy, its selected approved component/template revision, and exact geometry or named texture slot.                                         |
| `/api/media/public/site/[useId]`                                       | Enabled collection and approved COLLECTION_LOGO application use. The site endpoint does not depend on a copy or the personal-photo flag.                  |
| `/api/collection/public/[itemId]/presentation?component=[componentId]` | Fresh public-only whole-model or component descriptor on activation. `component` is optional. No audience, private-mode or arbitrary resource parameters. |

Every delivery rechecks current policy, publication, relationship, approval/time, exact pinned DISPLAY output, READY state, supported MIME/kind/scope, content review and current rights. Source ORIGINAL files may contribute to lineage while remaining private. They never become downloadable public outputs. Lineage traversal is bounded to 128 unique nodes and depth 16, detects cycles/missing inputs and denies unsupported graphs. Output image bounds are 20 MiB/12,000px per edge; whole models retain the existing 8 MiB interactive limit. PNG/JPEG/WebP images and validated GLB models are supported.

Only eligible uses contribute to the detail gallery, capped at 24 images with an eligible-only overflow hint. Each scope scans at most 1,000 approved candidates in stable primary/order/UUID order; entries outside this bound are not advertised or delivered. Public component lists show up to 12 eligible previews from at most 101 approved components. No private-media total or unapproved slot is exposed.

GET, HEAD, range and conditional requests all pass admission before storage details or bytes. Single valid ranges get 206; malformed admitted ranges get 416. Denied contexts get generic 404 before range validation. Errors are no-store and omit storage diagnostics. Conditional headers do not produce cached 304 responses. Successful bodies stream through the existing storage adapter, with abort/cancellation handling and byte/MIME checks; no storage redirect or signed URL is exposed. Proxy coverage also applies no-store to unsupported-method responses. Public indexing remains disabled pending Task 18.6.

## Administrator review

Selecting a copy under `/app/settings/public` now shows prepared media choices and assigned component review controls. Media approval requires a current ADMIN, same-origin action, an exact reviewed output/labels, an explicit acknowledgement of sanitized content and public-use rights for every source, and a fresh server-computed review digest. Input cannot supply an approver or overwrite publication settings. Inspect models and their embedded artwork before acknowledging the review; this is a curator content decision, not an automated privacy scan.

Media approval pins the prepared DISPLAY file and records actor/time. It approves current source rights without marking ORIGINAL bytes publicly safe. Personal-media approval/withdrawal returns the copy to PRIVATE for re-review. Unchanged media approval is a no-op. Changing a caption/use/pointer clears approval through the existing database guard. Withdrawing approval clears the public pointer so revoked output rights cannot prevent withdrawal. Review digests now include asset/use changes, so a pending copy/settings review cannot overlook media approval edits. Widening `showPersonalPhotos` retains the existing atomic affected-copy invalidation. Search indexing remains unavailable in these controls.

Component approval has persisted review time, reviewer and exact template revision. The migration clears legacy approvals and replaces the private-only constraint. Binding/content/template changes clear dependent approvals. Current ADMIN review validates template readiness, supported renderer contract, every required image, geometry, transforms, dimensions, camera and budgets. Original base geometry is denied publicly: deliberately import/assign an eligible DISPLAY GLB to a new draft template and review it. Existing READY templates remain immutable. Missing optional artwork stays neutral; ineligible required artwork or stale review suppresses the representation and direct resource requests. Catalog 3D describes expected components, not owned presence or condition.

Existing services support `reviewMediaUse`/`saveMediaUse` for personal, catalog and site uses and `reviewComponentUse`/`saveComponentUse` for component presentations. Copy review UI offers attached prepared media and components; it does not add a general asset importer, logo editor, preview generator, worker or new renderer. External trailers/uploaded videos are withheld by this implementation; no external URL or iframe is serialized publicly. Personal defaults and existing publication decisions are unchanged.

## Migration and verification

`20261021100000_public_component_reviews` adds component review metadata, approval invalidation triggers and explicit DISPLAY geometry support. Apply migrations with the normal deployment workflow before using the new services. Verification uses disposable PostgreSQL and MinIO; the personal development database and collection publication state are not changed by tests.

Focused commands:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration tests/integration/public-collection.test.ts tests/integration/packaging.test.ts
pnpm test:e2e:access public-detail.spec.ts public-browse.spec.ts public-home.spec.ts
```

Coverage includes public HTML/Flight for every role, no-JavaScript reading, wrong/private IDs, exact use versus asset/sibling IDs, settings/rights/publication revocation, HEAD/range/conditional denial, stale/unauthorized reviews, required-slot and component binding resets, on-demand whole/procedural 3D, image failure, mobile/dark layouts and existing publication/query regressions. The broader adversarial privacy review remains Task 18.7. An admitted response already in flight, loaded viewer or previously downloaded bytes cannot be recalled; subsequent requests re-evaluate the current snapshot.
