---
name: art-supabase-pro-conventions
description: Apply the art-supabase-pro frontend architecture and coding conventions. Use for creating, refactoring, or reviewing Vue pages, CRUD modules, search forms, tables, dialogs, drawers, business components, write payloads, and API provider boundaries under src.
---

# 亿企工场 Conventions

Build features in the project's established Vue 3, TypeScript, Element Plus, and 亿企工场 style. Prefer project core components and typed imperative business APIs over page-local infrastructure.

## Start With Local Context

1. Read the target page, its `modules` directory, API types, and one recently migrated neighboring module.
2. Reuse aliases, naming, layout classes, hooks, and response handling already present in the repository.
3. Check the core component README and types before extending a wrapper:
   - `src/components/README.md`
   - `src/components/core/dialogs/art-dialog/README.md`
   - `src/components/core/drawers/art-drawer/README.md`
   - `src/hooks/core/useTable.ts`
4. Keep changes inside the feature boundary unless a shared abstraction is genuinely required.

## Tailwind-First Styling

- Prefer existing Tailwind utilities for ordinary layout, spacing, sizing, typography, overflow, responsive states, and theme-token colors in Vue templates and TSX/JSX. Use complete, literal utility names so Tailwind can detect them; use the project's theme variables instead of hard-coded accent colors. Do not add a page-local CSS class solely to restate available utilities.
- A table `formatter` returns VNodes rendered by `ArtTable`, outside the page's own template scope. A class defined only in that page's `<style scoped>` may therefore miss the rendered cell. For simple cell styling, put Tailwind utilities directly on the JSX element or Element Plus component; use the v4 trailing important modifier (for example `w-full!`) only when the component's own width rule requires it.
- Keep scoped CSS/SCSS when it is the clearer tool for shared component internals, `:deep()` selectors, complex responsive relationships, pseudo-elements, animations, or genuinely dynamic values. For a formatter that needs such CSS, anchor a `:deep()` selector to the owning table or feature root and verify the actual DOM; do not remove working complex styles just to force a long utility string.
- The main host registers business-module sources in `src/assets/styles/core/tailwind.css`; independently run modules register their own source through `scripts/module-vite-config.mjs`. Keep both paths in sync when adding a module. After adding utilities, verify the generated stylesheet and rendered result; a class attribute alone does not prove the utility was emitted or won the cascade.

## Route And Menu Source

This project runs business navigation from backend Supabase menu data. Do not add feature or business pages to `src/router/routes/static-routes.ts`, and do not add new business route modules under `src/router/modules/**` just to make a sidebar item appear.

For new business pages, create the Vue page/component files and add or update `sys_menu` data, including the correct parent menu, component path, `meta.title`, sort order, hidden detail routes, and role-menu assignments. Static routes are reserved for framework-level public/error routes such as auth, 403/404/500, and iframe shell behavior.

When a requested menu does not appear, check backend mode first: verify the `sys_menu` row exists, the row is enabled and not hidden, the component path points to an existing `src/views/**/index.vue`, and the current role has the corresponding `sys_role_menu` grant. Do not solve missing backend menus by adding local static or frontend route records.

## Managed Button Authorization Is Mandatory

Every executable business action under TMS, VMS, FMS, HR, and System Management must be role-assignable through a button permission. This is a completion requirement for new pages and for changes that add actions to existing pages.

Before finishing a business page:

1. Inventory every meaningful action in page headers, selection toolbars, table rows, `ArtButtonMore` dropdowns, drawers, dialogs, and detail pages. Search/reset, expand/collapse, close/cancel-form, map zoom, tab switching, and other non-business UI controls do not need button permissions.
2. Register each action as a `sys_menu` row with `type = 'button'` under the exact page menu. Use a stable permission name such as `<RouteName>:<Action>` and preserve existing permission names when they are already assigned to roles. Do not create button rows under a module directory when the action belongs to a leaf page.
3. Wire every action to its exact permission code in the page source. Prefer the `permission` support in `ArtTableQuery` and `ArtButtonTable`, the `auth` item field in `ArtButtonMore`, and use `v-auth`, `hasAuth`, `hasAnyAuth`, or `hasAllAuth` for raw buttons and compound workflows. Route-based inference in shared components is compatibility fallback only and never satisfies completion or audit requirements; new and modified pages must declare the literal permission code explicitly.
4. Enforce the same permission at the API/database boundary for mutations and lifecycle transitions, using `app_private.has_permission(...)` or the closest established server helper. UI visibility is not authorization. Keep ordinary users tenant-scoped in RLS, RPC record lookup, and security-definer write guards.
5. Normal tenant-scoped business and System Management maintenance must not be gated with `isPlatformSuper` or copy such as “仅平台超级管理员可维护”. This includes AI-assisted creation of tenant-owned master data when the ordinary user has the corresponding business `Add` permissions; the server must enforce the authenticated tenant and permissions. Platform super remains an implicit override through the permission resolver. In the all-tenant view, new root records default to the authenticated administrator's platform tenant; an explicit choice may target another tenant. Cross-tenant platform context and control-plane actions such as global menus, tenants, website publishing, other controlled AI writes/configuration, and AI workflow-state changes are the only allowed exceptions; those actions still require explicit button codes and must retain their server-side platform-super boundary.
6. Confirm the role-management tree can assign the new button rows, then run `pnpm permissions:audit`. The audit catalog at `scripts/business-button-permission-catalog.ts`, its idempotent Supabase migrations, every exact page reference, and server enforcement must stay aligned. The audit must fail when a catalogued code is only inferred and is absent from page source. When button permissions subdivide a page that was previously controlled only by its menu, the rollout migration must preserve existing access by granting those newly created buttons once to roles that already own that exact page menu. Do not require administrators to rediscover and repair permissions silently removed by the rollout.

Do not grant newly introduced business buttons to roles that lack the parent page menu. Compatibility inheritance is limited to historical holders of that exact page and is not a default for future roles. Register buttons so administrators can subsequently assign least-privilege access through role management. When a page has separate actions such as submit, approve, reject, post, void, pay, export, or AI analysis, keep them as separate button permissions instead of collapsing them into a broad edit privilege.

## Choose Project Components First

For query forms, express each ordinary control through its `SearchFormItem` type and options. Use an existing `ArtForm` control such as `radioGroup` before writing a `#search-*` slot. If a generally useful Element Plus form control is missing, extend `ArtForm` and its item types, then use that shared type in business pages. Reserve search slots for interactions that the metadata contract cannot express. Do not add a placeholder `type: 'text'` item solely to mount a standard control in a slot. Persisted or reusable option sets, including list display modes, must come from the appropriate `sys_dictionary` through `useDictionaryOptions`; keep their labels and order configurable instead of duplicating literal options across pages.

Use these components before assembling equivalent Element Plus plumbing:

| Need | Preferred component |
| --- | --- |
| Query table composition | `ArtTableQuery` |
| Search/filter area | `ArtSearchBar` or the feature's search component built on it |
| Table tools and column controls | `ArtTableHeader` |
| Data table and pagination | `ArtTable` |
| Table data lifecycle | `useTable<TRecord>` |
| Modal business workflow | `ArtDialog` |
| Side-panel business workflow | `ArtDrawer` |
| Metadata-driven form | `ArtForm` |
| Business data selection | `ArtTableSingleSelect` / `ArtTableMultipleSelect` / tree variants from `src/components/core/forms/art-data-select` |
| Generic file attachments | `ArtUploadFile` |
| Image upload and preview | `ArtUploadImage` |
| Structured Excel import | `ArtExcelImport` |
| Resource-library selection | `ArtResourcePicker` |
| Common actions | Existing `Art*` core action component |
| Table-row action group | `BusinessTableRowActions` |
| Business section title | `ArtSectionTitle` |
| Titled business content card with async states | `ArtSectionCard` |
| Business landing/list/workspace identity and metrics | `BusinessWorkspaceHeader` |

When a project wrapper already exists, use it before raw Element Plus primitives. Generic document, archive, and file attachments must use `ArtUploadFile`; image upload and preview must use `ArtUploadImage`; structured spreadsheet import must use `ArtExcelImport`; resource-library workflows must use `ArtResourcePicker`. Business views must not own raw `ElUpload`, hidden file inputs, `uploadAttachment` lifecycles, size/error handling, or attachment-list synchronization. If a shared upload contract is missing a broadly reusable capability, extend the matching core component first. Prefer `ArtButtonTable`, `ArtButtonMore`, and similar `src/components/core` wrappers over ad hoc action buttons or custom dropdown wiring.

Group table-row actions with `BusinessTableRowActions`. It owns the project-wide 8px spacing and clears the legacy `ArtButtonTable` margin. `ArtTable` automatically applies it to columns whose `prop` is `operation`; use it explicitly for row-like action groups outside `ArtTable`. Do not add page-local row-action gap or button-margin overrides.

Business landing pages, list workspaces, operational workbenches, and module home pages must use `BusinessWorkspaceHeader` for the page identity, eyebrow, description, feature tags, overview metrics, and header actions. Do not hand-build page-local hero/overview headers or create domain-specific copies of the workspace header. If a reusable header capability is missing, extend `src/components/business/business-workspace-header/index.vue` and consume the extension everywhere. Use `ArtPageHeader` instead for create, edit, detail, or configuration workflow pages that need back navigation; detail pages must present read-only values through `ArtDescriptions` or purpose-built display components rather than disabled form controls.

Use raw `ElDialog` or `ElDrawer` only when the wrapper cannot support a documented platform requirement. Extend the core wrapper instead when the missing behavior is broadly reusable.

For remote option data in metadata forms, use `ArtForm` item-level API options instead of page-local `ref` state plus manual fetch/map code. Configure `api`, `resultField`, `labelField`, `valueField`, `labelFn`, `params`, `beforeFetch`, `afterFetch`, and `autoSelect` on the form item as needed. If a form control needs remote options but does not support the item-level `api` contract, extend `ArtForm` or the shared core control first, then consume it from business pages.

For selecting business records from a dialog or embedded selector, use the data selector components under `src/components/core/forms/art-data-select` instead of hand-rolled `ArtDialog + ArtTable + radio/checkbox` selectors. Use `ArtTableSingleSelect` for table single-select, `ArtTableMultipleSelect` for table multi-select, and the tree variants for hierarchical selections. Adapt existing list APIs with a small feature-local `apiFn` that maps `DataSelectFetchParams` (`keyword`, `page`, `pageSize`, `filters`) into the backend provider's params, and return `{ data, total }`. Keep custom trigger slots only when the selector is opened imperatively from an existing button.

Every employee/person field must use the shared platform `ArtEmployeeSelect`. Do not render employee UUIDs in a raw `ElSelect`, and do not rebuild employee search in a page. `ArtEmployeeSelect` owns secure employee search, pagination, edit-reference display, and the `员工姓名 · 工号` identity label. Persist only the selected employee ID, and pass the existing employee reference through `selectedData` in edit forms so no UUID fallback is exposed. Keep system-account and approval-account fields on `ArtUserSelect`; an employee record and a system user account are different business objects.

Business pages and business components must call backend data through exported functions from `src/api/**`, such as `@/api/vehicle-manage-system` or `@/api/common`. Do not import provider modules, `useSupabase`, `supabase.from(...)`, `request`, or other transport clients directly from `src/views/**`. Keep direct transport access inside API providers only. If a view needs a new backend read/write or option list, add or expose an API function first, then consume that function from the page or `ArtForm` item-level `api`.

For dictionary-backed options, do not create page-local API calls or `ArtForm` item APIs. Use the main repository's `useDictionaryOptions(code, mapValue?)` for standard label/value option lists; it owns enabled-item filtering, reactive cache updates, loading, and error feedback. Do not repeat that lifecycle or option mapping in business pages. Read `storeToRefs(useUserStore()).getDictMap` directly only when the workflow needs dictionary metadata beyond label/value, historical disabled values, or dynamic dictionary codes that the shared hook does not support. Values that are reusable, persisted, filtered, or displayed as an enumerable business meaning must be dictionaries instead of page-local arrays or maps. This includes yes/no, status, processed state, source, type, category-like enums, responsibility, mode, and tag/badge choices. Shared yes/no values must use the public `commonBoolean` dictionary. For boolean form fields, keep the form model boolean and use `useDictionaryOptions('commonBoolean', (value) => value === 'true')`; for display, pass `String(value)` to `ArtDictDisplay`.

For table dictionary display, use the table column dictionary configuration, for example `dict: { code: 'status', display: 'auto' }`, so `ArtTable` renders through `ArtDictDisplay`. Use `display: 'auto'` when the dictionary item should decide between tag, badge, and plain text from `sys_dictionary.tag_type` / color; use `display: 'tag'`, `display: 'badge'`, or `display: 'text'` only for a deliberate UI requirement. In non-`ArtTable` dictionary display surfaces, render `ArtDictDisplay` directly. Do not call `userStore.getDictLabelByValue`, `getDictTagByValue`, or `getDictTagTypeByValue` from business views for display rendering, and do not hardcode repeated page-local tag type maps for dictionary values. Use `ArtForm` item-level `api` only for non-dictionary business data such as tenants, roles, suppliers, categories, and other remote business entities.

Every `sys_dict_type` dictionary must belong to a functional business directory, such as a module, page, archive, parts, or business-record directory. Never place a dictionary directly under an application root such as `mdmManage`, `hrManage`, or `mesExecution`. Reuse the existing hierarchy before creating a directory, classify by business ownership rather than a technical prefix, and use stable semantic directory codes. Reclassification must preserve dictionary type codes, dictionary item values, cascade relationships, tenant ownership, and consumers; change only the parent hierarchy unless the business wording itself is part of the request. After adding or reorganizing dictionaries, assert that no dictionary node remains directly under an application root and visually verify the affected branches in dictionary management. A repository-wide cleanup request must classify every legacy root-level dictionary in the same change instead of moving only the currently visible items.

For editable controls returned by an `ArtTable` column `formatter`, use TSX/JSX `v-model={row.field}` directly on the writable row field. Do not spell the same binding as `modelValue={row.field}` plus `onUpdate:modelValue`. When a selection or numeric edit also resets dependent fields, recalculates values, or emits an immutable parent update, keep the direct `v-model` binding and attach the additional business effect to the component's semantic event such as `onChange` or `onSelect`. A computed expression such as `row.field ?? ''` is not a writable model target; initialize the row model before rendering instead. Read-only table cells should render display content rather than a disabled or read-only form control solely to show a value.

Editable `ArtTable` field validation must use the table's public validation contract instead of page-local error classes or `items.some(...)` field scans:

- Declare required fields with `required: true`; use `requiredMessage` when the row-specific prompt needs business context.
- Put range, format, and conditional field rules in the column's `rules` validator. Validators return `true`/`void` when valid, `false` or a business-safe Chinese message when invalid. Keep cross-row uniqueness, minimum/maximum row counts, and workflow-state rules in the owning business component.
- Bind a typed `ref<ArtTableExpose>()` and call `await tableRef.value?.validate()` from the parent submit flow. Use the returned `firstError?.message` for one concise toast or inline summary; `ArtTable` owns red control borders, `aria-invalid`, first-error scrolling/focus, and clearing corrected errors.
- Use `validateField()` only for an intentional partial check and `clearValidate()` when resetting or replacing the table model. Do not add feature-local `is-error` classes, danger-border SCSS, `aria-invalid` expressions, or duplicated required-value helpers for editable table cells.

```ts
const detailTableRef = ref<ArtTableExpose>()
const columns: ColumnOption<DetailRow>[] = [
  {
    prop: 'quantity',
    label: '数量',
    required: true,
    rules: {
      validator: ({ value }) => Number(value) > 0,
      message: ({ rowIndex }) => `第 ${rowIndex + 1} 行数量必须大于 0`
    },
    formatter: (row) => <ElInputNumber v-model={row.quantity} min={0.001} />
  }
]

const result = await detailTableRef.value?.validate()
if (result?.valid === false) {
  ElMessage.warning(result.firstError?.message || '请完整填写明细')
  return false
}
```

For tree-shaped data operations, use the shared utilities in `src/utils/tree.ts` such as `TreeUtils.normalizeTreeData`, `listToTree`, `treeToList`, and related helpers. Do not hand-write page-local tree parsing, recursive children normalization, list/tree conversion, node lookup, flattening, or descendant traversal logic. In particular, do not add business-level `normalize*Options`, `parse*Options`, or `afterFetch` callbacks solely to parse or normalize tree API responses. Normalize reusable tree responses in the shared API with `TreeUtils`, so business forms receive a standard tree directly. If `TreeUtils` does not cover a needed tree operation, extend it first and then consume it from shared APIs or business pages.

For business section titles such as "基础信息", "车辆证件", or "车辆档案附件", use `ArtSectionTitle` to keep the visual language consistent. In `ArtForm`, use items with `type: 'divider'` and `span: 24`, because the divider is rendered through `ArtSectionTitle`. Do not create page-local `h3` headings and SCSS for section titles. Use the default right-side line for ordinary section breaks; pass `:show-line="false"` only for compact header rows where the line should be hidden, such as a title with a right-aligned action button.

For a titled business content surface, use `ArtSectionCard` instead of assembling `art-card-xs`, `ArtSectionTitle`, `ElSkeleton`, `ArtEmptyState`, and error/retry markup in the page. Pass title, subtitle, actions, loading, empty, and error state through the component contract. Use `body-class` when the shared state body needs an established layout class. Keep an inner `ArtAsyncState` only for a genuinely independent sub-region whose surrounding controls or metrics must remain visible while that region loads or is empty. Keep `ArtPageSection` for borderless sections nested inside an existing surface. Keep raw `art-card-xs` only for untitled surfaces such as compact summaries, tab shells, popovers, and sticky action bars. If the required state or header behavior is broadly reusable, extend `ArtSectionCard` first rather than adding page-local wrappers.

## Build CRUD Pages

Use `ArtTableQuery` as the default composition for list pages that combine filters, table toolbar, table body, and pagination. Split into separate `ArtSearchBar` + `ArtTableHeader` + `ArtTable` only when the layout is genuinely non-standard and `ArtTableQuery` cannot express it cleanly.

```vue
<template>
  <div class="art-full-height">
    <ArtTableQuery
      ref="tableQueryRef"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :search-items="searchItems"
      :header-actions="headerActions"
    />

    <FeatureDialog ref="dialogRef" @success="tableQueryRef?.refreshData()" />
  </div>
</template>
```

Prefer `headerActions` for common toolbar actions instead of `#header-left`; only use the slot when the action cannot be expressed with `ArtTableQueryHeaderAction`. Search form action buttons should remain aligned to the right side of the card, including reset/search and expand/collapse controls.

Keep a conditional `BusinessWorkspaceFocusToggle` mounted with `v-show` when its visibility follows its own `v-model` state. A click must not destroy the active Element Plus switch before its pending DOM update finishes. Verify entering focus, exiting with the visible switch, and exiting with Esc without browser errors. `pnpm ui:audit` rejects direct self-unmounting focus toggles.

When a new or modified list page enables `ArtTableQuery` focus mode, preserve the route DOM boundary and verify the complete focus contract. The rendered route must retain a real `.art-page-view` ancestor; permission guards and other page wrappers must forward that class and route height styles to a real, flex-capable DOM element rather than a Fragment or bare slot. Use `focus-scope-selector` for inseparable composite workspaces such as “navigation tree + query table”, and point it at their nearest shared workspace ancestor. Entering focus mode must hide page hero/metrics and unrelated siblings while keeping the selected workspace context, search, actions, table, empty/loading state, and pagination usable; the toolbar exit action and `Esc` must restore the exact pre-focus layout and search visibility.

Type table records at the hook boundary:

```ts
type RecordItem = Api.Module.RecordItem

const table = useTable<RecordItem>({
  core: {
    apiFn: fetchList,
    columnsFactory: (): ColumnOption<RecordItem>[] => []
  }
})
```

Do not repair template type errors with `as Record<string, any>[]`. Fix the generic source so `data`, columns, formatters, and selections share the same record type.

## Build Business Dialogs

The list page renders only the business dialog component and controls it through a typed Ref:

```vue
<FeatureDialog ref="featureDialogRef" @success="refreshData" />
```

```ts
interface FeatureDialogExpose {
  handleOpen: (data: FeatureDialogOpenData) => Promise<void>
}

const featureDialogRef = ref<FeatureDialogExpose>()
void featureDialogRef.value?.handleOpen({ type: 'edit', editData: row })
```

The business component owns `ArtDialog`, form state, initialization, submission, and reset:

```vue
<ArtDialog ref="dialogRef">
  <ArtForm
    ref="formRef"
    v-model="form"
    :items="formItems"
    :rules="rules"
    :show-reset="false"
    :show-submit="false"
  />
</ArtDialog>
```

```ts
const handleSubmit = async (): Promise<boolean> => {
  try {
    await formRef.value?.validate()
    await save(toRaw(form))
    emit('success')
    return true
  } catch {
    return false
  }
}

const handleOpen = async (data: FeatureDialogOpenData): Promise<void> => {
  await initializeForm(data)
  await dialogRef.value?.handleOpen(data, {
    title: getTitle(data),
    contentHeight: '70vh',
    onConfirm: handleSubmit,
    onReset: () => void resetForm()
  })
}

defineExpose({ handleOpen })
```

Follow these rules:

- Business dialogs that contain forms must use `ArtDialog + ArtForm`. Do not place a raw `ElForm` or page-local `ElFormItem` layout directly under `ArtDialog`.
- Express standard layout with `ArtForm` items, responsive `span`, `divider`, `hidden`, field slots, `render`, and shared core controls.
- If a required form layout or reusable control cannot be expressed by `ArtForm`, extend `src/components/core/forms/art-form` or the relevant shared core control first, document the capability beside that component, and then consume it from the business dialog. Do not bypass `ArtForm` with a business-page-only `ElForm` implementation.
- Do not expose `visible`, `modelValue`, `type`, or edit-data props to the list page.
- Do not make the parent compose `<ArtDialog><FeatureForm /></ArtDialog>`.
- Return `false` from `onConfirm` when validation or persistence fails.
- Let `ArtDialog` manage confirm loading, automatic close, and close-time reset.
- Initialize from a fresh default factory and clone mutable edit data.
- Use `contentMaxHeight` when the entire dialog content should size naturally until a maximum height and then scroll. Use `contentHeight` only when a fixed content area is required. For independent scroll regions inside a dialog, drawer, card, or side panel, wrap that region with Element Plus `ElScrollbar` and keep the parent height constrained.
- Use the `#footer="{ loading, api }"` slot only for workflows requiring extra actions; route the primary action through `api.handleConfirm()`.
- Put one-off `ElDialog` props in `handleOpen(..., { dialogProps })`; keep reusable defaults on the component.

Apply the same ownership model to `ArtDrawer`.

## Type And State Rules

- Prefer `interface` for component contracts and `type` for aliases/unions.
- Type `defineEmits`, exposed Ref APIs, table rows, columns, and open payloads.
- Group related page variables by business responsibility instead of scattering top-level refs and computed values. On every page, first look for state and configuration that can be classified into typed `table`, `form`, `dialog`, `overview`, or other feature-specific groups. Keep each group's model, items, options, rules, columns, actions, and component props together, and bind templates through the group such as `table.searchQuery` and `table.searchItems`. Keep component refs, API functions, event handlers, and reusable utilities outside these groups.
- Use `reactive<GroupInterface>()` when the group contains ordinary reactive state. Use `Ref<GroupInterface>` only when the whole group or nested model is intentionally replaced.
- Do not create one large untyped page state object. Define an interface for each group and keep unrelated workflows in separate groups.
- When assigning multiple fields under the same reactive model, prefer a typed patch object and `Object.assign` over repeated property assignments. For branch-specific form updates, build a `patchMap` keyed by mode/status/type and apply it with `Object.assign(form.data, patchMap[mode])`. This is especially required for grouped form models such as `form.data.shippingCustomerId`, `form.data.shippingContactName`, and similar nested business fields; avoid long runs of `form.data.xxx = ...` when the fields belong to one business update.
- Prefer `unknown` plus narrowing over introducing new `any`.
- Keep unavoidable `any` local and explain why, such as undocumented Element Plus internals.
- Before implementing any utility, search installed dependencies and existing project utilities under `src/utils` / `src/hooks`. Follow this order: reuse `lodash-es` / `@vueuse/core` / another installed focused library; reuse an existing project utility; extend the closest shared project utility on top of library primitives; only then add a local helper for behavior that is genuinely business-specific.
- Treat named utilities in this skill as examples, never as an exhaustive allowlist. Before writing a general-purpose algorithm, search the installed library APIs and TypeScript declarations instead of relying on memory. If any installed library already provides the capability, use it; do not write an alternative implementation merely because it appears short or simple.
- Do not hand-write general-purpose capabilities already provided by a library. Non-exhaustive examples include deep clone, deep get/set/unset, debounce/throttle, equality and empty checks, collection grouping/deduplication/sorting, object pick/omit/merge, numeric conversion/rounding, and common browser/reactivity observers. Use named imports such as `cloneDeep`, `get`, `set`, and `unset` from `lodash-es`, and VueUse composables for browser, time, async-state, storage, event, and observer behavior.
- Keep custom helpers focused on project policy, such as payload normalization or configurable form sanitization, and compose them from library utilities where possible. Do not create a wrapper that merely renames one library function. If no installed dependency covers a reusable capability, prefer extending a shared utility under `src/utils` / `src/hooks` and document why the existing libraries were insufficient.
- Use `Object.assign(state, createInitialState())` for reactive resets, and include every mutable optional key such as `id` in the factory with an `undefined` default so stale edit state is overwritten.
- Use `shallowRef` for selected business records that are replaced rather than mutated.
- Do not mutate table rows to stage edit state.
- Prefix intentionally unawaited calls with `void`.
- Remove debug logging unless it is an explicit diagnostic action.

## Style Rules

- Inline icon/label groups must follow the mandatory alignment, spacing, sizing, and browser-verification contract in `professional-ui-quality`. Reuse `art-icon-label` or the shared Element Plus control rules instead of local icon margins.

- In Vue SFCs with `lang="scss"`, write styles with SCSS nesting under the feature/root class instead of repeating flat sibling selectors.
- Keep responsive overrides nested under the same root selector and place `:deep(...)` rules inside the relevant component block.
- Avoid adding scattered top-level selectors in scoped SCSS unless the selector genuinely targets an independent root.
- Titled business card sections must use `ArtSectionCard`; do not place `art-card-xs` directly on a page-local titled section. Untitled compact surfaces and sticky footer action bars may use the global `art-card-xs` class, for example `<div class="feature__summary art-card-xs">` and `<div class="feature__footer art-card-xs">`. Do not recreate card backgrounds, borders, radius, or shadows in page-local SCSS. Page-local styles may only add feature layout details such as spacing, sticky positioning, or internal grid alignment.
- Business-local rounded corners must use global radius variables, global classes, or project components instead of hardcoded `px` / `rem` values. Prefer `var(--el-border-radius-base)`, `var(--el-border-radius-small)`, `var(--custom-radius)`, `art-card-xs`, or an existing shared style for badges, chips, panels, buttons, upload boxes, and similar business UI. Use fixed values only for true circles or pills such as `50%` / `999px`, or when extending an established global/core component style.
- Use Element Plus `ElScrollbar` for page, card, panel, drawer, and dialog-section scroll containers instead of native `overflow-y: auto` scrollbars. Give the scrollbar container a stable height or flex-bounded parent (`height`, `max-height`, or `flex: 1; min-height: 0`) so the scrollbar is owned by the intended content area.
- For Element Plus virtualized components that require numeric viewport dimensions, such as `ElTreeV2` and `ElTableV2`, use `ElAutoResizer` and pass its slot `height`/`width` to the component. Give its parent a real, bounded height (`height` or a flex child with `flex: 1; min-height: 0`); give naturally stacked layouts a bounded height too. Keep the virtualized component's built-in scrollbar as the sole scroll region. Do not measure that viewport with `useElementSize`, `ResizeObserver`, or manual DOM math, and do not wrap the virtualized component in a second `ElScrollbar`. This rule concerns numeric dimensions required by virtualized children; layout measurements for other purposes remain separate. In this repository, import `ElAutoResizer` from `element-plus/es/components/table-v2/index.mjs`: the current on-demand style plugin generates a nonexistent `auto-resizer/style/index` import when it is imported from the package root.

  ```vue
  <div class="tree-viewport" style="height: 400px">
    <ElAutoResizer>
      <template #default="{ height }">
        <ElTreeV2 :data="nodes" :height="height" />
      </template>
    </ElAutoResizer>
  </div>
  ```

## Async And Error Semantics

- Keep list loading in `useTable`.
- Keep dialog content loading separate from confirm loading when opening requires data.
- For vehicle management CRUD dialogs and similar edit dialogs, open `ArtDialog` immediately. Do not await detail or option-list APIs in the parent page or at the top of `handleOpen` before `dialogRef.handleOpen()`, because that delays the modal appearing. Pass `loading: true` when needed and run dialog-dependent API work inside the `onOpen` callback, using `api.setLoading(false)` in `finally`.
- `ArtDialog` uses `destroyOnClose`; do not call child-component methods such as `formRef.reloadOptions()` before `dialogRef.handleOpen()`, because the child ref may not exist.
- Load dialog-dependent remote form options through the `onOpen` callback passed to `handleOpen`. At that point the dialog content has mounted.
- When remote option parameters depend on the current form model, derive them in the form item's `beforeFetch` callback. Do not rely on a computed `params` object having refreshed in the same tick as form initialization.
- Keep `immediate: false` for options that require dialog data, then explicitly call `reloadOptions(fieldKey)` from `onOpen`.
- Run independent initialization requests with `Promise.all`.
- On validation failure, return `false` without closing.
- On API failure, rely on the project's API response layer for user messages unless the feature needs a specific message, then return `false`.
- Emit `success` or `submit` only after persistence succeeds.

## Own Write Payloads In The Business Layer

- Build and normalize create/update payloads in the owning page, business dialog, feature composable, or feature module before calling an API function.
- Keep business rules out of `src/api` providers. Do not put form defaults, conditional fields, empty-string-to-null conversion, date formatting, attachment shaping, validation-derived values, or feature-specific field removal in API request functions.
- Keep API providers transport-focused: choose the table or endpoint, extract path/query identifiers required by the request, convert key naming such as camelCase to snake_case, execute the request, and apply generic response handling.
- Treat identifier extraction for an update request as transport work; treat deciding whether an identifier or field belongs in the payload as business work.
- Remove audit/read-only fields such as `createBy`, `createTime`, `updateBy`, and `updateTime` while constructing the business payload, not inside the API provider. Remove `tenantId` for ordinary/concrete-scope writes that derive it server-side; retain a validated `tenantId` for platform-all create/import when an explicit target overrides the authenticated administrator's platform tenant.
- Normalize optional database values according to the schema after validation. For nullable non-text values such as dates, numbers, and UUIDs, convert blank form values to `null` before the API call.
- If payload construction is reused by multiple screens in one feature, place it in that feature's `modules` or feature composable. Do not turn the API provider into a domain service.

## File Organization

- Page entry: `src/views/<domain>/<feature>/index.vue`
- Feature-only components: `src/views/<domain>/<feature>/modules`
- Domain-independent shared UI: `src/components/core/<responsibility>`
- Domain-aware or API-backed shared components: `src/components/business`
- Shared composables: `src/hooks/core`
- Keep wrapper types and detailed usage docs beside the wrapper.

Shared component placement is responsibility-based. Read `src/components/README.md` before adding or relocating a public component, then use these boundaries:

| Directory | Allowed responsibility |
| --- | --- |
| `core/base` | Small dependency-light display and interaction primitives |
| `core/forms` | Generic inputs, selectors, form composition, and validation-aware controls |
| `core/feedback` | Loading, skeleton, empty, error, and status feedback |
| `core/surfaces` | Reusable content containers and section chrome |
| `core/layouts` | Application shell, page geometry, navigation, and structural flow only |
| `core/tables` | Table rendering, querying, pagination, and table tooling |
| `core/dialogs` / `core/drawers` | Generic modal and side-panel infrastructure |
| `components/business` | Cross-page components that understand business records or use exported `src/api/**` functions |

`ArtAsyncState` and `ArtEmptyState` belong to `core/feedback`; `ArtSectionCard` and `ArtSectionTitle` belong to `core/surfaces`; `ArtEmployeeSelect` belongs to `components/business`. Do not put state components or content cards in `core/layouts`, and do not use `core/others` as a catch-all for new work. Keep a page-specific component in the feature's `modules` directory until a genuine shared contract exists. Before adding a new directory, search the closest category and document why none of the established responsibilities fits.

## Supabase Table Rules

### Tenant scope is global shell state

- Only platform super administrators may render the header tenant switcher. Do not use tenant-admin roles, route permissions, or module permissions as a substitute for `isPlatformSuper`.
- Read APIs accept an optional tenant filter: ordinary users resolve to their authenticated tenant, platform-selected resolves to the selected tenant, and platform-all omits the filter. In views/composables use `useTenantScopeStore().effectiveTenantId`; never replace its platform-all `null` with `getUserInfo.tenantId`.
- The compatibility normalization in `src/plugins/supabase.ts` protects legacy direct table reads, but new providers must still model the optional scope correctly. RPCs must obtain the server-side read scope; do not send the login tenant as a read parameter.
- Platform-all is a writable management workspace. Existing-row update/delete gets its tenant from the row. Child creation gets it from the tenant-owned parent. New root records default to the administrator's authenticated platform tenant; a concrete header selection or explicit target writes to that tenant. Imports follow the same target resolution and must not mix tenant-owned references. Do not force a header switch when the operation already identifies its target tenant.
- A concrete header tenant is a scope boundary, not cosmetic UI. Reads must return only that tenant, and creation/reference options must not mix tenants.

When creating or changing Supabase tables for this project, first inspect the closest existing table and match its conventions. New business tables must include the standard audit columns and `tenant_id` unless the user explicitly says otherwise:

```sql
create_by text,
create_time timestamptz not null default now(),
update_by text,
update_time timestamptz not null default now(),
tenant_id uuid not null default app_private.current_user_tenant_id()
```

Do not use `uuid default auth.uid()` for `create_by` or `update_by` in this project. These fields are display strings and map to frontend `createBy` / `updateBy`. Do not ask business forms to pass `tenant_id` for ordinary inserts. Business tables should derive the tenant from the authenticated user with `app_private.current_user_tenant_id()` at the database default/policy layer. For platform-all create/import, resolve a concrete target tenant: a new root record defaults to the administrator's authenticated platform tenant, an explicit target overrides that default, existing-row mutations use the row tenant, and child creation uses the parent tenant. A concrete header selection uses the selected tenant. Use `app_private.default_register_tenant_id()` only for registration/default-user flows that intentionally land in the public registration tenant.

For project-provided setup SQL, assign system configuration rows in `sys_role`, `sys_menu`, `sys_dict_type`, and `sys_dictionary` to the platform administrator tenant (`tenant_code = 'platform'`). The protected built-in `R_REGISTER` role is the exception when it already belongs to the public registration tenant; do not move or recreate it under `platform`, but platform super administrators must be able to grant its menu permissions. Use `624944977@qq.com` for `create_by` / `update_by`. Business seed rows that belong to ordinary feature tables should use the public registration tenant (`tenant_code = 'public-register'`) with `create_by` / `update_by = '624944977@qq.com'`.

Bind the existing project audit triggers on every new business table:

```sql
create trigger <table>_create_audit
before insert on public.<table>
for each row
execute function public.trg_set_create_time_and_by('true', 'true');

create trigger <table>_update_audit
before update on public.<table>
for each row
execute function public.trg_set_update_time_and_by();
```

Also include the table's tenant isolation policies in the SQL itself: `tenant_select`, `tenant_insert`, `tenant_update`, and `tenant_delete` or the closest existing variant for the table's access model. SELECT policies must compose with `app_private.tenant_in_current_read_scope(tenant_id)` so platform-all, platform-selected, and ordinary-own reads share one contract; do not use an unconditional platform-super OR branch that defeats the selected tenant. Write policies may allow platform-super cross-tenant maintenance, must keep ordinary users on `app_private.current_user_tenant_id()`, and should preserve `app_private.owns_record(create_by)` when creator ownership is required. Do not ship a new business table without its RLS enabled and matching policies.

Frontend API insert/update helpers should omit `createBy`, `createTime`, `updateBy`, and `updateTime` before writing, unless the existing neighboring module intentionally supplies audit values.

## Relational Data And Joined Queries

- Normalize master and reference data. Store foreign keys such as `category_id`, `supplier_id`, `company_id`, or `user_id`; do not also add copied display columns such as `category_name`, `supplier_name`, or `company_name` merely for list display.
- Define real Postgres foreign-key constraints so Supabase/PostgREST can discover relationships.
- Read related display data with Supabase nested selects and aliases instead of making extra lookup requests:

```ts
supabase.from('vehicle_parts').select(`
  *,
  category:vehicle_parts_category(id, category_name),
  supplier:vehicle_supplier(id, supplier_name)
`)
```

- Model joined data as nested frontend objects such as `category?.categoryName` and `supplier?.supplierName`. Do not flatten joined names back into persisted columns.
- Keep create/update payloads limited to fields owned by the table, including foreign-key IDs. Do not query related tables inside `add*` or `edit*` merely to copy names into the payload.
- Prefer one joined list/detail query over a base query followed by per-row or per-write lookup requests.
- Add indexes for foreign-key columns used by joins and filters.
- Duplicate a related name only when the record is intentionally a historical snapshot, legal document, transaction line, audit record, or other immutable point-in-time fact that must preserve the original text after the source record is renamed. Name the snapshot field clearly, document the reason, and do not treat ordinary master-data screens as snapshots.

## Verify Before Finishing

Run focused checks first, then repository type checking:

```powershell
pnpm.cmd exec prettier --write <changed-files>
pnpm.cmd exec eslint <changed-files>
pnpm.cmd exec vue-tsc --noEmit --pretty false
```

Report pre-existing type errors separately from errors introduced by the change. For user-facing frontend changes, run the app and inspect the affected workflow when practical.
