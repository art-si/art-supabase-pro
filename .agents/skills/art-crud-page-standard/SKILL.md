---
name: art-crud-page-standard
description: Use when creating or refactoring standard CRUD list pages in art-supabase-pro, especially pages modeled after vehicle-manage-system/basic-info/insurance-company with ArtTableQuery, headerActions, ArtDialog, ArtForm, import/export, batch delete, and typed API-driven list/detail workflows.
---

# Art CRUD Page Standard

Use this skill for normal CRUD pages under `src/views/**`. The reference implementation is:

- `src/views/vehicle-manage-system/basic-info/insurance-company/index.vue`
- `src/views/vehicle-manage-system/basic-info/insurance-company/modules/insurance-company-dialog.vue`

Also follow the base project conventions in `art-supabase-pro-conventions`.

## Page Shape

Use one page entry plus feature modules:

```text
src/views/<domain>/<feature>/index.vue
src/views/<domain>/<feature>/modules/<feature>-dialog.vue
```

The list page owns:

- `ArtTableQuery`
- search model and search items
- table columns
- toolbar `headerActions`
- row operation buttons
- list API parameter adaptation
- dialog ref and success refresh behavior

The dialog module owns:

- `ArtDialog`
- `ArtForm`
- form state
- validation rules
- add/edit initialization
- add/edit submit API calls
- success emit

## List Page Template

Use `ArtTableQuery` in internal managed mode.

```vue
<template>
  <div class="art-full-height">
    <ArtTableQuery
      ref="tableQueryRef"
      v-model="table.searchQuery"
      :search-items="table.searchItems"
      :api-fn="fetchTableData"
      :columns-factory="table.columnsFactory"
      :header-actions="table.headerActions"
      :table-props="table.props"
    />

    <FeatureDialog ref="dialogRef" @success="handleSaveSuccess" />
  </div>
</template>
```

Do not manually compose `ArtSearchBar + ArtTableHeader + ArtTable` for normal CRUD pages.

## Types

Define business types near the top:

```ts
type RecordItem = Api.Domain.Feature.RecordItem
type SearchParams = Api.Domain.Feature.SearchParams
type TableParams = SearchParams & Pick<Api.Common.PaginationParams, 'current' | 'size'>

interface DialogExpose {
  handleOpen: (row?: RecordItem) => Promise<void>
}
```

Rules:

- Type rows, search params, table params, dialog expose, and columns.
- Avoid `Record<string, any>` in business code unless bridging a generic component API.
- Use `interface` for contracts and `type` for aliases/unions.

## Search

Keep search state explicit and aligned with API params:

```ts
const searchQuery = ref<SearchParams>({
  name: '',
  phone: ''
})

const searchItems = computed<SearchFormItem[]>(() => [
  { label: '名称', key: 'name', type: 'input' },
  { label: '电话', key: 'phone', type: 'input' }
])
```

Rely on `ArtForm`/`ArtSearchBar` defaults for common `clearable`, `filterable`, and placeholder behavior. Only pass props when the business needs a different value.

## Group Related Variables

Group variables by workflow on every CRUD page. Prefer one typed `table` group on the list page and one typed `form` group in the dialog instead of separate top-level search, column, action, form-data, form-item, and rule variables.

```ts
interface TableGroup {
  searchQuery: SearchParams
  searchItems: ComputedRef<SearchFormItem[]>
  headerActions: ComputedRef<ArtTableQueryHeaderAction[]>
  columnsFactory: () => ColumnOption<RecordItem>[]
  props: {
    rowKey: string
  }
}

const table: UnwrapNestedRefs<TableGroup> = reactive<TableGroup>({
  searchQuery: createInitialSearch(),
  searchItems: computed(() => []),
  headerActions: computed(() => []),
  columnsFactory: () => [],
  props: {
    rowKey: 'id'
  }
})
```

```ts
interface FormGroup {
  data: FeatureForm
  items: FormItem[]
  rules: FormRules
}

const form: Ref<FormGroup> = ref({
  data: createInitialForm(),
  items: computed(() => []),
  rules: computed(() => ({}))
})
```

Rules:

- Bind templates through the group, such as `table.searchQuery`, `table.searchItems`, `form.data`, `form.items`, and `form.rules`.
- Keep component refs (`tableQueryRef`, `dialogRef`, `formRef`) outside the groups.
- Keep API functions, event handlers, and shared utility instances outside the groups.
- Use separate typed groups for unrelated workflows; do not create a generic catch-all state object.
- Preserve explicit object-replacement semantics when reset or edit initialization replaces `form.data`.

## Fetch Data

Adapt pagination once in `fetchTableData`.

```ts
const fetchTableData = (params: TableParams) => {
  const { from, to } = pageInfoHandler({
    current: params.current,
    size: params.size
  })
  return fetchFeatureList({
    ...params,
    from,
    to
  })
}
```

Rules:

- Keep Supabase `from/to` conversion in the page or API boundary, not in table columns.
- Keep response adaptation in API utilities or `responseAdapter` if the response shape is non-standard.
- For related labels, keep only foreign-key IDs in the owning table and fetch the related records with one Supabase nested `select`. Do not add duplicated `*_name` columns or issue extra lookup requests just to render table text.
- Type joined records as nested objects and render values such as `row.category?.categoryName`.

## Header Actions

Use `headerActions`; do not hand-roll toolbar buttons for standard operations.

```ts
const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    type: 'add',
    permission: 'Feature:Add',
    onClick: () => openDialog()
  },
  {
    type: 'delete',
    permission: 'Feature:Delete',
    content: ({ selectedCount }) => `确定删除选中�?${selectedCount} 条数据吗？删除后无法恢复。`,
    onClick: async ({ selectedRows }) => {
      const ids = selectedRows.map((row) => row.id).filter(Boolean)
      await deleteFeatureBatch(ids)
      await tableQueryRef.value?.refreshRemove()
    }
  }
])
```

Refresh rules:

- Add success: `refreshCreate()`
- Edit success: `refreshUpdate()`
- Delete success: `refreshRemove()`
- Generic reload: `refreshData()`

## Import And Export

Put import/export configuration in `headerActions`; do not keep page-local Excel parsing/export plumbing.

```ts
const excelColumns: ArtTableQueryExcelColumn[] = [
  { key: 'name', title: '名称', required: true },
  { key: 'phone', title: '电话' }
]

const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    type: 'import',
    importColumns: excelColumns,
    importApi: async (rows) => {
      await importFeatures(rows as RecordItem[])
    },
    onImportError: () => {
      ElMessage.error('导入文件解析失败')
    }
  },
  {
    type: 'export',
    exportFilename: '业务数据',
    exportSheetName: '业务数据',
    exportColumns: excelColumns,
    exportApi: ({ selectedIds, searchParams, maxRows }) => {
      return exportFeatureList({
        ...(searchParams as SearchParams),
        ids: selectedIds.map(String),
        maxRows
      })
    }
  }
])
```

Rules:

- Share one `excelColumns` list between import and export when possible.
- Import duplicates/upserts should be handled in API utilities, not the page.
- Export selected rows through `selectedIds`; when no selection exists, backend export should use current search params.

## Columns

Use `ColumnOption<RecordItem>[]`.

```tsx
const columnsFactory = (): ColumnOption<RecordItem>[] => [
  { type: 'selection', width: 50, fixed: 'left', reserveSelection: true },
  { type: 'globalIndex', label: '序号', width: 80 },
  { prop: 'name', label: '名称', minWidth: 180 },
  {
    prop: 'address',
    label: '地址',
    minWidth: 260,
    formatter: (row) => [row.region, row.addressDetail].filter(Boolean).join(' ') || '-'
  },
  {
    prop: 'operation',
    label: '操作',
    width: 120,
    fixed: 'right',
    formatter: (row) => (
      <div>
        <ArtButtonTable type="edit" onClick={() => openDialog(row)} />
        <ArtButtonTable type="delete" onClick={() => handleDelete(row)} />
      </div>
    )
  }
]
```

Rules:

- Include selection column when batch delete/export selected rows are supported.
- Use `globalIndex` for page-aware serial numbers.
- For dictionary-backed table values, use the column dictionary configuration, such as `dict: { code: 'status', display: 'auto' }`. Let `ArtTable` render `ArtDictDisplay`; do not call `useUserStore().getDictLabelByValue`, `getDictTagByValue`, or `getDictTagTypeByValue` inside table formatters. Use direct `ArtDictDisplay` only in non-`ArtTable` display surfaces.
- Use `ArtButtonTable` for row edit/delete.
- Show at most two direct controls in an operation column. When a row has more actions, keep one primary direct action such as edit or view and use `ArtButtonMore` as the second control for all remaining actions, including add-child and delete.
- Keep operation column right fixed when table can scroll horizontally.
- Do not pass `showOverflowTooltip` repeatedly unless overriding default behavior.

```tsx
{
  prop: 'operation',
  label: '操作',
  width: 120,
  fixed: 'right',
  formatter: (row) => (
    <div class="flex">
      <ArtButtonTable type="edit" onClick={() => openDialog(row)} />
      <ArtButtonMore
        list={getMoreActions(row)}
        onClick={(item) => handleMoreAction(item, row)}
      />
    </div>
  )
}
```

## Row Delete

```ts
const handleDelete = async (row: RecordItem): Promise<void> => {
  if (!row.id) return

  try {
    await ElMessageBox.confirm(`确定删除�?{row.name}」吗？删除后无法恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    })
    await deleteFeature(row.id)
    await tableQueryRef.value?.refreshRemove()
  } catch {
    // User cancelled; no extra message needed.
  }
}
```

## Dialog Template

Form-based CRUD dialogs must use `ArtDialog + ArtForm`.

- Do not place raw `ElForm`, `ElFormItem`, `ElRow`, or `ElCol` form composition directly under `ArtDialog`.
- Use `FormItem[]`, responsive `span`, `divider`, `hidden`, field slots, `render`, and shared core controls for complex layouts and conditional fields.
- If `ArtForm` cannot express a reusable requirement, extend `src/components/core/forms/art-form` or the relevant shared core form control first, then use the new capability in the business dialog. Do not solve the gap with page-local raw form plumbing.

```vue
<template>
  <ArtDialog ref="dialogRef" width="800px">
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :span="12"
      :gutter="20"
      label-width="120px"
      :show-reset="false"
      :show-submit="false"
    />
  </ArtDialog>
</template>
```

The dialog component, not the parent page, owns all form details.

## Dialog State

Use a factory for form state. In the standard grouped structure, keep replaceable form data under `form.data`.

```ts
const createInitialForm = (): FeatureForm => ({
  id: undefined,
  name: '',
  remark: ''
})

interface FormGroup {
  data: FeatureForm
  items: FormItem[]
  rules: FormRules
}

const form: Ref<FormGroup> = ref({
  data: createInitialForm(),
  items: computed<FormItem[]>(() => []),
  rules: computed<FormRules>(() => ({}))
})
```

Replace `form.data` from a complete default value so stale edit-only keys do not leak into add mode:

```ts
const replaceForm = (nextForm: FeatureForm): void => {
  form.value.data = {
    ...createInitialForm(),
    ...structuredClone(nextForm)
  }
}
```

This avoids stale edit-only fields leaking into add mode.

## Dialog Form Items

Use computed `FormItem[]`.

```ts
const items = computed<FormItem[]>(() => [
  {
    label: '名称',
    key: 'name',
    type: 'input',
    span: 24,
    props: { maxlength: 100 }
  },
  {
    label: '备注',
    key: 'remark',
    type: 'input',
    span: 24,
    props: {
      type: 'textarea',
      rows: 3,
      maxlength: 500,
      showWordLimit: true
    }
  }
])
```

Rules:

- Rely on `ArtForm` defaults for `clearable`, `filterable`, and placeholder.
- Pass `maxlength`, `rows`, `showWordLimit`, and business-specific placeholders when needed.
- For cascader/tree data, keep option normalization in `afterFetch`.
- For remote options that depend on initialized dialog data, set `immediate: false`, derive current parameters in `beforeFetch`, and load them from the dialog `onOpen` callback.

```ts
{
  key: 'parentId',
  type: 'treeSelect',
  api: fetchParentOptions,
  immediate: false,
  params: {},
  beforeFetch: () => ({
    typeId: form.value.data.typeId
  }),
  shouldFetch: (params) => Boolean(params?.typeId),
  afterFetch: normalizeParentTree
}
```

## Dialog Submit

```ts
const handleSubmit = async (): Promise<boolean> => {
  try {
    await formRef.value?.validate()
  } catch {
    return false
  }

  try {
    const payload = toRaw(form.value.data)
    if (form.value.data.id) {
      await editFeature(payload)
    } else {
      await addFeature(payload)
    }
    emit('success', form.value.data.id ? 'edit' : 'add')
    return true
  } catch {
    return false
  }
}
```

Rules:

- Return `false` on validation or API failure so `ArtDialog` does not close.
- Emit success only after persistence succeeds.
- Let API utilities / response layer show normal API messages.

## Dialog Open

Open CRUD dialogs before running dialog-dependent async work:

- The list page must call `dialogRef.value?.handleOpen(row)` directly; do not fetch edit details or option lists in the list page before opening.
- In the dialog component, do cheap synchronous state setup first, then call `dialogRef.handleOpen()`.
- Any API work needed by dialog content, including remote dropdown options and edit detail refreshes, belongs in the `onOpen` callback. Use `loading: true` and `api.setLoading(false)` in `finally` so the modal appears immediately with the ArtDialog content loading mask.
- For dropdowns in `ArtForm`, prefer item-level `api` plus `resultField`, `labelField`, `valueField`, `beforeFetch`, `afterFetch`, and `reloadOptions(...)`. Do not manually fetch option arrays in `handleOpen` and pass them through `props.options`.

```ts
const handleOpen = async (row?: RecordItem): Promise<void> => {
  await resetForm()
  const isEdit = !!row?.id
  if (isEdit) {
    replaceForm(structuredClone(toRaw(row)) as FeatureForm)
  }

  await dialogRef.value?.handleOpen(row, {
    title: isEdit ? '编辑记录' : '新增记录',
    loading: true,
    onOpen: async (_data, api) => {
      try {
        await formRef.value?.reloadOptions('parentId')
      } finally {
        api.setLoading(false)
      }
    },
    onConfirm: handleSubmit,
    onReset: () => void resetForm()
  })
}

defineExpose({
  handleOpen,
  handleClose: () => dialogRef.value?.handleClose()
})
```

Rules:

- Do not expose `visible`, `type`, or `editData` props.
- Parent calls `dialogRef.value?.handleOpen(row)`.
- Clone edit data before assigning.
- Derive `add/edit` from `row?.id`.
- Do not call child methods such as `formRef.reloadOptions()` before `dialogRef.handleOpen()`. `ArtDialog` destroys closed content, so child refs may not exist until `onOpen`.

## Verification

Run focused checks:

```powershell
pnpm.cmd exec prettier --write <changed-files>
pnpm.cmd exec eslint <changed-files>
pnpm.cmd exec vue-tsc --noEmit --pretty false
```

If `vue-tsc` fails with existing project errors, report them separately and state whether the current CRUD change introduced new errors.
