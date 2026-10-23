# Mobile UX review — Task 20.2

Review date: 2026-10-22. Requirements: `PROJECT_SPEC.md` sections 88–91 and 122, plus `DESIGN.md`.

## Scope and method

[mobile-ux.spec.ts](../../tests/access-e2e/mobile-ux.spec.ts) exercises six workflows in light and dark themes, for twelve mobile Chromium checks. It uses the existing production build, signed fixture sessions, disposable PostgreSQL/MinIO and local TLS. Synthetic photos and GLBs pass through real private upload and rendering paths. The desktop project excludes only this new mobile-specific file; existing desktop/mobile coverage remains enabled.

The review covers 320px and 390px phone widths, a short 320×480 viewport, 740×360 landscape, 768×1024 tablet and the transition to the desktop sidebar at 1280px. Touch actions check at least 44×44px targets. Layout assertions check document overflow and descendant bounds; editable fields use at least 16px text. Screenshots supplement those checks because an absence of overflow does not guarantee readable content.

| Workflow               | Evidence                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add console            | Touch selection of platform/model, physical details and a long unbroken note; separate camera/library inputs; local preview before upload; Back/review/save; persisted PRIVATE copy and unapproved photo.                                                                                                                       |
| Add game               | Reachable validation before selecting a platform; platform/game/release choices; physical details, defect and camera selection; portrait/landscape changes and Back preserve values; reviewed copy/photo saved privately.                                                                                                       |
| Camera and photos      | Tapping Take a photo opens the rear-camera file input; a synthetic image completes the real upload; short-screen edit/view/remove dialogs retain reachable actions and focus return; cancelling removal preserves the use.                                                                                                      |
| Filters                | Expanded controls at 320px and 768px; real result changes, history/reload, removal of one filter and clear-all. Native selects remain the platform control.                                                                                                                                                                     |
| Dialogs and navigation | Every measured frame of photo-editor entrance stays inside the viewport; settled sheet layouts fit; landscape navigation reaches its final destination; desktop resizing closes the mobile sheet and moves focus to main.                                                                                                       |
| 3D touch               | Real Chromium touch events rotate and pinch the rendered GLB, checked against rendered images; reset restores the initial pose; swiping outside the viewer scrolls the page; expanded landscape fallback fits and closes with focus restoration. Reduced motion disables automatic rotation while retaining manual interaction. |

The existing navigation sheet remains appropriate for the current destinations: its labels, scrollability and breakpoint behavior are exercised directly. This review does not introduce a dock or change navigation architecture.

## Findings and corrections

| ID  | Reproduced issue                                                                                                                                                                 | Correction                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M01 | At 320px, the selected-file preview and Remove button squeezed the filename and upload status into a roughly one-character column. Page-overflow checks alone passed.            | The shared wizard file card stacks on small screens and retains its horizontal layout from `sm`. A browser assertion requires usable filename width before saving. Console, game and accessory wizards share this component.         |
| M02 | Ordinary dialog entrance animated CSS `translate`, temporarily overriding the translation used to center the surface. The photo editor initially appeared partly off-screen.     | Dialogs use the existing stationary surface fade. First-frame and subsequent-frame measurements cover the entrance; reduced motion remains static. Sheet entry retains its intentional edge movement and is measured after settling. |
| M03 | At 320px, the photo editor's intrinsic grid, fieldset and textarea sizing could push its contents beyond the dialog; long captions also needed wrapping in the view description. | The dialog grid can shrink its column, the photo fieldset and shared textarea can shrink, and dialog descriptions wrap unbroken text. Short-screen editing, saving and viewing exercise the result.                                  |

No schema, service, authorization, publication policy, upload format, dependency or performance architecture changes are introduced. File contents still stay local until the wizard saves its copy. HEIC conversion guidance and supported-format validation remain in place.

## Running the review

```sh
pnpm test:e2e:mobile
pnpm test:e2e:mobile --grep 'camera uploads'
pnpm exec playwright show-report
```

The mobile script selects the existing touch-enabled Pixel 7 Chromium project; individual journeys resize its viewport. Both theme variants use fresh browser contexts. Six new workflow tests have their own 60-second budget; no existing timeout, retry, validation or application limit is relaxed. PNGs, failure screenshots and traces use ignored Playwright output directories. The helper's dialog-frame observer checks actual geometry rather than CSS class names.

## Verification

The combined gate passed all **30 selected browser checks**: twelve new mobile checks and eighteen existing desktop/mobile creation, upload, filter, accessibility and 3D regressions. The final strengthened assertions passed **four focused reruns** for saved long captions, dialog clipping and exact filter-result identities. All **six shared animation browser checks** also pass, covering normal motion, live reduced-motion changes, keyboard focus, shared-media dialogs and readable server output without JavaScript. There were no skipped, unexpected or flaky results in these runs.

All **1,459 unit/component cases** pass, along with lint, typecheck, production builds, formatting and whitespace checks. Local documentation links and fences were checked. Inspected phone creation/photo-card, short-dialog, long-caption and dark-theme screenshots. Disposable test resources were removed. The React component review retains existing server/client boundaries and data paths; the changes are presentation only.

Initial checks exposed the layout findings above. Test-only corrections scoped the validation alert to main content (excluding the framework route announcer), waited for intentional sheet movement before checking settled bounds, and awaited the saved caption before opening its view. Those corrections preserve the behavior assertions; no failure or timeout was waived.

## Physical-device follow-up

Chromium emulation verifies application behavior, browser touch events and rendering on this host. It does not open a physical camera or reproduce iOS Safari, browser chrome, a software keyboard, safe-area cutouts, hardware GPU/memory limits or real device ergonomics. A short viewport verifies scrolling and reachable controls but does not substitute for a real keyboard test.

On a representative iPhone and Android phone, repeat the add-console and add-game flows with a newly captured photo and a library photo, rotate while entering details, edit a caption with the keyboard open, open/close the navigation and a long dialog, then orbit/pinch/reset a model and scroll outside it. Check notched/landscape safe areas and the system's offered image format. Live camera permission, HEIC export behavior and native fullscreen remain device checks. These limits are explicit; this review does not claim physical-device or cross-browser certification.

Database/storage integration behavior is covered through real operations in the selected browser journeys. Standalone integration/storage suites are not repeated for these presentation changes; the known Task 19.2 search benchmark limitation remains documented in [TESTING.md](TESTING.md#task-192-integration-expansion). Performance investigation remains Task 21.1.
