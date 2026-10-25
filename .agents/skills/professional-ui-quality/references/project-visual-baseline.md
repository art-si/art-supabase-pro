# Project Visual Baseline

Use this baseline for every Create, Improve, or Review task. Treat existing shared components and theme tokens as the executable design system.

## Source Of Truth

Resolve conflicts in this order:

1. Explicit user direction, supplied screenshot, or approved Figma specification.
2. Current shared Art components, global tokens, and established behavior.
3. The closest polished workflow with the same business shape.
4. This reference as the fallback.

Do not copy accidental defects from a neighboring page. Preserve its valid structure and correct defects against the higher-priority sources.

The ESOP workflow is a user-approved visual reference for low-cardinality choices, status editing, information-rich tables, CRUD overlays, and attachment handling. For comparable business shapes, read [user-approved-esop-patterns.md](user-approved-esop-patterns.md) and reuse its decision rules without copying ESOP-specific content or forcing the pattern onto unsuitable workflows.

## Product Character

The product is an enterprise logistics and operations system. It should feel calm, precise, trustworthy, and efficient under sustained daily use.

- Favor neutral surfaces, indigo/blue theme accents, and restrained semantic colors.
- Keep information density high enough for operators while preserving clear grouping and scan paths.
- Use one restrained signature treatment per region, such as a strong workflow header, decision summary, operational status strip, or meaningful data visualization.
- Avoid ornamental gradients, glass effects, oversized marketing typography, novelty fonts, decorative icons, and excessive card fragmentation.
- Do not turn every row, metric, or label into a badge or rounded container.

## Tokens And Surface Roles

- Use `--default-box-color` for the primary component surface.
- Use `--art-gray-100` and `--art-gray-200` for subtle and filled neutral surfaces; confirm the fill is perceptible against its parent.
- Use `--art-gray-700` or a stronger established token for ordinary compact text when `--art-gray-600` does not meet readable contrast at its size.
- Use `--art-gray-800` and `--art-gray-900` for headings and high-priority content.
- Derive accent states from `--theme-color`; never introduce an isolated blue, purple, or gradient as a local brand color.
- Use semantic project tokens for success, warning, and danger. Pair status color with text or an icon.
- Use global radius tokens such as `--custom-radius`, `--art-control-radius`, `--art-surface-radius`, and Element Plus radius variables.
- Use the existing motion tokens: fast for hover/focus, base for ordinary enter/resize, and slow only for larger transitions. Enumerate animated properties and respect the global reduced-motion fallback.

## Hierarchy And Density

- Use the 4/8/12/16/24/32px rhythm unless an established component owns spacing.
- Keep a clear page identity, decision summary, main work area, and supporting evidence order.
- Keep form placeholders visually quieter than entered or selected values. Verify empty, filled, and disabled controls together before changing shared text tokens; a contrast check of isolated text samples does not prove that these states remain distinguishable.
- Align major edges across headers, query panels, tables, cards, and sticky action regions.
- Prefer tonal grouping and whitespace to stacks of bordered white cards.
- Keep one primary action per region. Secondary actions should remain available without competing for attention.
- Use concise titles, sentence-case labels, tabular numbers for comparisons, and stable column alignment.

## Theme And Box Modes

- `border-mode` expresses elevated controls with restrained borders or inset rings and no elevation shadow.
- `shadow-mode` expresses elevation with a soft theme-aware outer shadow and transparent border.
- Deliberately borderless tonal navigation is valid in both modes when its fill hierarchy is perceptible and keyboard focus remains visible.
- Validate light and dark theme tokens in the actual page. Do not infer dark-mode quality from light-mode CSS.

## Established Component Ownership

- Use `BusinessWorkspaceHeader` for persistent workflow identity where neighboring business pages already use it.
- Use `ArtTableQuery` for query/table/pagination workflows and its shared focus mode when persistent context exists above the table.
- Use `ArtDialog` and `ArtDrawer` for overlays, `ArtForm` for project form behavior, and `ArtSectionTitle` for section identity.
- Use `ArtSectionCard` for titled business content cards and let it own header spacing plus loading, empty, and error states.
- Use raw `art-card-xs` only for untitled compact surfaces or sticky action regions instead of recreating border, radius, background, and shadow locally.
- Use bounded `ElScrollbar` regions for long panels and overlays.

## Immediate Rejection Patterns

- Hardcoded theme accents or a page-local token system.
- Low-contrast metadata used as normal body text.
- Background variants whose fill is indistinguishable from the parent.
- Unexplained icons, decorative borders, double shadows, or inconsistent radii.
- Multiple equal-weight primary buttons in one region.
- Hidden valid operations used to make a table look cleaner.
- Desktop-only layout assumptions that create clipping or horizontal page scroll.
