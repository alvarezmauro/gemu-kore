# Animation strategy

Task 2.3 establishes reusable presentation patterns for the design in [DESIGN.md](../../DESIGN.md). Motion should help people follow an interaction or recognize a state change. Static display remains the default. The temporary preview's **Motion with a purpose** section demonstrates the patterns with unsaved examples; it does not implement collection features or product routes.

## Timing and ownership

`src/lib/motion/tokens.ts` owns the shared timing and easing. The root layout exposes its CSS variables on the body; Motion receives the same values in seconds. Use these tokens rather than introducing per-page timing constants.

| Purpose                           | Duration | Treatment                                                               |
| --------------------------------- | -------- | ----------------------------------------------------------------------- |
| Card hover feedback               | 120ms    | At most 2px upward movement, only with a fine pointer and hover support |
| Page/list entry and open surfaces | 180ms    | At most 4px content travel; dialogs with shared media remain stationary |
| Overlay/surface exit              | 150ms    | Short fade; sheets travel at most 16px                                  |
| List layout and shared media      | 200ms    | Cubic-bezier easing `(0.19, 1, 0.22, 1)`; no spring overshoot           |
| Optional Blur Fade                | 180ms    | At most 2px blur and 4px travel; opacity stays at or above 0.96         |

CSS owns simple entries, hover and Radix surface transitions in `src/app/globals.css`. The owned shadcn Dialog and Sheet retain their functional behavior. The adapted Magic UI Blur Fade provides a selective presentation effect. Motion owns list position changes and shared card/detail media. No additional library or dependency was introduced.

## Reusable patterns

| Pattern          | API/location                                                                              | Usage                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page entry       | `PageEntry`, `components/motion/page-entry.tsx`                                           | Wrap one small content region when its arrival improves orientation. It is compatible with Server Components. Do not automatically animate every page, title or grid.                                                                                                                                                                                  |
| Collection cards | `CollectionCardMotion`, same file                                                         | Wrap an actionable card, keeping its real link/button and visible focus style. Pair with `PageEntry` only for a deliberate entrance. Static catalog examples remain static.                                                                                                                                                                            |
| Card hover       | `.motion-card`, applied by `CollectionCardMotion`                                         | Quiet 2px feedback; no hover-dependent content, click handler on a plain div or implied action on a display-only card. Touch and reduced-motion users get a static card.                                                                                                                                                                               |
| Blur Fade        | `BlurFade`, `components/magic/blur-fade.tsx`                                              | Optional presentation detail. Props: `children`, `className`, `inView`, `inViewMargin`, `delay` (seconds). Plays once per mount, with delay clamped to 0–80ms. `inView` schedules the effect, never hides content while waiting.                                                                                                                       |
| Dialogs          | `Dialog*`, `components/ui/dialog.tsx`                                                     | Radix owns labeling, modal focus, Escape, dismissal and restoration. Always supply a title, description and close control. The ordinary dialog enters with 4px travel; the overlay fades. Sheet uses the same timings with small directional travel.                                                                                                   |
| List transitions | `AnimatedList`, `components/motion/animated-list.tsx`                                     | Supply a list label and `{ id, content }` items with stable identity, never array indexes. DOM order updates immediately; retained items animate their position. New items get the short CSS entry. Removed items disappear immediately, without retaining obsolete controls for an exit animation. Callers own state and any meaningful announcement. |
| Card → detail    | `CardDetailScope`, `SharedMedia`, `SharedLayoutRoot`, `components/motion/card-detail.tsx` | Put card and dialog under one scope; give both media elements the same identity. Separate scopes prevent duplicate identities in other cards from connecting. The shared media moves between layouts while the accessible dialog opens normally.                                                                                                       |

For card/detail composition, use `DialogContent asChild showCloseButton={false}` with exactly one `SharedLayoutRoot data-shared-layout` child. Put the header, shared media and explicit `DialogClose` inside that child. The root accounts for the fixed portal's scroll offset, and the data attribute keeps the dialog stationary for measurement. `asChild` defaults to no generated close button because Radix requires a single element child; do not enable the generated sibling close control in this composition.

The preview demonstrates this composition in `src/components/design-preview/animation-preview.tsx`. Its shared icon is a placeholder. Future real media must use safe display assets, meaningful alternative text where appropriate and stable canonical/owned identity supplied by the caller. Presentation components do not fetch data, resolve overrides or authorize access.

Shared layout currently covers a mounted card and dialog. It does not implement cross-route transitions, route interception or product navigation. Future detail routes must work as ordinary links first; if both surfaces cannot share a mounted scope, opening the detail without a shared transition is the supported fallback.

## Static rendering and reduced motion

The provider keeps `MotionConfig reducedMotion="user"`. That alone does not disable filters, opacity or CSS keyframes. `useMotionAllowed()` in `src/lib/motion/use-motion-preference.ts` explicitly enables custom Motion effects only when the browser reports `prefers-reduced-motion: no-preference`. Server rendering, unknown preferences and unavailable media-query support use static presentation. The subscription also handles live preference changes.

CSS animations exist only inside the no-preference media query. Reduced motion removes entry/exit keyframes, decorative movement and hover transitions. Lists disable layout motion; shared media disables `layoutId`; Blur Fade skips its effect or cancels active playback and restores opacity, filter and transform. Existing controls, menus and skeletons retain their reduced-motion support.

Server HTML is visible before hydration. Blur Fade never writes an initial hidden style, and its animation cleanup restores the static state. CSS entries preserve full opacity and have no hidden delay or fill mode. Optional in-view content stays readable if observation or animation is unavailable. No timers gate content, focus, list changes or successful actions.

Without JavaScript, the preview's server content, lists and normal anchor navigation remain readable and usable. The dialog, theme menu and demo replay/list buttons require JavaScript. Animation fallback does not provide a JavaScript-free substitute for these controls; future essential product navigation must use real links and server-rendered destination content.

## Applying the patterns

- Use one entry effect per region. Do not nest Blur Fade inside an already moving entry wrapper, blur forms or animate every list row with escalating delays.
- Keep effects short, bounded and interruptible. Avoid continuous decorative movement, parallax, auto-rotation, animated backgrounds and spring bounce.
- Animate transform/opacity for routine feedback. Keep the optional 2px blur on small presentation details, not large surfaces or critical text.
- Preserve semantic controls, logical DOM order, visible focus and touch targets. Animation must not delay keyboard access, loading feedback or data updates.
- Keep the root layout, page and static wrappers server-rendered. Add client boundaries only for custom Motion hooks or actual interaction. Do not move queries or business logic into the animation components.
- Respect light/dark semantic colors and bounded mobile layouts. Public pages follow the same accessibility and performance limits.

## Verification

Run the checks in [TESTING.md](TESTING.md). `tests/e2e/motion.spec.ts` covers desktop/mobile detail opening, focus trapping, Escape and focus restoration; immediate list order and addition; live reduced-motion changes; static computed styles; and readable server content at 320px without JavaScript. Blur Fade component tests check reduced-motion and server-rendered visibility. Existing theme, form, navigation and database checks remain in place.

Verified on 2026-10-03: 11 unit/component tests, three isolated database integration tests and 24 desktop/mobile browser checks pass, along with lint, typechecking, formatting and the production build. The Docker preview on port 3002 was inspected visually; the detail opens and closes without browser errors or a framework error overlay.

The temporary preview can run without a database. Browser tests build the production app with an unavailable test database URL; integration tests use an isolated disposable PostgreSQL container. No schema changes are needed.

## References

The patterns adapt [Magic UI Blur Fade](https://magicui.design/docs/components/blur-fade), [Motion accessibility](https://motion.dev/docs/react-accessibility) and [Motion layout animation](https://motion.dev/docs/react-layout-animations). The installed Blur Fade is owned source with stricter static rendering and reduced-motion behavior than its registry baseline; preserve these adjustments when updating it.
