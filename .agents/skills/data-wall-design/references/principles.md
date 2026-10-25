# Data wall design principles

## Decision hierarchy

A data wall should answer one operational question in a few seconds. Organize the reading order as overview, diagnosis, then action. The highest-value signal belongs at the visual center or upper-left focal area; related evidence stays adjacent. Detail that does not affect monitoring belongs behind drill-down or outside the screen.

Use differences between domain screens to express different business stories:

- operations: flow, throughput, queues, exceptions;
- safety: risk distribution, location, severity, closure;
- finance: liquidity horizon, exposure, aging, blocked transactions;
- assets: health, load, lifecycle, maintenance window;
- governance: lineage/topology, rules, quality, distribution state;
- workforce: capacity, movement, structure, upcoming risk;
- AI: usage, quality, model/input/output risk, review closure.

## Grid and density

- Use a stable outer frame and explicit row/column guides. Adjacent panel edges should align within one CSS pixel at the target viewport.
- Do not insert a row only for system abbreviations, slogans, or decorative status. Put essential freshness and connectivity in the header.
- A panel must either fill its plot area or release space. Avoid a tiny mark floating in a tall card.
- Prefer fewer, larger panels to a wall of equal cards. Keep KPI rails to the minimum set needed to establish context.
- Give headings a consistent reserved height so chart canvases start on the same line.

## Typography

Establish four roles: screen title, primary value, panel title, and supporting label. Increase size and weight only when moving up this hierarchy. Use tabular numerals for metrics. Keep units smaller and lower contrast. Avoid bold white paragraphs; supporting sentences should be concise and muted.

For a 1920-pixel-wide browser canvas, a useful starting range is:

- screen title: 20–28 px;
- primary value: 28–56 px depending on focal role;
- panel title: 14–18 px;
- labels/legends: 10–13 px, verified against viewing distance.

Scale from the logical canvas and verify on the physical display; these values are starting points rather than fixed requirements.

## Color and motion

Use a domain accent plus semantic colors. Preserve luminance separation between text, grid, panel, and background. Keep categorical palettes discriminable and small. Avoid using several neighboring neon hues with equal visual weight.

Motion should reveal updates, direction, or cause. Use entrance animation once, update transitions when data changes, and slow ambient 3D motion around one focal scene. Stop or simplify motion under `prefers-reduced-motion`.

## Source synthesis

- The referenced Gitee bigscreen collection emphasizes business-first layout, overview-before-detail, target-display testing, semantic color, and real-screen visual QA: https://gitee.com/AiShiYuShiJiePingXing/bigscreen
- Apache ECharts provides the production chart primitives and responsive/accessibility capabilities: https://echarts.apache.org/en/
- Grafana recommends one question/story per dashboard, reduced cognitive load, meaningful color, normalized comparisons, and consistent reusable panels: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
- Microsoft Power BI recommends one-screen storytelling, removing nonessential tiles, prominent key metrics, simple comparison charts, consistent scales, and restrained circular charts: https://learn.microsoft.com/en-us/power-bi/create-reports/service-dashboards-design-tips
- Tableau Blueprint reinforces logical visual flow, simplified layouts, and discoverable interaction: https://help.tableau.com/current/offline/en-us/tableau_blueprint.pdf

The case library contains many older visual conventions. Reuse its information architecture and density lessons; reassess bevels, 3D pies, excessive decoration, tiny type, and hard-coded aspect ratios against current accessibility and responsive requirements.
