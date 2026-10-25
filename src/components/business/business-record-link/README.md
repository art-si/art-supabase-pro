# BusinessRecordLink

Compact business-record navigation. It renders a record label as a router link, button, or static title and can pair it with stable metadata and a description.

```vue
<BusinessRecordLink
  label="WH-001"
  description="华东危险废物暂存仓"
  :to="`/warehouse/${id}`"
  compact
/>
```

- Use `to` for navigable records and `interactive` plus `@click` for local detail workflows.
- Omit both for a static table identity cell.
- Long labels and descriptions truncate with their complete value available through `title`.
- Link foregrounds mix the current accent with the theme's primary text token so compact labels remain readable on their tonal surfaces in light and dark themes.
- Use `BusinessTableIdentityCell` when the record needs an icon-led table identity treatment.
