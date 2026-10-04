# Application design system

Task 2.2 implements the visual direction in [DESIGN.md](../../DESIGN.md). The root page is a temporary **Design preview**, not a dashboard or public collection. Its cards are illustrative, its form validates locally without saving, and its navigation links to preview sections. Product routes and permissions remain scheduled for later tasks.

## Shared foundations

`src/app/globals.css` centralizes the warm neutral light/dark palette, semantic heading/body/link/media roles and sidebar mappings. Use semantic classes, not page-specific hex colors. `--border` is decorative; `--input` identifies control boundaries, and the opaque `--ring` provides visible keyboard focus.

Inter (400/500/600) provides body, label and navigation text. Plus Jakarta Sans (500) provides headings. The root layout uses `next/font/local` with bundled font files and system fallbacks. Development, builds and visitors need no Google Fonts requests. Font sources, checksums and SIL Open Font Licenses are recorded under `src/app/fonts/`.

Use Tailwind's existing 4px spacing scale: 4/8/12/16/24/32/48/64/96px. Cards use 24px padding and grids use 24px gaps; sections use 32px separation. Page titles are 28/36px on small screens and 32/40px from 640px. Body and input text use 16/24px; metadata uses 14/20px. Cards have 12px corners, inputs 8px and badges 6px. Buttons are pills with at least 44px height; large actions use 48px.

## Layout primitives

| Component          | Use                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApplicationShell` | Server-rendered frame with 248px desktop sidebar, compact sticky header, skip link, main landmark and theme control. Accepts serializable navigation items and a context label; it fetches no data.                                                                                                                       |
| `Navigation`       | Labeled links, icons and an explicit current-page indicator. The caller determines the current item.                                                                                                                                                                                                                      |
| `MobileNavigation` | Small client boundary using Radix/shadcn Sheet, visible below 1024px. Includes accessible title/description, focus trapping, Escape/close controls, focus restoration and close after navigation. Task 2.4 also closes the sheet at the desktop breakpoint and restores focus to main content when the trigger is hidden. |
| `PageContainer`    | Flexible content region, max 1280px including gutters, 16/24/32px responsive side padding.                                                                                                                                                                                                                                |
| `PageHeader`       | One h1, description and optional action. Stacks on narrow screens.                                                                                                                                                                                                                                                        |

The temporary preview supplies Overview/Cards/Forms/Feedback anchors. The future private application will supply the specification's Dashboard/Collection/Consoles/Games/Accessories/Locations/Catalog/Settings links when those routes and access rules exist. Do not infer authentication or public delivery policy from this shell.

## Cards and feedback

`Card` and its shadcn subcomponents provide flat warm panels. `ObjectCard` adds a 4:3 media stage, readable h3 and catalog identity, with an optional separately labeled **My copy** definition list. Pass safe presentation values; the component does not merge catalog data with personal overrides or query the database. Task 2.4 adds grid shrinking and long-word wrapping for card identity and copy metadata, preserving full text at narrow widths. Static examples deliberately avoid implied completeness: “Box present” and “Manual missing” are separate facts.

Actual images should preserve object proportions, have meaningful alternative text and use approved display assets. The preview's neutral icons are decorative placeholders. Its brand image is an unchanged copy of `logo/gemu-kore-transparent-master.png` at `public/brand/gemukore.png`; refresh that copy intentionally if the brand source changes. This static brand file does not establish the delivery rules for future collection media.

`EmptyState` accepts a short explanation and optional useful action. Callers must distinguish an empty collection from no search results. `LoadingCards` supplies stable media/text dimensions and an accessible loading label; its decorative skeletons are hidden from assistive technology and stop pulsing under reduced motion. Use it only while work is pending; the preview labels its permanent demonstration as an example.

## Forms

Use shadcn `Label`, `Input`, `Textarea` and `Button`, with the shared `FormField` for visible labels, hints and nearby errors. Give every field an explicit unique ID. Connect hints/errors using `aria-describedby`, set `aria-invalid` when invalid and indicate required fields visibly and semantically. Inputs retain 16px text on mobile, visible boundaries and an opaque focus ring.

The preview demonstrates React Hook Form with the Zod resolver: empty/whitespace names and overly long notes show associated errors, the first invalid control receives focus, successful validation announces that nothing was saved, and Reset clears values and feedback. The two form dependencies are pinned; they implement the form stack already required by the specification.

For future data-writing forms, share domain validation at the server boundary, validate again on the server, enforce authorization, preserve values on failure, expose pending/submission errors in the form and protect unsaved changes. Client validation is helpful feedback, not a security boundary. The unsaved design example does not create a server action or mutation endpoint, simulate a save, or implement domain rules early.

## Themes and motion

Light/Dark/System retain the existing next-themes behavior and `gemukore-theme` storage key. The theme menu is outside the sidebar, making it accessible on both desktop and mobile. The page, shell and display primitives remain Server Components; the sheet, theme controls, Radix labels, editable form and interactive motion examples use small client boundaries.

Reduced-motion preferences disable sheet/menu keyframes, input/button transitions and skeleton pulses. Task 2.3 adds a selective Blur Fade example and reusable entry, hover, list and shared card/detail patterns. Their timing, static fallbacks and usage are documented in the [animation strategy](ANIMATION_STRATEGY.md).

## Verification

Run the checks in [TESTING.md](TESTING.md). Browser tests cover form validation/reset/no persistence, keyboard navigation and focus restoration, skip navigation, explicit and system themes, reduced motion and absence of horizontal overflow at 320px. A 640px CSS viewport exercises the layout equivalent of a 1280px desktop at 200% zoom; this is a responsive-layout check, not a complete assistive-technology audit.

Verified on 2026-10-03: 10 unit/component tests, three isolated database integration tests and 18 desktop/mobile browser checks pass, along with lint, typechecking, formatting and the production build. Local (3001) and Docker (3002) previews were inspected in the browser; the bundled fonts load without external font requests, and no browser errors or framework overlay were detected.

The preview can run without a database. Production browser tests use an unavailable test database URL, and integration tests use an isolated disposable PostgreSQL container. No schema or personal-data changes are required.

Implementation references: [Next.js fonts](https://nextjs.org/docs/app/getting-started/fonts), [shadcn Sheet](https://ui.shadcn.com/docs/components/radix/sheet), [React Hook Form](https://react-hook-form.com/get-started) and [Zod resolver](https://github.com/react-hook-form/resolvers#zod).

Task 2.4 reviews and retains these boundaries. Its [UI architecture review](../architecture/UI_ARCHITECTURE_REVIEW.md) documents the fixes and current limitations. Verified on 2026-10-04: 11 unit/component tests, three database integration tests and 28 browser checks pass, with lint, typechecking, formatting and the production build.
