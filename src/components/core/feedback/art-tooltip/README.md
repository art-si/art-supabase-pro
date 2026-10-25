# ArtTooltip

`ArtTooltip` is the project-wide tooltip wrapper. It keeps Element Plus tooltip behavior and props while enforcing two shared interaction rules:

- tooltip arrows are always disabled;
- the arrowless surface uses a compact `6px` default offset;
- enter and leave motion uses the project motion tokens and respects reduced-motion preferences.
- poppers shift or flip within a 12px viewport inset so edge triggers do not create page scrollbars.

Use it instead of `ElTooltip` in pages and shared components. The default trigger slot and named `content` slot are supported, and any `popper-class` is merged with the shared `art-tooltip` class.

```vue
<ArtTooltip content="刷新数据" placement="bottom">
  <ArtIconButton icon="ri:refresh-line" label="刷新数据" />
</ArtTooltip>
```

Do not pass `show-arrow` or a custom `transition`; these policies are owned by the wrapper.
