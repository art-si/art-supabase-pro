# Chart selection for command screens

Choose the chart from the question, then tune its visual style.

| Question | Preferred forms | Avoid |
| --- | --- | --- |
| How is a value changing over time? | line, area, step line, column | pie, radar |
| Which category is larger? | sorted horizontal bar, column, lollipop | radar, unsorted pie |
| What is the composition of a total? | stacked bar, donut with few meaningful parts, treemap for many unequal parts | large single-slice pie, donut with many tiny parts |
| Where is work blocked in a process? | funnel only for true attrition, stage bars, Sankey for flow | decorative funnel with unrelated stages |
| How do multiple entities compare across the same dimensions? | grouped bar, small multiples, radar for one or two profiles with few dimensions | one radar polygon for unrelated counts |
| How are entities connected? | graph, Sankey, topology/lineage map | pie or treemap |
| Is a measure within a target? | bullet chart, progress bar, compact gauge | repeated large gauges |
| Where are events located? | map with clustered points, heatmap, route/flow map | map used as background decoration |

## Zero and sparse data

- Zero is data. Keep category names, stages, baseline, and units visible with low-contrast tracks.
- Missing data is a state. Use one compact message and, where possible, collapse the panel or allow a neighboring panel to span the freed grid area.
- One positive category among many should use a bar or ranked list. A full circular slice overstates its importance and wastes space.
- For fewer than three categories, prefer bars over treemaps.
- Keep labels horizontal. Truncate long labels with a tooltip or shorten the business name at the data boundary.

## Plot fitting

Reserve a fixed heading zone, then let the chart canvas use the remaining width and height. Check ECharts `grid`, `center`, `radius`, and legend bounds at the smallest supported viewport. Legends should sit outside marks without shrinking the plot below its useful size.
