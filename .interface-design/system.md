# Interface Design System

## Direction

Build calm, information-dense enterprise workspaces with clear hierarchy, compact controls, restrained color, and consistent operational feedback. Prefer the established shared shells and tokens over page-local visual inventions.

## Design-reference memory

- Platform-super-marked routes in `public.ai_ui_design_reference` are the living evidence for the owner's preferred UI direction.
- Before designing or materially restyling a page, load the active route references and inspect the current referenced modules as a whole. Explicit instructions in the current task always take precedence.
- Treat each marked route as evidence for the owner's preferred overall module style. Reuse its hierarchy, density, spacing rhythm, table treatment, status expression, and interaction patterns when they fit the new page's job.
- Never collect screenshots, customer records, identifiers, or business values automatically. Platform-super users may deliberately attach private reference screenshots; treat their contents as design evidence and never reproduce business values into unrelated pages.
- If a referenced route or source revision has changed, inspect the current route before relying on the saved preference.
- If the database context is unavailable, use this document and the repository's shared components as the fallback, and state that live preference references were not available.

## Established patterns

- Use `BusinessWorkspaceHeader` for operational list/workspace pages and `ArtPageHeader` for standalone detail or configuration pages.
- Keep page identity on the left and compact operational actions on the right.
- Place the platform-super-only route design-reference star in the global application header, immediately after the “refresh current page” control. Do not repeat it inside page content headers. Open the shared design-reference dialog for private screenshots, tags, and notes.
- Prefer compact tables, short search rows, semantic status tags, and one clear primary action per region.
- Use theme tokens, existing spacing tokens, and shared interaction components. Preserve dark mode, responsive behavior, focus visibility, loading, empty, error, and disabled states.
- Use `ArtIconButton` for icon-only actions. Keep its compact project-standard corner radius; do not turn routine actions into circular controls. Reserve true circles for semantic dots, avatars, chart marks, map markers, and color swatches.
- Keep icon-and-label controls vertically centered with the shared `--art-control-icon-gap` rhythm. `ElButton`, `ElTag`, and `ElLink` already inherit it; custom native controls must use `.art-icon-label` instead of page-local icon margins.
- Keep card and section header actions beside the title whenever their intrinsic widths fit. Let the shared flex header wrap naturally only when the container cannot hold both; do not force action rows with viewport-only breakpoints or oversized title flex bases.
- Keep loading feedback inside the initiating icon action: rotate the existing icon while preserving the action's size and identity. Do not inject a second spinner or replace the icon with loading text.
- Use `variant="solid"` only for a genuinely primary icon action such as send/submit; routine refresh, navigation, collapse, close, and row-tool actions stay on the default ghost treatment.

## Access boundary

- The design-reference control and persisted records are for the platform super administrator only.
- Ordinary users must not see the control or read/write the reference records.
