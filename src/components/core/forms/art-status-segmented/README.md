# ArtStatusSegmented

`ArtStatusSegmented` is the shared compact status filter for list workspaces that display a count beside every status. It keeps the active item, count badge, responsive icon behavior, and spacing consistent across business modules.

```vue
<ArtStatusSegmented
  :model-value="query.status || ''"
  :options="statusOptions"
  aria-label="任务状态快捷筛选"
  @update:model-value="handleStatusChange"
/>
```

Each option must provide `label`, `value`, and a numeric `count`; `icon` is optional. Use this component only when the segmented control represents status counts. Ordinary mode or category switchers should continue to use `ElSegmented` directly.
