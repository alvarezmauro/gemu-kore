# Accessibility audit — Task 20.1

Audit date: 2026-10-22. Requirements: `PROJECT_SPEC.md` sections 120–121 and `DESIGN.md`. This task reviews the current interface; the separate mobile workflow review remains Task 20.2.

## Method and scope

The production browser harness runs eleven journeys on desktop and mobile Chromium, for **22 checks**. The journeys combine keyboard interaction, focus assertions, theme changes, rendered semantic checks and axe scans. Every scanned state runs in light and dark themes with the default axe rules, including best practices. No rule or element is excluded and no violation baseline is accepted. Complete axe results, including inconclusive checks, are attached to the Playwright report; shared-token contrast measurements have their own JSON attachments.

`@axe-core/playwright` is a pinned development dependency, with its axe-core engine locked transitively. It supplies a repeatable accessibility check without adding a browser runtime dependency or changing the UI library stack. Tests reuse the existing production build, signed fixture sessions, disposable PostgreSQL/MinIO and local TLS. Metadata evidence and images are synthetic; no personal data or live provider is used.

| Area                             | Assessment                                                                                                                                                                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard and focus               | Skip link reaches main; catalog choices use arrow keys and Enter; every wizard step receives focus; search fields show an indicator and remain below the sticky header.                                                                                                             |
| Dialogs and menus                | Mobile navigation, location and defect forms, photo editing/viewing and command search support Escape and appropriate focus return. Modal forms and command search wrap Tab/Shift+Tab; appearance uses a nonmodal menu.                                                             |
| ARIA and screen-reader semantics | Named landmarks, headings, input labels, required controls, descriptions, live status/error announcements, choice names, publication confirmation and 3D controls are checked in the rendered DOM. This assesses screen-reader-facing structure, not actual speech output.          |
| Forms                            | Console/game/accessory selection, physical details, inline defects, console files and review steps; catalog identity forms; trailer/playtime/screenshots; expanded packaging/cartridge template forms; location validation; photo/defect forms; enrichment and publication reviews. |
| Contrast                         | Rendered axe text checks in both themes, plus numeric checks for muted text (4.5:1), essential input boundaries (3:1) and focus tokens (3:1) on their shared surfaces. Disabled controls, image content and complex backgrounds require contextual assessment.                      |
| Public/private pages             | Login, failed login, access denied, public home/browse/category/detail and paused home; private overview, search, collection and all three owned-copy detail types.                                                                                                                 |
| Reduced motion                   | A real uploaded synthetic GLB remains opt-in, has named controls and closes back to its trigger. Changing the preference stops rotation and disables its toggle; content remains visible. Existing motion/public/viewer suites provide further targeted regressions.                |

## Findings and corrections

| Finding                                      | Before                                                                                                                     | Correction and evidence                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 — Insufficient light muted contrast      | Fallback text measured 4.46:1 on stone and selected metadata 4.24:1 on accent.                                             | Refined the shared muted token from `#6f6b66` to `#69655f`: about 4.89:1 on stone, 4.65:1 on accent and 5.55:1 on card. Dark tokens are unchanged. Rendered scans and numeric token checks cover both themes.                                                                                                                                                                                |
| A02 — Invalid listbox announcements          | Command search placed a live status/error inside the listbox, which requires option/group children.                        | Status, errors, selected identity information and result guidance now sit outside the options. Retry and navigation actions stay in the listbox; announcement associations and keyboard behavior are retained. Initial, results, preview, empty and failed states are scanned.                                                                                                               |
| A03 — Choice names omit visible content      | An overriding `aria-label` named only the identity while visible metadata and selection state were omitted.                | The shared picker uses its content as the accessible name, with a hidden “Select” prefix and a visible disambiguating identity. Details and selection state remain readable, with explicit word spacing even when styles are absent. Existing selectors now match the same identity prefix and boundary while permitting the additional descriptive text; slug checks remain where supplied. |
| A04 — Missing command-field focus indicator  | The command input removed its outline and provided no replacement.                                                         | Its shared wrapper now displays a solid two-pixel inset focus ring. Keyboard assertions check the rendered indicator in all three wizards and command search; token checks measure its contrast.                                                                                                                                                                                             |
| A05 — Hidden focusable appearance background | The modal appearance menu hid the rest of the page from assistive technology while background controls remained focusable. | The appearance dropdown is explicitly nonmodal and stays inside the header landmark. Its named menu, keyboard controls and Escape focus return remain available; opening it no longer removes the page landmarks or hides focusable background controls. The shared primitive retains its portal default for other uses.                                                                     |
| A06 — Review and empty pages skip headings   | Settings review and some page-level empty states introduced H3 directly after H1.                                          | Review before saving is now H2. The empty-state primitive accepts a heading level; page-level location, catalog, photo and defect empty states use H2 while nested states retain H3. Reviews and empty pages are scanned in both themes.                                                                                                                                                     |

| A07 — Unsupported names on generic containers | Inconclusive ARIA checks identified names on generic layout divs, which cannot reliably expose those names. | Bento overview layouts, shared choice groups and the console-photo group now carry explicit group roles. Direct named-group assertions and scans verify the exposed names. |

Initial scans reproduced contrast, choice-name, listbox, menu and heading findings in both browser projects. Keyboard/source inspection identified the missing field indicator; review of inconclusive results led to A07. Its paused-home assertion was also corrected: the established private home returns a generic 200 page, while unavailable public detail/search routes use 404. No application behavior was changed to fit that assertion. A later focus assertion was narrowed to the command input rather than the preceding native market selector; the contrast helper now lets the browser resolve CSS colors, including minified short hex values.

## Assessment of inconclusive checks

The broad run retained 132 inconclusive rule results across 282 scans; these were reviewed rather than counted as automated passes:

- Unsupported names on generic containers led to A07 and a focused rerun of affected pages and all three wizards.
- The Magic Card gradient prevents axe from inferring some backgrounds. Source inspection bounds the spotlight at a 5% foreground overlay. Calculated muted-text contrast at that strongest point is about 5.01:1 in light mode and 6.01:1 in dark mode, above the 4.5:1 target. The gradient is decorative and absent under reduced motion or coarse pointer input.
- Radix focus guards are transient tab-routing elements. Actual Tab/Shift+Tab trapping, Escape and return-focus assertions assess the modal behavior the cloned scan cannot infer.
- The zero-result command list intentionally has no options and exposes an explicit live zero-count message outside the listbox. Tests verify that empty state and the absence of options; no required option is being silently omitted.
- The open appearance menu's generated control reference is checked directly against its real rendered ID, supplementing axe's inconclusive reference check.

The complete scan data remains attached for assistive-technology review; these focused assessments do not certify live screen-reader speech or every browser implementation.

## Running and inspecting

```sh
pnpm test:e2e:a11y
pnpm test:e2e:a11y --project=chromium
pnpm test:e2e:a11y --grep 'publication decisions'
pnpm test:e2e:a11y --list --reporter=list
pnpm exec playwright show-report
```

The cases live in [accessibility.spec.ts](../../tests/access-e2e/accessibility.spec.ts). `--list` still prepares and removes the isolated test infrastructure; the list reporter preserves the last HTML report. Normal HTML/JSON attachments and failure screenshots/traces use ignored `playwright-report/` and `test-results/` folders. Tests use new per-journey budgets for multiple scans; existing test and application limits are unchanged.

## Verification — 2026-10-22

The combined gate passed all **88 selected browser checks**: 22 accessibility, 54 critical-path and twelve recovery checks. Its 282 default axe scans reported zero violations. The subsequent inconclusive-result review led to the group-role correction; all **twelve affected browser checks passed again** on the final implementation, with 182 further scans, zero violations and no unsupported generic-name flags. Direct assertions verify the newly named groups, empty result list and the actual open menu's control reference. The other ten accessibility test cases and the business-flow assertions were retained; the focused selection covers all components changed by the final correction.

All **1,459 unit/component cases** pass on the final implementation. Lint, typecheck, production builds, formatting, local documentation links/fences and whitespace checks pass. Inspected light/dark command search and appearance screenshots and the mobile choice layout. Disposable database, storage and TLS resources were removed. The React component checklist was reviewed: server/client boundaries, hook cleanup, conditional 3D loading and application data paths are retained; no runtime dependency or unrelated optimization was introduced.

## Evidence boundaries

Automated checks, keyboard journeys and source/visual inspection are a scoped engineering audit, not WCAG conformance certification. Actual VoiceOver/NVDA speech and navigation, assistive switch input, Safari/Firefox, user testing, external embedded-player interfaces and external OAuth consent were not exercised. Inconclusive axe results remain in attachments for human assessment; an absence of automated violations does not resolve them. Physical-device camera/touch/3D ergonomics and broader mobile workflows belong to Task 20.2.

No schema, query, authorization, publication policy or runtime dependency changed. Standalone database/storage suites are not repeated for these presentation changes; real database/storage operations are exercised by the selected browser journeys. The known Task 19.2 large-search benchmark limitation remains recorded in [TESTING.md](TESTING.md#task-192-integration-expansion).

Reference criteria: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing). Playwright's guidance explains why automated scans need manual and user assessment alongside them.
