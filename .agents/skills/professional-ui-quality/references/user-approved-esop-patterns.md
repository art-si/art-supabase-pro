# User-Approved ESOP UI Patterns

Use this reference when designing or improving low-cardinality choices, status fields, data tables, CRUD dialogs or drawers, and attachment workflows. The user explicitly approved the ESOP examples as the preferred visual direction. Preserve the underlying business task and project component system; do not clone ESOP labels, structure, or decoration mechanically.

## Visual Character

- Keep the composition calm, light, precise, and operationally dense: white or neutral surfaces, subtle dividers, restrained theme-tinted fills, and one clear accent hierarchy.
- Prefer a small meaningful icon in a softly tinted square beside identity content. Icons support scanning; they do not replace labels or become decoration in every cell.
- Create depth through grouping, whitespace, typography, and quiet tonal contrast. Avoid heavy borders, oversized cards, strong shadows, gradients, and excessive pills.
- Keep primary actions filled and visually dominant. Use outlined or quiet treatments for secondary actions and semantic color only where it communicates meaning.

## Compact Choices And Status

- When a field has roughly two to four stable, mutually exclusive choices and seeing the alternatives improves the decision, prefer an inline segmented control or compact selectable cards over a dropdown.
- Use a segmented control for short states such as `启用 / 停用`, modes, or binary classifications. The selected segment must have an immediately perceptible fill, readable text, keyboard focus, and a non-color cue where the meaning is safety-critical.
- Keep segmented controls compact and proportional to their labels. Do not stretch a two- or three-option control across a wide dialog row; preserve intrinsic width by default, and only opt into a bounded local width when its containing field is already narrow.
- Use compact selectable cards when each choice benefits from a title, icon, or one-line explanation. Keep the cards small enough that the form still reads as a form rather than a card gallery.
- Retain a select, cascader, tree selector, or searchable business selector for long, dynamic, hierarchical, remote, or space-constrained option sets. Do not turn five or more ordinary options into a row of cramped segments.
- In `ArtForm`, reuse an existing segmented or choice-card control. If the capability is broadly missing, extend the shared form/core control instead of creating page-local markup.

## Information-Rich Tables

- Give the primary entity column a compact identity treatment: meaningful icon or file-type mark, strong title, and stable secondary metadata such as code, version, or category on a quieter line.
- Use small inline icons for genuine relationships or scope metadata such as product count, route count, attachment type, or ownership. Pair icons with text or a tooltip; do not make users decode unexplained symbols.
- Render business status as a restrained semantic tag or badge, while keeping ordinary categorical values as text unless they need emphasis.
- Use compact icon actions for familiar row operations such as view and edit, with accessible names, tooltips, visible focus, and forgiving hit areas. Put infrequent operations in the established more-actions control without hiding valid primary actions. Render row action groups through `BusinessTableRowActions`, which standardizes an 8px gap and clears legacy per-button margins; do not duplicate this spacing in feature SCSS.
- Keep column headers, row alignment, whitespace, and metadata hierarchy doing most of the visual work. Avoid adding an icon, badge, or tinted box to every cell.

## Create And Edit Overlays

- For medium or complex records, prefer a comfortably wide `ArtDialog` or `ArtDrawer` with a compact identity summary at the top, followed by tabs or clearly titled sections when the content has distinct concerns.
- Use a responsive form grid: wider fields for names and descriptions, narrower fields for version, date, sort, and status. Align labels and controls across columns; collapse cleanly at narrow desktop widths.
- Introduce a section with a concise title and one-line purpose or completeness hint when it helps the user understand what must be finished. Do not repeat obvious instructions.
- Keep the content region scrollable and the cancel/save actions stable at the bottom. Use the project's overlay and `ElScrollbar` contracts rather than page-local scrollbar behavior.
- Show current identity and status in the summary header when editing, so users can confirm which record they are changing before scanning the form.

## Attachment Area

- Treat attachments as a distinct form section near the related record fields, not as a bare file input squeezed into a grid cell.
- Use `ArtUploadFile` for generic documents. Present a clear choose/drop affordance, accepted-format and size guidance, and an in-place file list with recognizable file identity.
- Keep each file row compact and support the valid actions for the workflow, such as preview, download, replace, or remove, with accessible icon controls.
- Use a restrained dashed or tonal boundary to express the upload target. It should read as an intentional working area, not a decorative card nested inside several other cards.
- Include loading, upload progress, validation failure, empty, existing-file, permission-limited, and long-filename behavior in implementation and visual verification.

## Adaptation Rule

Apply the smallest matching pattern:

- few stable choices -> segmented control or compact choice cards;
- scannable record list -> icon-led identity cell plus restrained metadata;
- complex create/edit -> identity summary, grouped responsive form, stable footer;
- document-bearing record -> dedicated attachment section with managed file rows.

If a workflow does not match one of these shapes, use the project visual baseline and the closest polished workflow instead. A user-supplied reference for the current task always outranks this preference.
