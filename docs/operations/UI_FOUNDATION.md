# UI foundation

Task 2.1 configured shadcn/ui, Magic UI, Lucide, Motion and theme handling. Task 2.2 now implements typography, navigation, layout and component conventions in the [application design system](DESIGN_SYSTEM.md). The root page is a temporary design preview. Task 2.3 establishes the [animation strategy](ANIMATION_STRATEGY.md), with reusable patterns and static fallbacks.

## Installed foundations

- `components.json` configures shadcn's Radix-based `radix-nova` preset, neutral colors, CSS variables, Tailwind 4 and Lucide icons. Initialization used CLI 4.21.1 with noninteractive defaults. Task 2.1 installed Button and Dropdown Menu; Task 2.2 also installs Card, Input, Label, Textarea, Skeleton, Sheet and Badge; Task 2.3 adds Dialog.
- `src/components/ui/` contains the owned shadcn source. The underlying Radix package is part of shadcn's implementation, not a second design system.
- `src/lib/utils.ts` exposes the CLI's `cn` class-merging helper. Components use the repository alias for that helper.
- `src/components/magic/blur-fade.tsx` is installed from Magic UI's official registry. `@magicui` is registered in `components.json`. Task 2.3 adapts this owned source for visible server rendering, bounded effects and live reduced-motion changes; the preview includes a selective example.
- `motion/react` is the animation entry point. Do not add a second animation library. Lucide provides the theme menu's icons.
- `src/app/globals.css` holds light/dark tokens. Task 2.2 replaces the neutral installation baseline with the palette in `DESIGN.md` and uses locally served Inter and Plus Jakarta Sans through `next/font`. The CLI's circular font variable remains removed.

Versions are pinned in the package manifest and lockfile. The current shadcn generator imports `shadcn/tailwind.css`, so the `shadcn` dependency supplies both the CLI and build-time styles; it is not a runtime component library.

## Theme behavior

`ThemeProvider` is a small Client Component that wraps server-rendered children. The root layout and preview page remain Server Components. `next-themes` applies the `light` or `dark` class to `<html>` and handles system preference, initial theme application and persistence under `gemukore-theme` in local storage.

The default is **System**. The visible Theme menu offers **Light**, **Dark** and **System**, with radio selection, keyboard navigation, focus restoration and touch-sized controls. Its trigger renders stable content before hydration; selected theme state is displayed only in the opened menu. The intentional hydration-warning suppression is limited to `<html>`, whose theme attributes are updated by next-themes.

Use semantic classes such as `bg-background`, `text-foreground`, `text-muted-foreground` and `border-border` instead of fixed light-only colors. The design preview and shared controls follow the Task 2.2 palette and typography.

## Reduced motion and future effects

The provider sets Motion's `reducedMotion="user"`. This covers Motion transforms and layout animation; it does not automatically disable blur filters or CSS keyframes. The installed Blur Fade returns static, immediately visible children when reduced motion is requested. Button movement/transitions and Dropdown Menu keyframes also respect the preference.

Task 2.3 replaces the upstream hidden entrance with visible server HTML and an optional short effect. Shared timing, CSS patterns and explicit custom-motion preference handling are documented in the animation strategy. Keep navigation and actions usable independently of animation.

## Adding components

Add only components needed by an authorized task. Run from the repository root:

```sh
pnpm exec shadcn add input --yes
pnpm exec shadcn add @magicui/magic-card --path src/components/magic --yes
```

These commands illustrate the installation workflow; Input is already installed by Task 2.2. Review generated changes, dependency additions and CSS before accepting them. Keep Magic UI sources under `components/magic/`, keep utility imports aligned with `components.json`, and preserve local accessibility adjustments when updating registry source.

After dependency changes, run `pnpm docker:app` to rebuild and refresh the Docker development app's separate dependency volume. Local development uses the host installation.

## Verification

The existing foundation tests still run. The added browser suite checks explicit theme persistence, changing system preferences, keyboard selection, focus restoration and reduced-motion menu behavior on desktop and mobile Chromium. A focused component test verifies that Blur Fade does not hide offscreen content when reduced motion is enabled.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm format:check
```

Playwright also builds the production application. No database schema changes or migrations are required for Task 2.1.

Verified on 2026-10-03: 10 unit/component tests, three database integration tests and 10 desktop/mobile browser checks pass, along with lint, typechecking, formatting and the production build. Local and Docker previews render without browser errors. Dependency refresh exposed a Docker startup issue; its install now runs noninteractively and reuses the image's package store, avoiding a redundant download through the source bind mount.

## Sources

Setup follows [shadcn installation](https://ui.shadcn.com/docs/installation/next), [shadcn theme handling](https://ui.shadcn.com/docs/dark-mode/next), [Magic UI installation](https://magicui.design/docs/installation), [Blur Fade](https://magicui.design/docs/components/blur-fade) and [Motion accessibility](https://motion.dev/docs/react-accessibility).
