# BusinessTableIdentityCell

Canonical identity treatment for primary business-record columns in `ArtTable` and `ArtTableQuery`.

```vue
<BusinessTableIdentityCell
  :primary="record.name"
  :secondary="record.code"
  :tertiary="record.categoryName"
  icon="ri:archive-drawer-line"
  icon-tone="warning"
/>
```

- Primary and secondary values fall back to `—`; tertiary content is optional.
- Long values truncate with their complete value available through `title`.
- `iconTone` accepts `primary`, `success`, `warning`, `danger`, and `info`.
- Keep links and local detail actions in `BusinessRecordLink`; this component is display-only.
