# Design system

Clean, quiet, and built from tokens. The rule: **components take tokens, never
raw values.** If a value is missing, add a token rather than inlining it.

## Tokens (`src/constants`)

| File            | Provides                                                       |
| --------------- | -------------------------------------------------------------- |
| `palette.ts`    | Raw colour scales. The only file with literal colours.         |
| `colors.ts`     | Semantic tokens (`background`, `text`, `primary`) x light/dark |
| `typography.ts` | Font sizes, weights and named `textVariants`                   |
| `spacing.ts`    | 4pt scale: `xs` 4 through `huge` 56                            |
| `radius.ts`     | `sm` 6 through `xxl` 28, plus `full`                           |
| `shadows.ts`    | Platform-aware elevation presets                               |
| `layout.ts`     | Gutters, touch targets, tab bar height, motion constants       |

Light and dark implement the same `ColorTokens` key set, so a component is
written once and is correct in both.

## Components (`src/components`)

**Primitives (`ui/`)**

- `Text` -- typography via `variant`, colour via a token key
- `Button` -- primary / secondary / ghost / danger, in sm / md / lg, with a loading state
- `IconButton` -- icon-only control; `accessibilityLabel` is required
- `Icon` -- wraps the icon set so it can be swapped in one file
- `Card` -- elevated / outlined / filled
- `Input` -- label, helper and error text; `bare` variant for use inside a card
- `Badge` -- status pill (Offline, Installed, and so on)
- `SearchField` -- search input with a leading glyph and a clear button
- `ListItem` -- the row used by settings, pickers and history; takes `selected`
  and `accessibilityLabel` for option lists
- `Divider`, `SectionHeader`
- `Spinner`, `LoadingState`, `LoadingOverlay`, `Skeleton`
- `EmptyState` -- icon, title, description, optional action

**Layout (`layout/`)**

- `Screen` -- safe areas, background, gutter, optional scrolling
- `ScreenHeader` -- large in-page title with optional actions

## Conventions

- Layout that never changes goes in `StyleSheet.create`; themed values are
  applied inline from `useTheme()`.
- Minimum touch target is 44dp (`layout.minTouchTarget`).
- Every interactive element carries an accessibility role and label.
- Loading and empty are first-class states, not afterthoughts. A screen with no
  data should still look finished.

## Screen slots

`Screen` carries the props that every route would otherwise reinvent:

- `header` -- pinned above the scroll area, so a title stays put
- `scrollable` -- wraps content in a ScrollView with the standard gutter and gap
- `keyboardAvoiding` -- enable on any screen with a text input
- `edgeToEdge`, `edges`, `contentStyle`

`ScreenHeader` takes `leading` (a brand mark or back affordance), `actions` and
`compact`. `Input` takes `inputStyle` for one-off field sizing, and `variant`
`bare` when it sits inside an existing surface.

## The AI coach (Academy)

The Academy's coach uses the brand blue as a deep gradient (`aiFrom` /
`aiTo`, with `onAi` ink),
softer `aiMuted` / `aiBorder` / `aiStrong` for the page, `aiGlow` for its
pulse, and `flame` for streaks. Gradients are drawn with
`experimental_backgroundImage`, like the header.

Its motion lives in `src/features/academy/components/motion.tsx` (pulse,
float, shake, pop, breathing, count-up, typing dots), timed by
`motion.loop`, `motion.stagger` and `motion.spring`. All of it runs on
Reanimated, which follows the phone's reduce-motion setting. Attention-seeking
loops run only while there is something to do — today's lesson not yet done.
