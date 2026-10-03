# GemuKore — Design Direction

Version: 0.1 · Established: 2026-10-03 · Implementation begins in Task 2.2.

GemuKore should feel like a carefully arranged collection on warm paper: calm, tactile, welcoming and easy to browse. Games, consoles, packaging and personal photographs provide the personality. The interface supplies a quiet frame around them.

This document adapts the user's **Fambly** reference to GemuKore. It governs visual decisions alongside [PROJECT_SPEC.md](PROJECT_SPEC.md), the accepted [repository architecture](docs/architecture/REPOSITORY_ARCHITECTURE.md) and [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). It does not change domain rules, permissions, public/private boundaries or development sequencing. The current application's Task 2.1 styling is an installation baseline, not the finished design described here.

The original [example HTML](docs/design/references/fambly.html) is preserved as visual reference. Read its [reference notes](docs/design/references/README.md) before using it. This document takes precedence over that example for GemuKore-specific styling and accessibility decisions.

## 1. What to carry forward

| Reference characteristic          | GemuKore interpretation                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| White paper and pale beige panels | Neutral backgrounds, warm surfaces and generous breathing room around collection objects.                                                  |
| Soft, flat 12px panels            | Collection cards, grouped metadata, forms and image stages with consistent corners.                                                        |
| Near-black primary pills          | Clear primary actions; soft neutral secondary actions. Invert the primary treatment in dark mode.                                          |
| Plus Jakarta Sans and Inter       | Friendly display headings paired with readable application text.                                                                           |
| Small areas of saturated color    | Artwork, selected details and labeled status indicators; one decorative accent per section.                                                |
| Playful sticker imagery           | Occasional original gaming-related illustration in empty states or public presentation. Collection media remains the main visual material. |
| Airy editorial spacing            | More expansive public pages; a comfortable, more compact private workspace.                                                                |
| Minimal movement                  | Fast feedback and selective presentation effects, with a complete static experience.                                                       |

Do not transplant finance copy, pricing plans, testimonials, invented statistics, phone mockups or Fambly branding. A centered mascot hero is not required. The supplied artwork is reference material, not GemuKore's asset library. Use existing GemuKore logo sources under `logo/` when preparing appropriate web assets; do not replace the identity with Fambly's mark.

## 2. Two contexts, one visual language

**Private application:** prioritize finding, adding and maintaining physical items. Use a desktop sidebar, clear page headings, efficient filters, visible actions and readable metadata. Keep decoration outside task-critical controls.

**Public collection:** present an inviting personal museum. Allow larger object photography, editorial titles, curated highlights and more deliberate transitions. Keep search and browsing direct. Public presentation must use approved public data and assets; a visual component must never fetch private data and hide fields in the browser.

Both contexts share typography, tokens, controls and accessibility. Neither requires glass surfaces, neon lighting, CRT effects or animated backgrounds. The specification's optional retro and futuristic effects are not defaults for this direction. Magic UI remains available for purposeful enhancement.

## 3. Color and theme tokens

Support **Light**, **Dark** and **System**, retaining system preference as the default and the existing saved choice. Dark mode is a warm charcoal interpretation based on the reference's “Bedtime” palette. Do not add Mint, Butter or Grape as application themes.

Use semantic CSS variables through Tailwind/shadcn. The following values are the starting palette for Task 2.2; centralize any later refinements in the theme rather than adding page-specific hex colors.

| Token / role                         | Light     | Dark      |
| ------------------------------------ | --------- | --------- |
| `--background`                       | `#ffffff` | `#16151a` |
| `--foreground`                       | `#121212` | `#f6f4ef` |
| `--card`                             | `#fbfaf9` | `#1f1e24` |
| `--card-foreground`                  | `#121212` | `#f6f4ef` |
| `--popover`                          | `#ffffff` | `#1f1e24` |
| `--popover-foreground`               | `#121212` | `#f6f4ef` |
| `--heading`                          | `#343433` | `#ecebe8` |
| `--body`                             | `#474645` | `#c9c6c1` |
| `--muted`                            | `#f6f4ef` | `#2a2930` |
| `--muted-foreground`                 | `#6f6b66` | `#aca6a0` |
| `--primary`                          | `#171717` | `#f6f4ef` |
| `--primary-foreground`               | `#ffffff` | `#16151a` |
| `--secondary`                        | `#f6f4ef` | `#2a2930` |
| `--secondary-foreground`             | `#121212` | `#f6f4ef` |
| `--accent` (hover/selection surface) | `#eae6dd` | `#35343c` |
| `--accent-foreground`                | `#121212` | `#f6f4ef` |
| `--border` (decorative divider)      | `#efedea` | `#2c2b31` |
| `--input` (control boundary)         | `#8e8881` | `#746f79` |
| `--ring` / `--link`                  | `#205ecb` | `#6aa6ff` |
| `--destructive` (text/icon)          | `#b42318` | `#ff8a80` |
| `--stone` (media backdrop)           | `#f2ebe0` | `#2a2830` |

Map sidebar surfaces and text to these same neutral roles. Map its active item to the accent surface and provide an icon/label plus a visible selected indicator. Reserve new semantic colors for an actual product need.

The reference's `accent` means the primary button; shadcn's `--accent` means a hover/selection surface. Use the mapping above rather than copying variable names literally.

### Accent color and status

Reference hues such as blue `#3784f4`, green `#34c759`, orange `#ff5310`, gold `#ca9230`, pink `#f966ac` and purple `#9553f9` may inspire illustrations and small decorative details. They are not automatically approved text or status colors. Collection artwork may contain many colors; the surrounding UI stays restrained.

Use accessible foreground/background pairs for success, warning, error and information. Pair color with a label or icon. Do not use category decoration to imply condition, ownership, completeness or publication. In particular, “has a box” must not visually imply “complete.” Destructive controls are an exception to neutral primary actions; pair their color with an explicit action label and appropriate confirmation.

### Contrast corrections to the reference

The supplied muted `#848281` is approximately **3.82:1 on white**, insufficient for normal small text. Use `#6f6b66` instead; it is approximately **5.07:1 on `#fbfaf9`**. The dark muted pair above is approximately **6.87:1**. These are calculated sRGB contrast ratios, not a completed screen audit.

Target at least 4.5:1 for normal text, 3:1 for large text and 3:1 for essential control boundaries/focus indicators against adjacent colors. Pale `--border` is for nonessential separators, not the only indication that an input exists. Do not fade required text with opacity or assume the source's bright labels are accessible. Check actual rendered states, including images behind text.

## 4. Typography

Use **Plus Jakarta Sans** for display and page headings, primarily weight 500. Use **Inter** for body copy, forms, navigation and metadata at 400/500, with 600 for labels or emphasis. Load only needed weights through Next.js font handling when implementing; provide system sans-serif fallbacks and avoid runtime font requests from the visitor's browser. No proprietary reference font is required.

| Role                      | Desktop size / line height | Mobile size / line height | Weight  |
| ------------------------- | -------------------------- | ------------------------- | ------- |
| Public display title      | 56–68 / 1.1                | 36–44 / 1.1               | 500     |
| Private page title        | 32 / 40                    | 28 / 36                   | 500     |
| Editorial section title   | 36–44 / 1.15               | 28–32 / 1.2               | 500     |
| Card / subsection title   | 18–20 / 26                 | 18–20 / 26                | 500–600 |
| Main body / form input    | 16 / 24                    | 16 / 24                   | 400     |
| Public introduction       | 17–19 / 26–28              | 17 / 26                   | 400–500 |
| Navigation / button label | 15 / 20                    | 15 / 20                   | 500–600 |
| Secondary metadata        | 14 / 20                    | 14 / 20                   | 400     |
| Nonessential caption      | 13 / 18                    | 13 / 18                   | 400     |

Start display tracking near `-0.035em`, adjusting toward the reference's `-0.045em` only at large sizes after inspection. Use less compression for smaller headings and approximately normal tracking for body text.

Prefer sentence case. Avoid widely tracked uppercase labels. A period can suit a short editorial sentence; do not append punctuation to every navigation label, page title or game name. Preserve official product capitalization. Aim for short headings, but allow long titles to wrap instead of enforcing the reference's two-line limit. Avoid 11px application metadata and opacity-reduced captions.

## 5. Spacing, layout and responsiveness

Base spacing unit: **4px**. Use a shared scale of 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96. Prefer 16–24px card padding, 16–24px grid gaps, 24–32px between workspace sections and 64–96px between public editorial sections.

- **Private workspace:** approximately 248px desktop sidebar; flexible main region with a maximum content width around 1280px. Keep forms around 640–720px wide. Do not force all collection grids into the reference's 1024px landing-page column.
- **Public editorial content:** 1024px maximum with 24px side gutters; use up to 1280px where object grids benefit. Mobile gutters are 16–24px.
- **Responsive starting points:** below 768px use the mobile shell; 768–1023px allow a compact header and navigation sheet; from 1024px show the sidebar. Adjust layout at content pressure rather than relying on device names.
- **Mobile navigation:** start with an accessible shadcn sheet and clear current-page identity. A dock remains an option to evaluate later, not a required decorative feature. Keep the add-item action easy to reach.
- **Collection grids:** use regular responsive grids/list views. Choose minimum card widths based on readable titles and useful media sizes; never force tiny cards to meet a fixed column count. Bento composition is limited to summaries or curated highlights.
- **Page headers:** title and short description on the left, one primary action on the right; stack on small screens. Let filter controls wrap or move into a labeled sheet.

Preserve reading order, keyboard order, zoom and long translated/user-entered text. At 320px width, the page must not overflow horizontally; explicitly scrollable tables are a local exception. Respect safe-area insets for fixed mobile controls.

## 6. Shape, elevation and components

Use **12px** for panels/cards, **8px** for inputs, **6px** for small chips, and fully rounded pill buttons. Use 44px minimum hit areas for primary controls and icon buttons; 48px suits the main add action. The reference's 32px buttons and 26px burger are not the touch-target baseline.

Depth comes from contrasting surfaces and spacing. Static panels usually need neither a border nor a shadow. Thin separators are useful for lists and metadata. Give menus, popovers, sheets and dialogs a restrained shadow and a distinguishable edge. Visible input boundaries and focus indicators are intentional exceptions to the reference's borderless-panel rule. Avoid nested card stacks and heavy shadows.

### Component conventions

| Component                | GemuKore direction                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary action           | Near-black pill with white label in light mode; warm-white pill with dark label in dark mode. One dominant action per region.                                   |
| Secondary / quiet action | Neutral pill or text/ghost treatment, with clear hover, focus and disabled states.                                                                              |
| Collection card          | Warm panel, dedicated media area, readable title, platform/model or release identity, then a small amount of useful copy-specific metadata.                     |
| Card interaction         | Make navigation targets clear. Avoid nested buttons inside a whole-card link. Expose secondary actions without requiring hover.                                 |
| Detail header            | Object photo, cover or static 3D thumbnail; title and identity; progressive enhancement for an interactive viewer.                                              |
| Catalog vs owned copy    | Separate canonical information from “My copy” details. Label edition/market/model clearly; do not style them as arbitrary personal overrides.                   |
| Form                     | Visible labels, related fields grouped in warm panels, helper/error text near fields, full-width controls on mobile. Never use a placeholder as the only label. |
| Filters / search         | Neutral controls, visible active filters and a clear reset action; dense enough to remain useful above a collection grid.                                       |
| Badge                    | Compact but readable, labeled and restrained. Hide nonessential badges before shrinking text.                                                                   |
| Loading                  | Skeletons matching the eventual layout; progressive media loading; stable dimensions. Reduced motion uses static placeholders.                                  |
| Empty state              | Short explanation and one useful next action. Distinguish an empty collection from no search results. An original small illustration is optional.               |
| Error state              | Explain what failed, whether changes were saved and what to do next. Preserve entered values; do not depend on a toast alone.                                   |
| Enrichment review        | Clearly distinguish suggested values, sources and manual values. Visual polish must not obscure review or acceptance.                                           |

These conventions guide components as their scheduled tasks arrive; this document does not authorize new CRUD, enrichment or public features.

## 7. Artwork, icons and 3D

Favor real collection photography, cover art, box art and approved hardware imagery. Preserve artwork proportions with contained media stages where cropping would hide identifying details. Optional editorial crops must not replace an inspectable original. Use warm neutral backdrops rather than coloring every card by category.

Use Lucide at 16–20px with consistent stroke weight; give icon-only actions accessible names. Decorative icons should be hidden from assistive technology. Use descriptive alternative text for meaningful collection images.

Original sticker-like gaming illustrations may support empty states or a public introduction, but a mascot system is not required. Preserve asset provenance and publication eligibility. Do not reuse the sample's piggy banks, coins, mascots, testimonials or claims as GemuKore content. Do not apply `mix-blend-mode: multiply` to collection assets as a global rule: it can change artwork colors and fail in dark mode.

Use static images in collection grids. Load interactive 3D only on demand, with a static fallback, theme-appropriate lighting and no automatic rotation under reduced motion. Do not surround viewers with animated decorative scenes.

## 8. Motion

Keep the reference's calm rhythm: 100–150ms for color/hover feedback and 150–220ms for menus, sheets and small state transitions. Use ease-out for feedback; the reference's `cubic-bezier(.19,1,.22,1)` can suit modest travel. Never delay input, saving or navigation for an entrance sequence.

Use shadcn for controls, Magic UI for selected presentation effects, and Motion where custom transitions require it. Do not add new component or animation libraries. One effect should serve a clear purpose; installed effects are not obligations.

Static display is the default for headings, card grids and decorative art. Selective short reveal or card-to-detail transitions remain available for Task 2.3 when they improve orientation. Avoid continuous marquees, floating mascots, animated background grids and automatic parallax. The reference's testimonial marquee is not part of GemuKore's design.

Under `prefers-reduced-motion`, remove decorative travel, blur, scale, keyframes and auto-rotation. Content must be visible and functional immediately, including when JavaScript or animation fails. Distinguish a transient blur transition, if deliberately approved, from a persistent blurred/glass surface; neither is a default. Public presentation may be richer while following the same limits.

## 9. Implementation boundaries

- Apply this direction through the existing semantic tokens, shadcn sources and shared layout components. Do not paste the reference's global CSS into the application.
- Keep reusable controls in `src/components/ui/`, Magic UI source/wrappers in `src/components/magic/`, and layout primitives in `src/components/layout/`.
- Keep pages and data-bearing layouts as Server Components. Theme controls, navigation sheets and interactive viewers may be small Client Components.
- Keep the existing next-themes behavior and storage key. Build fonts, palette, spacing and component conventions in Task 2.2; establish reusable animation rules in Task 2.3.
- Keep reference HTML outside `public/` and `src/app/`. It must not become a route, runtime import or production asset bundle.
- No schema, authentication, authorization, publication or business-logic changes follow from this design document.

## 10. Acceptance checklist for subsequent UI work

- The interface uses warm neutral surfaces and collection imagery as its main source of color.
- Light, dark and system themes work across default, hover, focus, selected, disabled and error states.
- Controls have readable labels, appropriate hit areas, visible focus, keyboard operation and predictable focus restoration.
- Long titles, mobile layouts, 200% zoom and empty/error/loading states remain usable.
- Text and essential controls meet the contrast targets; no status relies solely on color.
- Collection cards preserve object identity and distinguish catalog data from owned-copy details.
- Decorative effects are sparse, reduced-motion behavior is verified, and static content remains available.
- Any illustrations or media retain provenance and respect public/private delivery rules.
- Application work remains within its authorized development task; the Fambly example is used as visual guidance only.
