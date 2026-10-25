# ArtMaterialSelect

`ArtMaterialSelect` is the shared material-record selector for MDM, MES, and other business modules. It standardizes the material-category navigator, searchable material table, selected-record summary, pagination, and the canonical material columns used by production workflows.

```vue
<ArtMaterialSelect
  v-model="form.materialId"
  :selected-data="selectedMaterials"
  :api-fn="fetchMaterials"
  :categories="materialCategories"
  subtitle="选择后自动带入生产单位"
/>
```

The supplied `apiFn` receives `DataSelectFetchParams`. Read the selected category from `params.filters.categoryId`, keep tenant and permission enforcement in the API/database boundary, and return `{ data, total }`. Records must expose the canonical material selector fields (`materialCode`, `materialName`, `specificationModel`, `drawingNo`, category and material-type references).

Use `multiple` with `v-model:model-values` for batch selection. Single-selection workflows show the selected summary by default so the category, result, and confirmation regions remain consistent; pass `:show-selected-panel="false"` only when the available width cannot support it.

For a material-heavy workspace, pass `dialog-width` to size the picker without changing other material selectors. The underlying `ArtDialog` limits the width to the viewport.

Pass `label-key` when a business field should display a material property other than `materialName` (for example, `description`). Use `reset-draft-on-open` when each visit should start with an empty selection panel while keeping the already confirmed form value until a new choice is confirmed.

For a toolbar action instead of the default selection input, use the forwarded `trigger` slot. It receives `open`, `clear`, `selectedRows`, and `selectedKeys` from `ArtDataSelect`:

```vue
<ArtMaterialSelect multiple v-model:model-values="selectedIds" :api-fn="fetchMaterials">
  <template #trigger="{ open }">
    <ElButton type="primary" @click="open">参选物料</ElButton>
  </template>
</ArtMaterialSelect>
```
