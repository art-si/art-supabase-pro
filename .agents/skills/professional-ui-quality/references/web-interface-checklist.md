# Web Interface Checklist

Use the relevant sections during implementation. Use every section for a formal Review.

## Semantics And Keyboard

- Use native buttons, links, inputs, and headings for their intended roles.
- Ensure every flow is keyboard-operable in a predictable order.
- Give every focusable control a visible, unobscured `:focus-visible` state.
- Return focus after dialogs and drawers close; trap focus while modal content is open through the shared overlay components.
- Give icon-only actions an accessible name and an explanatory tooltip or title when meaning is not universal.
- Keep disabled controls non-interactive and explain permission limitations when users need to understand why.

## Contrast And Non-Color Cues

- Target WCAG AA contrast: at least 4.5:1 for ordinary text and 3:1 for large text and meaningful UI boundaries.
- Do not accept a color difference that is numerically present but visually imperceptible at 100% scale.
- Pair warning, success, error, selected, and workflow status colors with text, shape, or iconography.
- Verify contrast again in dark mode, selected rows, disabled states, tinted surfaces, and overlays.

## Targets And Pointer Behavior

- Keep interactive hit areas at least 24x24 CSS pixels on desktop; target 44x44 on touch/mobile surfaces unless an established dense composite control provides an equivalent operable target.
- Make the visual and interactive hit areas agree. Do not leave tiny icon glyphs as the only clickable pixels.
- Avoid hover-only access to required actions. Preserve keyboard and touch alternatives.
- Prevent duplicate submissions and show progress without replacing the original action meaning.

## Forms And Feedback

- Keep labels persistent and programmatically associated with fields; placeholders are examples, not labels.
- Preserve the visual distinction between placeholders, entered/selected values, and disabled content. Do not apply a body-text contrast fix indiscriminately to hint tokens; inspect actual input, select, tree, cascader, and date controls in both themes.
- Allow paste and browser autofill. Do not disable zoom.
- Put validation near the field and move focus to the first invalid field when the shared form abstraction supports it.
- Preserve entered values after a recoverable error.
- Make error messages actionable: state what failed and the next available action without exposing raw provider text.
- Distinguish content loading from confirm/submit loading in dialogs and drawers.

## Loading, Empty, Error, And Async States

- Avoid spinner flicker for very fast work; prefer the established loading primitive and stable layout dimensions.
- Keep loading labels meaningful, such as “保存中” or “生成中”, without changing the action vocabulary.
- Make empty states explain why the area is empty and offer the next valid action when one exists.
- Provide retry for recoverable failures and preserve surrounding context.
- Use optimistic updates only when rollback or failure recovery is clear.

## Layout, Reflow, And Content Resilience

- Verify representative desktop and narrow-desktop widths; include mobile when the workflow is intended to support it.
- At 200% zoom, keep content and controls usable without losing actions. Check reflow at stronger zoom when the page is mobile-capable.
- Prevent page-level horizontal overflow. Give flex/grid children `min-width: 0` where needed.
- Let headings, chips, badges, and localized labels wrap intentionally. If truncation is necessary, provide a full-value path.
- Test long names, large amounts, empty values, mixed Chinese/English text, and dense result sets.
- Ensure sticky headers, footers, and overlays do not cover focused controls or essential content.

## Motion And Perceived Performance

- Animate only properties that clarify state or spatial change; never use `transition: all`.
- Use the project's motion duration and easing tokens.
- Respect reduced-motion preferences and ensure the final semantic state does not depend on animation completion.
- Avoid large layout shifts by reserving image, chart, skeleton, and asynchronously loaded content dimensions.

## Navigation And State

- Keep entry, exit, back, cancel, and breadcrumb behavior predictable.
- Preserve meaningful filter, pagination, and selected state across refresh/back navigation when the existing architecture supports it.
- Make the current location and selected navigation item perceivable without relying only on color.
- Confirm destructive actions or provide a safe undo window appropriate to the operation.

## Content And Trust

- Name actions by their result: “保存更改”, “创建运单”, or “提交审核”, not a vague “确定”.
- Keep the same action vocabulary through button, loading, success, and error states.
- Use plain business language and remove internal field names, provider terminology, raw IDs, and unexplained technical values from ordinary UI.
- Format dates, money, counts, and units consistently within one workflow.
