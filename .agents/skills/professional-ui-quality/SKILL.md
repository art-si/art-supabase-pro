---
name: professional-ui-quality
description: Design, improve, review, and visually verify professional user-facing UI for art-supabase-pro. Use for any Vue page, component, dashboard, table, form, dialog, drawer, navigation, empty/loading/error state, responsive layout, theme treatment, accessibility review, UI audit, screenshot comparison, or visual polish under src. Apply to routine frontend changes even when the user asks only for functionality, and use the formal review mode when the user asks to assess UI quality without implementation.
---

# Professional UI Quality v2

Treat visual quality, usability, accessibility, and rendered verification as feature requirements. Produce UI that belongs to this product instead of a generic template.

## Select The Operating Mode

Choose one mode before acting:

- **Create**: new page, new workflow, or substantial redesign. Read [project-visual-baseline.md](references/project-visual-baseline.md), [user-approved-esop-patterns.md](references/user-approved-esop-patterns.md), [creative-direction.md](references/creative-direction.md), and [web-interface-checklist.md](references/web-interface-checklist.md).
- **Improve**: targeted polish or feature work inside an established page. Read [project-visual-baseline.md](references/project-visual-baseline.md), [user-approved-esop-patterns.md](references/user-approved-esop-patterns.md) when the work involves choices, status fields, tables, CRUD overlays, or attachments, and the relevant sections of [web-interface-checklist.md](references/web-interface-checklist.md). Preserve the established page language unless the user requests a redesign.
- **Review**: visual, UX, accessibility, PR, or design-system audit. Read [project-visual-baseline.md](references/project-visual-baseline.md), [web-interface-checklist.md](references/web-interface-checklist.md), and [review-rubric.md](references/review-rubric.md). Report findings; do not implement fixes unless requested.

Use [review-rubric.md](references/review-rubric.md) for every formal score, approval decision, or final quality report. Do not load creative guidance for a narrow maintenance change with a fixed visual direction.

## Establish The UI Contract

Before implementation or review, identify:

1. The user's primary job and the one action that should dominate the region.
2. The information hierarchy: identity, decision summary, main work area, and supporting evidence.
3. The required states: success, loading, empty, error/retry, disabled/permission-limited, selected, long content, and dense data.
4. The viewport, theme, box-mode, localization, and permission constraints that can change the result.
5. The source-of-truth order: explicit user reference or Figma, existing project system, polished neighboring workflow, then this skill's defaults.

Inspect the target, child modules, relevant Art/Element Plus APIs, and at least one polished neighboring workflow before making visual decisions.

### User-approved page references

The user identifies starred or explicitly praised pages as preferred design references. For every new business page or substantial redesign, inspect a reachable approved page in the running app and its implementation, then compare the new page at the same viewport. The user's screenshots and named references take priority over an inferred star list. The “角色与权限” page is one named reference; choose a closer approved workflow when its business structure fits better.

The star in the global header is `PageDesignReference`, a platform-super-only control. Its saved references live in `public.ai_ui_design_reference` (route, title, preference tags, note, and style snapshot), with optional images in `public.ai_ui_design_reference_image`. For each new page or substantial redesign, read the current saved references through the scoped Supabase MCP when available, choose the closest approved business shape, and inspect that page's implementation and rendered UI. This is a read-only design lookup; never alter the platform-super gate or expose its management UI to ordinary users. The super-admin session may be in a separate incognito browser that the available browser tools cannot reach. Do not confuse the adjacent “快捷入口” popover with the star or infer an empty list from an ordinary session. If the saved records or browser are unavailable, use the supplied screenshots and named pages, then state exactly which references were verified. Carry over the reference page's information hierarchy, action placement, search/table integration, full-height behavior, focus-mode control location, spacing, and state treatment. Adapt the business content rather than copying decorative details. In a table workspace, avoid an extra titled strip or duplicate refresh control when the page header and `ArtTableQuery` already cover those jobs.

## Build With Project Identity

- Apply `art-supabase-pro-conventions` together with this skill.
- Reuse Art components, Element Plus primitives, theme tokens, global radii, and existing layout patterns. Extend a shared pattern before copying it into several pages.
- Keep the product calm, precise, trustworthy, and operationally dense. Make one visual idea carry the region; keep surrounding treatment disciplined.
- Use typography, spacing, grouping, tonal contrast, and alignment before decoration.
- Derive interactive colors from `--theme-color`. Never hardcode a product accent or create a competing local design system.
- Prefer `ArtTableQuery`, `ArtDialog`, `ArtDrawer`, `ArtForm`, `ArtSectionCard`, `ArtSectionTitle`, and bounded `ElScrollbar` regions where their established responsibility applies. Use `ArtSectionCard` for titled content surfaces with loading, empty, or error states; reserve raw `art-card-xs` for untitled compact surfaces and sticky action regions.

## Enforce Perceptible Hierarchy

- A background, filled, tonal, selected, or elevated variant must be visibly distinct at actual rendered size. A technically different but imperceptible color is a defect.
- Preserve readable neutral, hover/focus, and current/selected levels. Do not rely on color alone for business status.
- For deliberately borderless tonal navigation, create separation with fill contrast; reserve a ring for keyboard focus instead of adding a decorative border.
- In `border-mode`, elevated controls use the project's border/inset-ring language without elevation shadows.
- In `shadow-mode`, elevated controls use a restrained theme-colored outer shadow with a transparent border.
- Validate light/dark themes and both box modes whenever a shared interactive surface changes.

## Complete Interaction And Content

- Use semantic interactive elements, visible `:focus-visible` treatment, accessible names, and forgiving hit areas.
- Keep labels action-specific. Helper, empty, and error copy must explain consequences or the next useful action.
- Employee/person controls must show recognizable identity through `ArtEmployeeSelect` (`员工姓名 · 工号`, with organization/position context in the picker); exposing a UUID as option or selected text is a UI defect.
- Do not block paste or browser zoom. Respect reduced motion and avoid decorative animation that delays work.
- Prevent accidental horizontal scrolling. Use `min-width: 0`, wrapping, truncation with a full-value path, and responsive grids intentionally.
- For table workspaces, preserve query, table, operation, pagination, loading, empty, and focus-mode behavior as one workflow.
- Do not hand-compose a titled card from `art-card-xs`, `ArtSectionTitle`, `ElSkeleton`, and `ArtEmptyState`. Route whole-card state through `ArtSectionCard` so header spacing, state priority, retry behavior, and responsive actions remain consistent. Retain an inner `ArtAsyncState` only when it controls a distinct sub-region and adjacent filters, actions, or metrics must stay visible.
- Size fixed operation columns from rendered controls and intentional gaps; do not hide valid actions merely to make the column narrower. Use `BusinessTableRowActions` for table-row icon actions so every module inherits the same 8px spacing; do not recreate row-action spacing in page-local styles.

## Verify The Rendered Result

### Mandatory icon and text alignment

- Every inline icon and label in buttons, dropdown menu items, segmented choices, tabs, links, and status labels must be vertically centered as one flex group with visible spacing. Use the shared `art-icon-label` class for custom groups and the global Element Plus control rules for library controls; never align them with baseline offsets or page-local margin nudges.
- Use `--art-control-icon-gap` (8px) normally and its compact token (6px) only for small controls. Remove icon margins when the parent gap owns spacing. Default 14px labels use 16px icons; scale both together for other control sizes. Keep standalone icon buttons, section illustrations, and metric icons sized for their own hierarchy.
- Apply the same rule to teleported dropdowns and nested label wrappers. Compare with `ArtButtonMore`: the icon and right-hand text must have aligned vertical centers, a consistent gap, and balanced visual size. Long labels must retain spacing and avoid clipping.
- Verify rendered center alignment, spacing, and icon/text size in the browser, including selected/disabled states and light/dark themes. Source classes alone do not satisfy this requirement.

Run focused formatting, ESLint, type checking, and the repository UI audit. When CSS or SCSS changes, run focused Stylelint as a separate gate; ESLint and `ui:audit` do not replace it. Then verify the affected workflow in a real browser.

Use the bundled browser audit when a locally reachable URL is available:

```powershell
pnpm.cmd exec node .agents/skills/professional-ui-quality/scripts/visual-audit.mjs --url "http://127.0.0.1:3006/#/route" --selector ".target-root" --viewports "1440x900,1280x800"
```

Add `--themes "light,dark"`, `--box-modes "border-mode,shadow-mode"`, and `--storage-state "playwright/.auth/user.json"` when those variants are relevant. Read the generated JSON report and inspect every screenshot at 100% scale. The script is evidence collection, not a substitute for visual judgment.

Use test or sanitized data for screenshots. Keep generated evidence under the ignored `.artifacts` directory; do not commit or share screenshots that contain tenant, customer, credential, financial, or personal data.

Check at minimum:

- initial and lower scrollable content;
- alignment, clipping, wrapping, horizontal overflow, and sticky regions;
- relevant loading, empty, error, disabled, selected, and long-content states;
- keyboard focus, interaction feedback, console errors, and narrow desktop behavior;
- light/dark and box-mode variants affected by shared styling.
- for every new or modified `ArtTableQuery` page with focus mode, enter focus mode in the browser and confirm that the hero, metrics, and unrelated page siblings are removed; composite navigation context, filters, actions, table, pagination, and complete UI states remain correctly sized without clipping or overflow; then exit with both the visible control and `Esc` and confirm the original layout and search visibility are restored. A switch that changes state without changing the rendered layout fails this gate.

Do not declare completion from source review alone. If browser verification is impossible, state that the visual gate remains provisional.

## Report The Outcome

For a requested comprehensive UI audit or substantial refinement, also read the local `impeccable` skill's project adapter and the relevant audit/polish references. Use its diagnostic methods to deepen hierarchy, cognitive-load, design-system drift, state, and content review. This skill's baseline, evidence requirements, severity, scoring, and verification gates remain authoritative. Deterministic detector findings are candidates until verified in context; unfamiliar fonts, dense tables, semantic colors, intentional internal scrolling, and approved page shapes are not defects merely because they differ from upstream aesthetic defaults.

For implementation, lead with the visible result, then list verification evidence and limitations. For reviews, use the severity, scoring, evidence, and verdict format in [review-rubric.md](references/review-rubric.md). Keep findings concrete and tied to a rendered or source artifact.

## Design Tool Policy

Use Figma when it is the supplied source of truth, collaborative approval is required, or exact token handoff is needed. Do not require Figma for routine code-first improvement; the live product and project design system remain authoritative.
