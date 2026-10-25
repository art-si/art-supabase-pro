# ArtSectionCard

`ArtSectionCard` is the canonical titled business-section surface. It owns the shared `art-card-xs` surface, `ArtSectionTitle` header, actions, and loading, empty, and error states.

Use it for a titled content region that would otherwise assemble those primitives in a page. Keep `ArtPageSection` for borderless sections nested inside an existing surface, and keep raw `art-card-xs` for untitled surfaces such as compact summaries or sticky action bars.

```vue
<ArtSectionCard
  title="员工岗位准备度"
  subtitle="集中查看岗位建模、评估覆盖与实际达标情况。"
  :loading="loading"
  :error="loadError"
  :empty="!rows.length"
  empty-title="暂无员工"
  empty-description="调整筛选条件后重试。"
  @retry="loadData"
>
  <template #actions>...</template>
  <ArtTable :data="rows" />
</ArtSectionCard>
```

State priority is loading, error, empty, then content. Skeleton loading is the default so the card retains stable dimensions; use `loading-mode="mask"` only when existing content must remain visible during refresh.

Use the standard `title`, `subtitle`, and `actions` contract whenever possible. A specialized card may use `#header` to preserve a richer established header, but the slot must contain the complete header and must not recreate the card surface. Loading, empty, and error states still belong on `ArtSectionCard`.

When the whole card body owns the state but needs an established body layout class, pass it through `body-class`. Keep an inner `ArtAsyncState` only for a genuinely independent sub-region, such as a table whose search toolbar must remain available while the table is empty or reloading.

The card body uses an `ElScrollbar` by default, with its scrollbar beside the card edge and its content spacing inside the scroll region. Its thumb appears on hover or while scrolling; pass `scrollbar-always` to keep the thumb visible. Pass `scroll-max-height` (pixels or a CSS length) when the body needs a height limit. The scroll view fills a fixed-height card while still growing for longer content, so percentage-height content such as a 3D scene can fill the available space. Pass `:show-scrollbar="false"` when the content already owns its own scrolling region, such as a `height="100%"` table or nested `ElScrollbar`. `preserve-content-structure` keeps the caller's direct-child layout contract and bypasses the card scrollbar.

For an established grid or flex card whose direct-child structure is part of its layout contract, use `preserve-content-structure`. The default remains the wrapped async-state body; when loading, error, or empty becomes active, the shared state wrapper takes over automatically.
