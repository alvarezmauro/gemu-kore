# GemuKore — UI Architecture Review

Task: **2.4** · Reviewed: **2026-10-04** · Scope: the implemented foundation through Tasks 2.1–2.3.

## 1. Verdict

The current UI architecture is sound for a hobby project. Keep the existing Server Component pages and shell, small interactive client boundaries, owned shadcn primitives, selective Magic UI enhancement and bounded Motion patterns. A second component system, generic UI framework, global interaction store or route-transition engine would add complexity without solving a current problem.

No Critical or High findings were identified in this foundation. Two Medium findings and one Low finding were corrected in this task. The fixes preserve the current design and preview behavior. No dependencies, schema changes, product routes or authentication features were added.

This is a review of the temporary design preview and its reusable UI. It does not certify future authorization, public-data delivery, CRUD, asset processing or 3D behavior; those systems have not been implemented.

## 2. Method and evidence

Reviewed `AGENTS.md`, the UI/server/performance/accessibility requirements in `PROJECT_SPEC.md`, Task 2.4 in `DEVELOPMENT_PLAN.md`, `DESIGN.md`, the accepted repository architecture, UI source, import rules and existing tests. Inspected direct and transitive component imports, server-only infrastructure, prop boundaries, state ownership and animation fallbacks.

Used the Docker development preview at `localhost:3002` to reproduce a compact-to-desktop navigation failure and clipped card metadata at 320px. Then verified the fixes in production-build desktop/mobile Chromium tests and inspected the development UI in both themes. Synthetic long text was injected into rendered presentation elements for the stress check; no catalog fixtures or personal data were written.

## 3. Findings and corrections

### UI-01 — Medium: mobile modal survives the desktop breakpoint

**Location:** `src/components/layout/mobile-navigation.tsx:26` and `:49`; shell visibility in `src/components/layout/application-shell.tsx`.

**Problem:** the mobile trigger was hidden at the `lg` breakpoint, but controlled Sheet state remained open. Opening navigation at 640px and expanding to desktop left the modal portal and focus trap active, while the desktop sidebar was rendered behind it. The body still had `pointer-events: none`. Closing could attempt to restore focus to the now-hidden trigger.

**Impact:** resizing, zoom changes and larger tablet windows could leave desktop navigation blocked and keyboard focus poorly placed.

**Recommended correction / implemented:** subscribe to the matching 64rem media query while the sheet is open and close when desktop navigation becomes available. On desktop close, override Radix's trigger restoration and focus the existing `main-content` landmark. Ordinary compact-screen dismissal still restores the trigger. Clean up the media-query listener after closing.

**Evidence after correction:** crossing 640px → 1024px removes the sheet, restores body pointer events and focuses main content. The theme menu works immediately. Returning to compact width leaves the sheet closed, and reopening/Escape restores its trigger. Covered on both Playwright projects with normal motion enabled, including the real exit animation.

### UI-02 — Medium: card metadata can be silently clipped

**Location:** `src/components/ui/object-card.tsx:16`, identity at `:23`, copy metadata at `:28`.

**Problem:** headings had global long-word wrapping, but identity text and definition terms did not. The underlying Card deliberately clips overflow for its rounded media stage. A long unbroken identity at 320px produced a 2220px text scroll width inside a 240px text area, while document width still remained 320px.

**Impact:** the existing page-overflow assertion could pass while release/model identity or copy metadata was unreadable. This matters before real catalog and user-entered display values arrive.

**Recommended correction / implemented:** allow `ObjectCard` to shrink in its grid and inherit `overflow-wrap: anywhere` for its textual content. Preserve the media stage, typography and full text; do not truncate identity or reduce its font size.

**Evidence after correction:** the same identity fits a 240px area without internal clipping, and the card's scroll width equals its 288px width. The added 320px stress test checks title, identity, definition term and value, plus the card and document, in Light and Dark on both browser projects.

### UI-03 — Low: shared presentation import restrictions were incomplete

**Location:** `eslint.config.mjs:20` and `:45`.

**Problem:** the existing rule prohibited direct database/repository imports from pages and components, but did not cover `src/lib/` or prevent shared components from importing server configuration/services and feature modules. No current forbidden import was found. This was a missing enforcement layer for the dependency rules already accepted in Task 0.3.

**Impact:** future shared UI changes could acquire server or feature coupling without lint feedback, even when a particular import happened to remain valid in a Server Component. The framework's server-only guard prevents browser imports of marked server modules, but does not enforce all shared-presentation ownership rules.

**Recommended correction / implemented:** shared components and presentation helpers reject server infrastructure, feature-module imports and database packages. Page entry points retain permission to invoke the planned service/feature boundaries while direct database/repository imports remain prohibited. Broaden the Prisma pattern to cover nested package paths and include database/repository root aliases.

**Evidence after correction:** eight ESLint API probes confirm rejection of server configuration, relative database imports, library-to-server imports, feature queries, nested Prisma imports and the database root alias; allowed presentation-helper and page-to-service imports remain allowed. Full repository lint passes.

These are direct-import guards, not a proof of every future transitive dependency or public/private projection. Continue using `server-only` and reviewing feature import graphs as those modules are introduced.

## 4. Client/server boundaries

| Area                                    | Assessment and retained boundary                                                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Root layout and page                    | Remain Server Components. Local fonts, metadata, static sections and safe display values are prepared on the server. No React UI module queries Prisma or contains collection business logic.                                                                                  |
| Application shell                       | Server-rendered sidebar/header/main composition. Navigation items crossing into the mobile component are serializable labels, paths, icon keys and current flags; icon component functions are not passed from the server.                                                     |
| Theme provider/menu                     | Client behavior is justified by system preference, browser persistence and menu interaction. Passing server-rendered children through the provider does not turn the entire page into client code. Hydration suppression remains limited to the theme-managed html attributes. |
| Navigation                              | The module has no client directive. Desktop use can stay server-rendered; importing it from `MobileNavigation` also puts that use in the client module graph. The callback is created inside the mobile boundary. No duplicate navigation implementation is needed.            |
| Cards, containers, headers and feedback | Presentation-only, server-compatible modules. A client demo importing a static helper brings that helper into its client graph; absence of a directive is not a guarantee that every use is server-only. Keep future data loading in entry containers.                         |
| Form preview                            | Its client boundary is justified by React Hook Form, browser feedback and reset. Its Zod rules describe an unsaved demonstration, not collection policy. Future writes need separate server validation and authorization.                                                      |
| Radix primitives                        | Dialog, Sheet, Dropdown Menu and Label retain the client behavior supplied by the primitive. Removing their directives or replacing functional primitives simply to reduce the count of Client Components is not justified.                                                    |
| Custom motion                           | Client boundaries are limited to animation hooks and interactive examples. `PageEntry` and `CollectionCardMotion` remain ordinary server-compatible wrappers with CSS effects.                                                                                                 |

There is no justified broad client/server refactor at this stage. The existing import structure, server-only infrastructure and production build support the chosen boundaries.

## 5. Magic UI and Motion

Magic UI is used selectively through the owned Blur Fade source. Its server HTML is visible, its delay/travel/blur are bounded, and in-view observation schedules an optional effect rather than gating readability. The local adaptation is justified because wrapping an upstream hidden child would not by itself repair that child's server HTML. Preserve the documented static/reduced-motion behavior when updating registry source; do not create separate page-specific variants.

CSS handles small entrances, hover and Radix surface transitions. Direct Motion is reserved for retained list positions and shared card/detail media. Stable item keys, scoped layout identities, a stationary fixed portal root and immediate DOM list updates are appropriate. The detail example retains Radix labeling, focus management and Escape behavior.

`MotionConfig reducedMotion="user"` remains a baseline. The explicit preference subscription and CSS media queries cover effects that this setting alone does not disable, including blur. Reduced-motion content, live preference changes and no-JavaScript readability already have browser/component coverage.

Keep the current composition contract for shared details: `DialogContent asChild showCloseButton={false}` contains one `SharedLayoutRoot`, with its explicit close button inside. Radix composition requires a single target element; do not enable a generated sibling close button for that composition. The current caller follows this contract. A more elaborate generic dialog/animation abstraction is not warranted by one use.

The root theme wrapper imports MotionConfig, which is a global client dependency. The current sole preview route already demonstrates Motion, so splitting this provider has no demonstrated benefit here. Revisit scoping only if future static routes show a material bundle cost. Do not eagerly import 3D, add universal shared-layout state or implement cross-route animation in this task.

## 6. Mobile and design-system consistency

The 248px desktop sidebar, compact header and accessible navigation sheet follow the accepted design. Navigation controls, ordinary buttons and icon close controls use at least 44px targets. Forms retain 16px input text. Dialogs have bounded viewport dimensions and scrolling; regular grids remain responsive rather than forcing small cards.

The palette, semantic colors, local typography, rounded panels and restrained animation remain consistent in Light/Dark/System. Catalog identity and **My copy** stay visually separate; box presence does not imply completeness. Placeholders do not invent saved data or 3D capability. Collection artwork remains the intended source of visual interest.

UI-01 closes the responsive state gap. UI-02 improves long-text resilience without changing the visual direction. Existing keyboard, compact navigation, 320px overflow, effective 200% zoom layout, theme and dialog checks continue to pass.

This review does not claim a full screen-reader audit, real browser zoom audit, Safari/Firefox coverage or low-end-device performance measurement. Those remain meaningful checks as actual feature flows are built. No heavy effects or multiple 3D scenes exist in the current UI.

## 7. Recommended architecture and next-step rules

Retain the current structure:

- Server pages and entry containers prepare safe presentation data and render the shared shell.
- Feature components own their feature interactions; shared `components/` modules accept display values and do not load domain data.
- shadcn/Radix owns functional controls, focus and accessibility behavior.
- Magic UI provides occasional presentation enhancement; CSS handles simple feedback; Motion handles the custom interactions that justify it.
- Timing lives in `lib/motion/tokens.ts`, preference handling in its small client hook, and theme/style roles in `app/globals.css`.
- Interactive state stays local to the relevant form, menu, sheet or preview. No global collection state, animation orchestration framework or additional UI library is needed.

Alternatives considered: making the whole shell a Client Component would increase hydration work without helping data loading; implementing separate mobile navigation would duplicate behavior; hiding the sheet with CSS would leave modal state and focus management active; truncating identities would discard useful information; generalized animated dialogs or cross-route interception would solve future problems prematurely. The corrections use the existing architecture instead.

For subsequent tasks, keep authentication and permissions server-side, preserve the canonical/owned distinction in presentation props, use narrow public projections before public UI exists, and load heavy viewers only on demand. Task 2.4 does not introduce these systems.

## 8. Validation and completion

Passed on 2026-10-04:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`: **11 unit/component tests**
- `pnpm test:integration`: **3 isolated PostgreSQL tests**
- `pnpm test:e2e`: **28 desktop/mobile Chromium tests**, including the production build
- `pnpm format:check`
- `git diff --check`
- Eight import-boundary probes and development-browser reproduction/verification

The automated suite totals **42 tests**. Integration tests use a disposable database and browser tests do not use personal collection data. Two new browser scenarios run on both existing projects; no implementation-mirroring unit tests were added for the small CSS/state corrections.

All actionable findings in this review are resolved. Task 2.4 is complete. The next executable task is **3.1 — Auth Architecture Review**, when requested.

## 9. References

Project decisions take precedence over generic examples. The boundary assessment follows the official [Next.js Server and Client Components guidance](https://nextjs.org/docs/app/getting-started/server-and-client-components). The shared dialog composition follows [Radix composition](https://www.radix-ui.com/primitives/docs/guides/composition) and [Slot](https://www.radix-ui.com/primitives/docs/utilities/slot). Existing implementation guidance remains in [the design-system guide](../operations/DESIGN_SYSTEM.md) and [animation strategy](../operations/ANIMATION_STRATEGY.md).
