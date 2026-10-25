# ArtTreeExpandToggle

`ArtTreeExpandToggle` provides the standard icon-only action for expanding or collapsing every loaded branch of an Element Plus tree.

Use it in an `ArtSectionCard` `actions` slot and pass the rendered tree instance, its nested data, and the configured node-key field. The component only controls loaded nodes; it does not fetch lazy children or change card layout.

```vue
<template #actions>
  <ArtTreeExpandToggle
    :tree="treeRef"
    :data="treeData"
    node-key="id"
    label="组织树"
    default-expanded
  />
</template>
```
