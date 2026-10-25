# ArtEntitySummary

`ArtEntitySummary` provides the shared compact identity/context surface used at the top of dialogs, drawers, and focused business sections. It keeps the icon, eyebrow, title, description, optional status/actions, box mode, and narrow-width behavior consistent.

```vue
<ArtEntitySummary
  icon="ri:file-shield-2-line"
  eyebrow="CONTROLLED WORK INSTRUCTION"
  title="设备安装手册"
  description="ESOP-ASM-001"
>
  <template #aside>
    <ArtDictDisplay dict-code="commonEnabledStatus" value="enabled" display="tag" />
  </template>
</ArtEntitySummary>
```

Use `compact` for a short explanatory context block. Keep record-specific fields and actions outside the component; the summary identifies the current object or decision context and does not replace form sections.
