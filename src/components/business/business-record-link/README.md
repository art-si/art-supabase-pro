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
- Custom action or permission hints retain the complete record label in the title. Titles already containing the label are preserved without duplication.
- Link foregrounds mix the current accent with the theme's primary text token so compact labels remain readable on their tonal surfaces in light and dark themes.
- Use `BusinessTableIdentityCell` when the record needs an icon-led table identity treatment.
