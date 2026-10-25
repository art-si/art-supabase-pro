---
name: data-wall-design
description: Design, implement, or audit full-screen operational dashboards and command-center data walls. Use for large-screen Vue/ECharts/3D pages where grid alignment, information density, chart choice, typography, empty states, motion, or visual hierarchy determine whether the screen is readable at a glance.
---

# Data Wall Design

Build the screen around a business question and a viewing distance. Treat visual impact as a result of hierarchy, scale, contrast, and motion that communicates state.

## Working method

1. State the screen's audience, decision, primary signal, secondary evidence, and alert/action path before changing layout.
2. Rank content as primary, supporting, or contextual. Give the primary signal the largest continuous region. Remove repeated KPI cards, decorative status strips, and panels that do not change a decision.
3. Establish shared horizontal guides. Panels that visually share a row must start and end on the same grid lines. Use one spacing rhythm and let charts fill their allocated panel after the heading.
4. Select charts by analytical task. Read [chart-selection.md](references/chart-selection.md) when choosing or replacing visualizations.
5. Use 3D as one focal layer for topology, geography, or system state. Keep quantitative comparison in 2D charts and text outside the 3D scene.
6. Design loaded, zero, empty, error, refreshing, overflow, and fullscreen states. A valid zero dataset should retain axes or stages at low contrast; missing data should use a compact explanation and surrender unused space when another panel can answer a stronger question.
7. Verify in a real browser at the target viewport and one narrower viewport. Read [audit-checklist.md](references/audit-checklist.md) for the final pass.

## Visual system

- Keep one dominant accent per business domain. Reserve green, amber, and red for success, warning, and danger semantics.
- Use bright white only for titles, primary numbers, and active state. Labels and explanatory copy use lower contrast.
- Keep Chinese labels short and natural. Hide raw codes, implementation terms, and redundant English eyebrows when they compete with the Chinese title.
- Prefer a restrained dark surface with visible panel boundaries. Decorative lines and glows must not become additional content bands.
- Avoid large single-slice pies, oversized empty-state illustrations, 3D charts for precise comparison, and legends that consume more space than the marks.
- Animate state changes, flow, and attention cues. Keep ambient motion slow, avoid simultaneous pulsing across every panel, and honor reduced-motion preferences.

Read [principles.md](references/principles.md) when establishing a new screen family or resolving competing visual directions.
