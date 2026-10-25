# ArtWorkspaceSplitter

Standard two-pane workspace layout for a primary tree or navigator beside a detail or table region.

The component owns the shared splitter affordance, panel spacing, width constraints, and narrow-screen behavior. Use `narrow-mode="hide"` when the primary navigator has a drawer replacement, or keep the default `stack` mode when both regions should remain in normal document flow.

```vue
<ArtWorkspaceSplitter
  primary-size="280px"
  primary-min="248px"
  primary-max="380px"
  :breakpoint="1200"
  narrow-mode="hide"
>
  <template #primary>
    <FeatureTree />
  </template>

  <FeatureTable />
</ArtWorkspaceSplitter>
```

The primary and default slots receive full-height, flex-bounded containers. Slotted content must still provide `min-width: 0` and `min-height: 0` when it owns nested scrolling.

When stacked, the primary region defaults to `320px` high and the secondary region keeps a `520px` minimum height. Override these with `stacked-primary-size` and `stacked-secondary-min-size` when a feature needs different bounds.
