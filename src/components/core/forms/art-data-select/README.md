# ArtDataSelect

`ArtDataSelect` provides shared table and tree selectors for single- and multi-select workflows.

## Variants

- `table-single.vue`: paged or local table single select.
- `table-multiple.vue`: paged or local table multiple select with a selected summary panel.
- `tree-single.vue`: hierarchical single select.
- `tree-multiple.vue`: hierarchical multiple select with independent parent/leaf selection by default.

All variants delegate to `index.vue` and share the contracts exported by `types.ts`.

The base and all four variants infer a record type from `data`, `selectedData`, and `apiFn`; selection events return that type without requiring business DTO index signatures or caller casts. Use `DataSelectApiFn<MyRecord>` and `DataSelectFetchResult<MyRecord>` when explicitly declaring a loader. Display placeholders created for unresolved model keys retain their key and label, but are excluded from emitted business records until the source or `selectedData` supplies the complete record.

`DataSelectColumn<MyRecord>` and the key, label, description, disabled, dictionary-value and tag callbacks use the same inferred record type. Unresolved display placeholders never enter these business callbacks. Both single and multiple input triggers expose an accessible “清空” button when a value is selected and `clearable` is enabled.

Common defaults live in `defaults.ts`; keep array defaults as factories so instances never share mutable state. Table single selectors enable pagination by default for an `api-fn` remote source and disable it for local data; an explicit `show-pagination` always takes precedence. Table multiple enables pagination and the selected panel, tree multiple enables the selected panel, and tree single disables both. The base component keeps pagination enabled and derives selected-panel visibility from `multiple` unless explicitly set.

## Data contract

- Use `row-key` for the stable record identifier and `label-key` for the primary display text.
- Use `description-key` for compact secondary context such as a code or owner.
- For tree data, use `children-key` and `disabled-key`; disabled nodes remain readable as grouping context but cannot be selected.
- When a selected value may not exist in the current page of results, provide `selected-data` so its label and description remain available.
- Remote loaders use `api-fn` and should return a list plus an optional total. Loading, empty, selected, and pagination states are owned by the component.
- Table variants can receive a `navigation` object for a reusable left-side hierarchy. Pass flat records plus the row, parent, label, and description keys; selecting a node adds its key to `api-fn` filters under `navigation.filterKey`. Keep descendant-expansion rules in the provider, where tenant and permission scope can be enforced.

## Request lifecycle and recovery

Only the latest load may update rows, totals, loading state, or table/tree selection synchronization. Closing/unmounting invalidates unfinished work; replacing `api-fn` while open resets the page and loads the new source. This is result invalidation, not transport cancellation.

A thrown/rejected loader error or a returned `error` is shown through the shared inline retry state, never as an empty successful result. Search and selected rows stay available, and retry reuses the current query. Confirmation is disabled while loading or after failure; cancel stays available. `load-error` exposes the current raw diagnostic cause through all four variants; do not display that raw value or add another generic error toast. Providers retain responsibility for access control and any existing business-specific notifications.

## Visual behavior

The dialog is one split workspace rather than separate nested cards: the source list or tree is the primary pane, and the optional selected summary is a quieter secondary pane. Keep business-specific labels and icons outside this core component; use `label-key` and `description-key` to provide meaningful context.

The search/list/selected workspace shares a viewport-bounded height, with pagination outside the list body. Desktop panes scroll their own list/tree and selected entries. Narrow screens stack the panes and scroll the workspace when necessary; the main pane retains 320px so navigation and selected summaries cannot squeeze data rows underneath the table header. The dialog footer stays outside this workspace and pagination controls may wrap. Keep the outer viewport bound and verify actual row selection at low heights when adjusting these dimensions.

默认三栏参选（分类导航、列表、已选区）使用 1440px 宽度并由 ArtDialog 限制在视口内；显式 dialogWidth 仍优先。侧栏响应视口宽度；分页按列表区域实测宽度选择常规或紧凑控件，极窄区域保留上下页、每页数量与当前页信息，避免桌面分页换行挤占列表。
