# ArtTableQuery

## 手动刷新反馈

内管列表可设置 `refresh-feedback="icon"`：点击工具栏刷新时，仅旋转原有刷新图标，保留当前列表，不触发表格遮罩或查询按钮的加载动画。刷新期间表格和头部操作暂不可交互，`dataState.loading` 仍反映真实请求状态。首次加载、查询和分页继续沿用正常加载反馈；默认不改变现有页面行为。

## 关联记录定位

`ArtTableQueryExpose.dataState` 提供只读的 `rows`、`loading`、`error` 计算属性，代表当前表格实际呈现的结果，并沿用公共请求的失效保护。业务页应把表格引用传给 `MasterDeleteProcessingNotice`，由公共组件匹配目标记录；不要根据路由参数是否存在提前显示“已找到”。目标与路由 `recordId` 不同时传 `record-id`，编号规则等非 `id` 主键传 `record-key`。树形记录沿用公共树工具查找。

没有公共查询表格的页面可提供 `record-rows`、`record-loading`、`record-error`；只有已确认的详情加载状态才使用显式 `location-ready`。这些状态用于界面提示，删除前仍须执行 `MasterDataDeleteGuard` 引用检查。

## 字典展示规范

默认 Excel 导出沿用列的 `dict` 与 `dict.value` 配置，等待字典资料加载后输出业务名称，包含已停用的历史值；字典请求失败会阻止导出并允许重试，不用内部编码冒充正常结果。显式提供的 `exportColumns` 仍由调用方定义导出格式。

后续涉及字典值展示时统一使用 `ArtDictDisplay`。表格场景优先配置 `ColumnOption.dict`，不要在业务页面重复编写 `formatter`、`ElTag` 或颜色判断。

### 表格列

```ts
{
  prop: 'status',
  label: '状态',
  dict: {
    code: 'status',
    display: 'auto',
    value: (row) => row.status
  }
}
```

未提供 `value` 时默认读取列的 `prop`。需要从其他字段或组合数据取值时，使用 `value(row)`：

```ts
{
  label: '审核状态',
  dict: {
    code: 'vehicleAuditStatus',
    display: 'auto',
    value: (row) => row.auditStatus
  }
}
```

### 非表格场景

```vue
<ArtDictDisplay dict-code="vehicleAuditStatus" :value="detail.auditStatus" display="auto" />
```

已有完整字典项时也可以直接传入：

```vue
<ArtDictDisplay :item="dictItem" display="auto" />
```

### 展示模式

| 模式 | 展示规则 |
| --- | --- |
| `auto` | 优先使用字典项 `tagType` 显示 Tag，其次使用 `color` 显示文字前置 Badge 圆点，否则显示普通文字。 |
| `tag` | 强制按 `tagType` 显示 Tag。 |
| `badge` | 强制按 `color` 显示文字前置 Badge 圆点。 |
| `text` | 只显示字典文字。 |

字典项未匹配时显示原始值；原始值为空时默认显示 `--`。

`ArtTableQuery` 是项目标准的查询表格组合组件，内部组合：

- `ArtSearchBar`：查询表单
- `ArtTableHeader`：工具栏、刷新、搜索区显隐、列设置、表格设置
- `ArtTable`：表格主体、分页、列渲染、行拖拽事件
- `useTable`：可选的内管数据生命周期
- 专注模式：默认只保留当前查询条件、工具栏、表格与分页；复合工作区可同时保留必要的导航上下文，退出后恢复页面原布局

标准 CRUD 列表页优先使用 `ArtTableQuery`，不要重复手写 `ArtSearchBar + ArtTableHeader + ArtTable`。

## 使用模式

### 内管模式

传入 `apiFn` 后启用内管模式。组件内部接管：

- `loading`
- `data`
- `pagination`
- `columns`
- 查询、重置、刷新
- 分页变化
- 列设置

```vue
<template>
  <ArtTableQuery
    ref="tableQueryRef"
    v-model="searchQuery"
    :search-items="searchItems"
    :api-fn="fetchTableData"
    :columns-factory="columnsFactory"
    :header-actions="headerActions"
  />
</template>
```

```ts
import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
import type { ColumnOption } from '@/types'

type Row = Api.Module.Row
type SearchParams = Api.Module.SearchParams

const tableQueryRef = ref<ArtTableQueryExpose>()

const searchQuery = ref<SearchParams>({
  name: ''
})

const searchItems = computed<SearchFormItem[]>(() => [
  { label: '名称', key: 'name', type: 'input' }
])

const fetchTableData = (params: SearchParams & { current: number; size: number }) => {
  return fetchList(params)
}

const columnsFactory = (): ColumnOption<Row>[] => [
  { type: 'selection', width: 50, reserveSelection: true },
  { type: 'globalIndex', label: '序号', width: 80 },
  { prop: 'name', label: '名称', minWidth: 180 }
]
```

### 受控模式

不传 `apiFn` 时，组件只负责布局和事件转发，业务页自行维护数据生命周期。

```vue
<ArtTableQuery
  v-model="searchQuery"
  v-model:columns="columnChecks"
  :loading="loading"
  :data="data"
  :table-columns="columns"
  :pagination="pagination"
  :search-items="searchItems"
  @search="handleSearch"
  @reset="handleReset"
  @refresh="handleRefresh"
  @pagination:size-change="handleSizeChange"
  @pagination:current-change="handleCurrentChange"
/>
```

### 旧请求与附带状态

内管模式会把 `options.signal` 传给 `apiFn`。新请求开始或组件卸载会使旧信号失效；表格内部忽略过期的列表响应。若业务筛选有防抖等待，在条件改变时同步调用 `tableQueryRef.value?.cancelRequest()`，使旧请求立即失效；防抖结束后再加载新数据。

业务加载函数若同时更新概览、目录树、选项、错误提示或加载状态，必须在更新这些状态前检查 `options?.signal?.aborted`。表格无法撤销业务函数内部已经执行的副作用。`catch` 和 `finally` 中的状态更新同样需要检查，避免旧请求结束新请求的加载状态。

请求选项类型使用 `@/hooks/core/useTable` 导出的 `TableRequestOptions`。后端接口支持取消时继续传递该信号；只检查信号能阻止旧结果更新界面，不能证明底层网络请求已经取消。组件的导出流程等独立调用可能不传选项，加载函数应保留可选参数。

### 首次不自动请求

```vue
<ArtTableQuery
  ref="tableQueryRef"
  :api-fn="fetchTableData"
  :columns-factory="columnsFactory"
  :immediate="false"
/>
```

```ts
const load = () => {
  void tableQueryRef.value?.getData()
}
```

## Props

### 顶层 Props

| Prop | 类型 | 模式 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `loading` | `boolean` | 受控 | `false` | 外部 loading。内管模式由组件内部控制。 |
| `data` | `Record<string, any>[]` | 受控 | `[]` | 外部表格数据。内管模式由组件内部控制。 |
| `tableColumns` | `ColumnOption[]` | 受控 | `[]` | 外部表格列。内管模式由 `columnsFactory` 控制。 |
| `pagination` | `{ current: number; size: number; total: number }` | 受控 | - | 外部分页状态。内管模式由组件内部控制。 |
| `searchItems` | `SearchFormItem[]` | 两种 | `[]` | 查询表单项。优先级高于 `searchBarProps.items`。为空时不渲染搜索区。 |
| `headerActions` | `ArtTableQueryHeaderAction[]` | 两种 | `[]` | 工具栏左侧操作按钮配置；勾选后会自动把导出、批量删除和 `selectionRequired` 操作切换到批量命令栏。 |
| `headerActionsPlacement` | `'table' \| 'workspace'` | 两种 | `'table'` | 普通态非批量操作的位置。`workspace` 需配合 `BusinessTableWorkspaceActions`；进入专注后动作自动回到表格左侧。 |
| `selectionActions` | `ArtTableQueryHeaderAction[]` | 两种 | `[]` | 显式配置勾选后的批量操作并覆盖自动推导结果；未勾选时不占用空间。 |
| `apiFn` | `ArtTableQueryApiFn<TParams, TResponse>` | 内管 | - | 类型化列表接口，接收参数和可选 `TableRequestOptions`。传入后启用内管模式。 |
| `apiParams` | `Record<string, any>` | 内管 | `{}` | 默认接口参数，会和 `{ current: 1, size: 20 }` 合并。 |
| `immediate` | `boolean` | 内管 | `true` | 是否挂载后立即请求。 |
| `excludeParams` | `string[]` | 内管 | `[]` | 请求前从参数中排除的字段。 |
| `paginationKey` | `{ current?: string; size?: string }` | 内管 | - | 自定义分页字段名。 |
| `enableCache` | `boolean` | 内管 | `false` | 是否启用 `useTable` 缓存。 |
| `cacheTime` | `number` | 内管 | `300000` | 缓存时间，单位毫秒。 |
| `debounceTime` | `number` | 内管 | `300` | 搜索防抖时间，单位毫秒。 |
| `maxCacheSize` | `number` | 内管 | `50` | 最大缓存条数。 |
| `dataTransformer` | `(data: T[]) => T[]` | 内管 | - | 响应记录转换函数。 |
| `responseAdapter` | `(response) => ApiResponse<T>` | 内管 | `defaultResponseAdapter` | 把接口响应转换为 `{ records, total, current, size }`。 |
| `onSuccess` | `(data, response) => void` | 内管 | - | 请求成功回调。 |
| `onError` | `(error) => void` | 内管 | - | 请求失败回调。 |
| `onCacheHit` | `(data, response) => void` | 内管 | - | 缓存命中回调。 |
| `debug` | `boolean` | 内管 | `false` | 是否开启 `useTable` 调试日志。 |
| `columnsFactory` | `() => ColumnOption[]` | 内管 | `() => []` | 内管模式列工厂；响应式依赖变化时重新生成列，保留已有列的用户显隐和排序设置。 |
| `columnsContextKey` | `string \| number` | 内管 | — | 列工厂依赖的业务模式；变化时重新生成列，数据查询仍由业务事件控制。 |
| `searchBarProps` | `ArtTableQuerySearchBarProps` | 两种 | `{}` | 透传给 `ArtSearchBar`。 |
| `tableHeaderProps` | `ArtTableQueryTableHeaderProps` | 两种 | `{}` | 透传给 `ArtTableHeader`。 |
| `showTableToolbar` | `boolean` | 两种 | `false` | 是否启用刷新、密度、全屏、列设置等右侧工具；支持 `v-model`。专注模式期间有效值强制为开启，退出后恢复原值。 |
| `tableProps` | `ArtTableQueryTableProps` | 两种 | `{}` | 透传给 `ArtTable` / `ElTable`。 |
| `focusable` | `boolean` | 两种 | `false` | 是否允许专注模式；工具栏开启时显示入口，也可通过 `v-model:focus-mode` 从页面头部直接进入。 |
| `focusScopeSelector` | `string` | 两种 | - | 专注模式整体保留的最近祖先选择器；用于“导航树 + 查询表格”等不可拆分的复合工作区。未指定时保留最近的 Element Plus 页签容器及其导航，无页签时保留当前查询表格。 |

### searchBarProps

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `items` | `SearchFormItem[]` | - | 查询项。推荐优先使用顶层 `searchItems`。 |
| `span` | `number` | `6` | 查询项栅格宽度。 |
| `gutter` | `number` | `12` | 查询项间距。 |
| `isExpand` | `boolean` | `false` | 是否强制展开全部查询项。 |
| `defaultExpanded` | `boolean` | `false` | 默认是否展开。 |
| `labelPosition` | `'left' \| 'right' \| 'top'` | `'right'` | label 位置。 |
| `labelWidth` | `string \| number` | `'96px'` | label 宽度。 |
| `showExpand` | `boolean` | `true` | 是否显示展开/收起按钮。 |
| `buttonLeftLimit` | `number` | `2` | 查询项数量小于等于该值时按钮左对齐。 |
| `showReset` | `boolean` | `true` | 是否显示重置按钮。 |
| `showSearch` | `boolean` | `true` | 是否显示查询按钮。 |
| `disabledSearch` | `boolean` | `false` | 是否禁用查询按钮。 |
| `sanitizeOutput` | `Partial<ArtTableQuerySanitizeOutputOptions>` | - | 查询输出清洗策略。 |

### sanitizeOutput

| Prop                  | 类型      | 默认含义               |
| --------------------- | --------- | ---------------------- |
| `removeEmptyString`   | `boolean` | 移除空字符串。         |
| `removeEmptyArray`    | `boolean` | 移除空数组。           |
| `removeEmptyObject`   | `boolean` | 移除清洗后为空的对象。 |
| `removeEmptyRichText` | `boolean` | 移除空富文本占位内容。 |
| `keepZero`            | `boolean` | 保留数字 `0`。         |
| `keepFalse`           | `boolean` | 保留布尔值 `false`。   |

### tableHeaderProps

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `showZebra` | `boolean` | `true` | 是否显示斑马纹设置项。 |
| `showBorder` | `boolean` | `true` | 是否显示边框设置项。 |
| `showHeaderBackground` | `boolean` | `true` | 是否显示表头背景设置项。 |
| `fullClass` | `string` | `'art-page-view'` | 全屏容器 class。 |
| `layout` | `string` | `'search,refresh,size,fullscreen,columns,settings'` | 工具栏按钮布局。 |

`layout` 可用项：

| Key          | 说明               |
| ------------ | ------------------ |
| `search`     | 搜索区域显隐按钮。 |
| `refresh`    | 刷新按钮。         |
| `size`       | 表格尺寸切换。     |
| `fullscreen` | 全屏按钮。         |
| `columns`    | 列设置。           |
| `settings`   | 表格设置。         |

### tableProps

`tableProps` 会透传给 `ArtTable`，再透传给 Element Plus `ElTable`。组件内置：

- `rowKey: 'id'`
- `tableLayout: 'fixed'`

不要在 `tableProps` 中传 `data`、`columns`、`loading`、`pagination`。

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `rowKey` | `string \| (row) => string` | `'id'` | 行 key。选择保留、行拖拽、树表格都依赖它。 |
| `tableLayout` | `'fixed' \| 'auto'` | `'fixed'` | 表格布局。 |
| `height` | `string \| number` | `'100%'` | 表格高度。 |
| `maxHeight` | `string \| number` | - | 表格最大高度。 |
| `stripe` | `boolean` | 全局设置 | 是否斑马纹。 |
| `border` | `boolean` | 全局设置 | 是否显示边框。 |
| `size` | `'small' \| 'default' \| 'large'` | 全局设置 | 表格尺寸。 |
| `fit` | `boolean` | `true` | 列宽是否自动撑开。 |
| `showHeader` | `boolean` | `true` | 是否显示表头。 |
| `highlightCurrentRow` | `boolean` | - | 是否高亮当前行。 |
| `currentRowKey` | `string \| number` | - | 当前行 key。 |
| `flexible` | `boolean` | - | 空数据时是否按最大高度撑开。 |
| `defaultExpandAll` | `boolean` | - | 是否默认展开所有树节点。 |
| `expandRowKeys` | `(string \| number)[]` | - | 展开的树节点 key。 |
| `lazy` | `boolean` | - | 是否懒加载树形数据。 |
| `load` | `TableProps['load']` | - | 树形数据加载函数。 |
| `treeProps` | `TableProps['treeProps']` | - | 树形数据配置，例如 `{ children: 'children', hasChildren: 'hasChildren' }`。 |
| `tooltipOptions` | `TableProps['tooltipOptions']` | - | tooltip 配置。 |
| `headerRowClassName` | `TableProps['headerRowClassName']` | - | 表头行 class。 |
| `headerRowStyle` | `TableProps['headerRowStyle']` | - | 表头行 style。 |
| `headerCellClassName` | `TableProps['headerCellClassName']` | - | 表头单元格 class。 |
| `headerCellStyle` | `TableProps['headerCellStyle']` | - | 表头单元格 style。 |
| `rowClassName` | `TableProps['rowClassName']` | - | 行 class。 |
| `rowStyle` | `TableProps['rowStyle']` | - | 行 style。 |
| `cellClassName` | `TableProps['cellClassName']` | - | 单元格 class。 |
| `cellStyle` | `TableProps['cellStyle']` | - | 单元格 style。 |
| `spanMethod` | `TableProps['spanMethod']` | - | 合并行列。 |
| `defaultSort` | `TableProps['defaultSort']` | - | 默认排序。 |
| `tooltipEffect` | `TableProps['tooltipEffect']` | - | tooltip 主题。 |
| `showOverflowTooltip` | `TableProps['showOverflowTooltip']` | - | 是否显示溢出 tooltip。 |
| `emptyHeight` | `string` | `'100%'` | 空数据表格高度。 |
| `emptyText` | `string` | `'暂无数据'` | 空数据文案。 |
| `showTableHeader` | `boolean` | `true` | 是否启用表头高度参与表格高度计算。 |
| `additionalHeightOffset` | `number` | `0` | 工具栏上方其它内容占用的高度；`table-header-top` 插槽会自动测量，无需手动设置。 |
| `paginationOptions` | `ArtTableQueryPaginationOptions` | - | 分页器配置。 |

### paginationOptions

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `pageSizes` | `number[]` | `[10, 20, 30, 50, 100]` | 每页条数选项。 |
| `align` | `'left' \| 'center' \| 'right'` | `'center'` | 分页器对齐方式。 |
| `layout` | `string` | 响应式默认值 | 分页器布局。 |
| `background` | `boolean` | `true` | 是否显示分页背景。 |
| `hideOnSinglePage` | `boolean` | `false` | 只有一页时是否隐藏分页。 |
| `size` | `'small' \| 'default' \| 'large'` | `'default'` | 分页器尺寸。 |
| `pagerCount` | `number` | `7 / 5` | 页码按钮数量。 |

## v-model

| Model | 类型 | 说明 |
| --- | --- | --- |
| `v-model` | `Record<string, unknown>` | 查询表单模型。常用于默认查询值和外部联动。 |
| `v-model:columns` | `ColumnOption[]` | 列显隐和排序配置。受控模式常用，内管模式通常不用传。 |
| `v-model:show-search-bar` | `boolean` | 搜索区域显隐状态。 |
| `v-model:show-table-toolbar` | `boolean` | 右侧完整工具栏开关；专注模式只临时强制显示，不改写该值。 |
| `v-model:focus-mode` | `boolean` | 专注模式状态；进入时保留搜索区当前显隐状态，退出后恢复进入前状态。 |

## Events

内管模式下，组件会先执行默认行为，然后 emit 事件。业务不要在同一个事件中重复调用相同刷新动作。

| Event | Payload | 说明 |
| --- | --- | --- |
| `search` | `Record<string, unknown>` | 点击查询后触发。内管模式先更新查询参数并查询。 |
| `reset` | 无 | 点击重置后触发。内管模式先恢复初始查询模型并重置查询参数。 |
| `refresh` | 无 | 点击工具栏刷新后触发。内管模式先刷新数据。 |
| `header-search` | 无 | 点击工具栏搜索区显隐按钮后触发。 |
| `focus-change` | `boolean` | 进入或退出专注模式后触发。 |
| `selection-change` | `Record<string, any>[]` | 表格选择变化。组件会维护跨页选中缓存。 |
| `row-drag-start` | `ArtTableRowDragPayload` | 行拖拽开始。 |
| `row-drag-update` | `ArtTableRowDragPayload` | 行拖拽位置更新。 |
| `row-drag-end` | `ArtTableRowDragPayload` | 行拖拽结束。 |
| `pagination:size-change` | `number` | page size 改变。内管模式先处理分页并查询。 |
| `pagination:current-change` | `number` | current page 改变。内管模式先处理分页并查询。 |
| `header-action-click` | `(action, ctx)` | 点击工具栏 action 后触发。导入成功也会触发一次。 |

包含 `selection` 列时，点击行内复选框或表头全选框会改变勾选状态；按住鼠标左键划过数据行可批量勾选或取消。普通行单击仍透传原生行事件，但不会切换复选框。

### ArtTableRowDragPayload

| 字段        | 类型                               | 说明                            |
| ----------- | ---------------------------------- | ------------------------------- |
| `row`       | `Record<string, any> \| undefined` | 被拖拽行。                      |
| `targetRow` | `Record<string, any> \| undefined` | 目标位置原始行。                |
| `oldIndex`  | `number \| undefined`              | 拖拽前可见行索引。              |
| `newIndex`  | `number \| undefined`              | 拖拽后可见行索引。              |
| `event`     | `DraggableEvent`                   | `vue-draggable-plus` 原始事件。 |

## Slots

| Slot | 说明 |
| --- | --- |
| `header-left` | 工具栏左侧扩展，渲染在 `headerActions` 后面。 |
| `header-right` | 工具栏右侧扩展。 |
| `selection-bar` | 勾选后的命令栏左侧内容；传入后替换 `selectionActions` 默认外观，并提供 `selectedRows`、`selectedCount`、`clearSelection`。 |
| `selection-details` | 默认批量命令栏中补充选中金额等信息，提供 `selectedRows`、`selectedCount`；保留默认数量与操作按钮。需要独占一行时在内容根节点使用 `w-full`。 |
| `table-header-top` | 工具栏上方扩展区，高度会自动计入表格布局。 |
| `default` | 透传给 `ArtTable` 的默认插槽。 |
| `content` | 替换表格及其分页区域，用于图表等替代视图；查询、数据加载和顶部工具栏继续共用。替代视图需自行展示加载、空态、错误与重试。用条件插槽切换回表格时保留查询模型。 |
| 表格列 slot | 除保留插槽外，其它插槽会透传给 `ArtTable`。例如列 `prop: 'status'` 可写 `#status`。 |
| `search-{key}` | 查询项插槽。例如查询项 `key: 'status'` 可写 `#search-status`。 |

保留插槽名：

- `header-left`
- `header-right`
- `selection-bar`
- `selection-details`
- `table-header-top`
- `content`
- `default`
- `search-*`

## Expose

```ts
interface ArtTableQueryExpose {
  refreshData: () => Promise<void>
  refreshCreate: () => Promise<void>
  refreshUpdate: () => Promise<void>
  refreshRemove: () => Promise<void>
  getData: () => Promise<unknown>
  cancelRequest: () => void
  resetSearchParams: () => Promise<void>
  clearSelection: () => void
}
```

| 方法                  | 说明                                                         |
| --------------------- | ------------------------------------------------------------ |
| `refreshData()`       | 全量刷新，适合工具栏刷新。                                   |
| `refreshCreate()`     | 新增成功后刷新，默认回到第一页。                             |
| `refreshUpdate()`     | 编辑成功后刷新，默认保留当前页。                             |
| `refreshRemove()`     | 删除成功后刷新，当前页为空时自动回退上一页，并清空选中状态。 |
| `getData()`           | 查询语义的数据加载，默认回到第一页。                         |
| `cancelRequest()`     | 立即使当前请求失效，并取消尚未执行的内部防抖查询。           |
| `resetSearchParams()` | 外部主动清空查询表单并重置内部查询参数。                     |
| `clearSelection()`    | 清空当前跨页选择。                                           |

## headerActions

点击操作会在确认弹窗和异步回调期间锁定表格的操作按钮；当前操作显示加载状态，取消、成功或失败后释放锁。回调应返回实际请求的 Promise，避免提前结束执行状态。共享响应层已提示的错误不会重复弹出，其他错误会显示友好的操作反馈。删除操作仍由业务回调负责关联检查与服务端约束，仅在回调成功后清空勾选。

`headerActions` 用于声明工具栏左侧按钮。标准 CRUD 页优先使用它，不手写 `#header-left`。存在复选框时，组件会在勾选后自动进入批量上下文：普通新增、导入等操作暂时隐藏，导出会显示为“导出选中”，删除和所有 `selectionRequired` 操作进入批量命令栏，取消选择后恢复普通操作。

需要精确控制批量按钮或覆盖自动推导结果时，使用 `selectionActions`。业务列表需要节省表格垂直空间时，使用 `BusinessTableWorkspaceActions` 把同一份 `headerActions` 挂到 `BusinessWorkspaceHeader`，不要在页面重复手写新增、导入或导出按钮。

```vue
<BusinessWorkspaceHeader title="客户资料" description="..." icon="ri:user-star-line">
  <template #actions>
    <BusinessTableWorkspaceActions :table="tableQueryRef" />
  </template>
</BusinessWorkspaceHeader>

<ArtTableQuery
  ref="tableQueryRef"
  :header-actions="headerActions"
  header-actions-placement="workspace"
  focusable
/>
```

普通状态下，非批量动作在业务头部，勾选后的批量条仍在表格上方；专注状态下，非批量动作自动回到表格左侧，右侧完整工具栏临时强制显示。退出专注后，动作返回业务头部，并恢复进入前的工具栏开关状态。`showTableToolbar` 默认关闭，关闭且没有批量上下文时不保留空工具栏行。

勾选操作栏统一继承 Element Plus 的 `small` 尺寸，包括通过 `slot` / `render` 提供的下推下拉按钮。自定义动作不要显式设置 `default` / `large` 尺寸，也不要用局部高度覆盖；普通页面头部和表单操作不受这个尺寸上下文影响。

窄屏进入专注模式后也必须保留工具栏和“退出专注模式”按钮，不能应用普通状态的移动端工具栏隐藏规则。工具栏允许换行，确保触屏用户不依赖键盘 Esc 即可退出。业务权限变化导致表格卸载时，仍由 `ArtTableQuery` 清理专注模式布局。

```vue
<ArtTableQuery :selection-actions="selectionActions" :show-table-toolbar="false" />
```

```ts
const selectionActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    type: 'export',
    label: '导出选中',
    selectionRequired: true
  },
  {
    type: 'delete',
    label: '批量删除',
    onClick: async ({ selectedRows, api }) => {
      await deleteBatch(selectedRows.map((row) => String(row.id)))
      await api.refreshRemove()
    }
  }
])
```

```ts
const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    type: 'add',
    permission: 'Module:Add',
    onClick: () => openDialog()
  },
  {
    type: 'delete',
    permission: 'Module:Delete',
    content: ({ selectedCount }) => `确定删除选中的 ${selectedCount} 条数据吗？`,
    onClick: async ({ selectedRows, api }) => {
      await batchDelete(selectedRows.map((row) => row.id))
      await api.refreshRemove()
    }
  }
])
```

### 预制 type

| type | 默认文案 | 默认图标 | 默认按钮 | 默认行为 |
| --- | --- | --- | --- | --- |
| `add` | `新增` | `ri:add-line` | `primary plain` | 直接执行 `onClick`。 |
| `delete` | `批量删除` | `ri:delete-bin-line` | `danger plain` | 默认需要选中行；点击前确认；确认后执行 `onClick`；执行后清空选中状态。 |
| `import` | `导入` | `ri:upload-2-line` | `success plain` | 渲染 `ArtExcelImport`，导入成功后执行公共导入流程。 |
| `export` | `导出` | `ri:download-2-line` | `warning plain` | 未传 `onClick` 时执行公共导出流程。 |

### ArtTableQueryHeaderAction

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `string` | 唯一标识。未传时使用 `type` 或数组索引。 |
| `type` | `'add' \| 'delete' \| 'import' \| 'export'` | 预制类型。 |
| `hidden` | `boolean \| (ctx) => boolean` | 是否隐藏。 |
| `label` | `string \| Component` | 按钮文案或组件。未传时使用预制文案。 |
| `onClick` | `(ctx) => void \| Promise<void>` | 点击回调。`delete` 会在确认后触发。`export` 未传时走默认导出。 |
| `onImportSuccess` | `(data, ctx) => void \| Promise<void>` | 导入成功回调。公共导入流程结束后触发。 |
| `importColumns` | `ArtTableQueryExcelColumns` | 导入列映射配置。 |
| `importTransformer` | `(rows, ctx) => rows \| Promise<rows>` | 导入数据转换。优先级高于 `importColumns` 默认映射。 |
| `importRecordTransformer` | `(records, ctx) => records \| Promise<records>` | 接收 `importColumns` 映射后的业务记录，用于数值、状态、默认值等转换；与原始行 `importTransformer` 二选一。 |
| `importApi` | `(rows, ctx) => void \| Promise<void>` | 导入接口。执行成功后内管模式会自动 `refreshCreate()`。 |
| `onImportError` | `(error, ctx) => void \| Promise<void>` | 导入失败回调。 |
| `content` | `string \| Component \| (ctx) => VNodeChild` | 确认框内容。常用于 `delete`。 |
| `permission` | `string` | 权限标识，透传给 `v-auth`。 |
| `icon` | `string \| Component` | 图标。字符串使用 `ArtSvgIcon`。 |
| `disabled` | `boolean \| (ctx) => boolean` | 是否禁用。 |
| `selectionRequired` | `boolean` | 是否需要选中行。`delete` 默认 `true`。 |
| `confirm` | `boolean` | 是否点击前确认。`delete` 默认 `true`。 |
| `confirmTitle` | `string` | 确认框标题。 |
| `slot` | `string` | 使用指定 slot 自定义该 action。 |
| `render` | `Component` | 使用组件自定义该 action。 |
| `buttonProps` | `Record<string, any>` | 透传给 `ElButton`。 |
| `exportColumns` | `ArtTableQueryExcelColumns` | 导出列配置。未传时默认使用当前显示列，排除操作、选择、展开、序号列。 |
| `exportFilename` | `string \| (ctx) => string` | 导出文件名。 |
| `exportSheetName` | `string` | Excel sheet 名称。 |
| `exportMaxRows` | `number` | 默认导出最大行数。默认 `10000`。 |
| `exportApi` | `(params, ctx) => unknown \| Promise<unknown>` | 后台导出数据接口。 |
| `exportResponseAdapter` | `ArtTableQueryResponseAdapter` | 导出响应适配器。未传时复用组件 `responseAdapter` 或默认适配器。 |
| `exportData` | `(ctx) => rows \| Promise<rows>` | 自定义前端导出数据来源。 |

### Context

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `action` | `ArtTableQueryHeaderAction` | 当前 action 配置。 |
| `scope` | `'default' \| 'selection'` | 当前动作位于普通操作面或勾选批量操作面。普通导出按当前筛选，批量导出只导出选中行。 |
| `selectedRows` | `Record<string, any>[]` | 当前选中行。 |
| `selectedCount` | `number` | 当前选中数量。 |
| `event` | `MouseEvent \| undefined` | 点击事件。 |
| `api` | `{ refreshData, refreshCreate, refreshUpdate, refreshRemove, getData }` | 表格刷新 API。 |

## 导入导出

### Excel 列配置

```ts
const excelColumns: ArtTableQueryExcelColumn[] = [
  { key: 'companyName', title: '保险公司名称', required: true },
  { key: 'contactPerson', title: '联系人' },
  { key: 'contactPhone', title: '联系电话' }
]
```

| 字段        | 说明             |
| ----------- | ---------------- |
| `key`       | 业务字段名。     |
| `title`     | Excel 表头。     |
| `required`  | 导入时是否必填。 |
| `width`     | 导出列宽。       |
| `formatter` | 导出格式化函数。 |

### 导入

```ts
const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    type: 'import',
    importColumns: excelColumns,
    importApi: async (rows) => {
      await importRows(rows)
    },
    onImportError: () => {
      ElMessage.error('导入文件解析失败')
    }
  }
])
```

导入处理优先级：

1. 如果传 `importTransformer`，使用它转换原始 Excel 行。普通业务字段转换使用 `importRecordTransformer`：公共组件先按 `importColumns` 将中文表头映射成字段名，再调用转换函数；不需要调用方重复映射。映射后转换会在缺少必填字段时阻止整批提交并提示缺失行数，避免静默跳过错误行后部分写入。
2. 否则如果传 `importColumns`，按列配置把 Excel 表头映射为业务字段。
3. 如果传 `importApi`，提交转换后的 rows。
4. `importApi` 成功后，内管模式自动 `refreshCreate()`。
5. 最后触发 `onImportSuccess(rows, ctx)`。

### 导出

```ts
const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    type: 'export',
    exportFilename: '保险公司',
    exportSheetName: '保险公司',
    exportColumns: excelColumns,
    exportApi: ({ selectedIds, searchParams, maxRows }) => {
      return exportList({
        ...searchParams,
        ids: selectedIds.map(String),
        maxRows
      })
    }
  }
])
```

默认导出数据来源优先级：

1. `exportApi`
2. `exportData`
3. 当前选中行
4. `apiFn` 每批 500 行读取全部筛选结果，使用 `exportMaxRows` 限制总行数；超限、缺页或响应格式无效时阻止下载。自定义 `responseAdapter` 必须提供真实总数，不能用单页长度代替。
5. 当前表格数据

默认导出列：

- 使用当前 `resolvedColumns`
- 需要有 `prop`
- `label` 必须是字符串
- 排除 `operation`
- 排除 `selection`、`expand`、`index`、`globalIndex`
- `exportable === false` 的列不导出

## 行拖拽

列配置支持拖拽手柄：

```ts
const columnsFactory = (): ColumnOption<Row>[] => [
  {
    prop: 'name',
    label: '名称',
    draggable: true,
    dragDisabled: (row) => row.status === 'disabled',
    dragIcon: 'ri:drag-move-2-fill'
  }
]
```

| 字段           | 类型                          | 默认值                | 说明                 |
| -------------- | ----------------------------- | --------------------- | -------------------- |
| `draggable`    | `boolean \| (row) => boolean` | `false`               | 是否展示拖拽按钮。   |
| `dragDisabled` | `boolean \| (row) => boolean` | `false`               | 是否禁用当前行拖拽。 |
| `dragIcon`     | `string`                      | `ri:drag-move-2-fill` | 拖拽按钮图标。       |

监听拖拽结束：

```vue
<ArtTableQuery
  :api-fn="fetchTableData"
  :columns-factory="columnsFactory"
  @row-drag-end="handleRowDragEnd"
/>
```

```ts
const handleRowDragEnd = async ({ row, targetRow, oldIndex, newIndex }) => {
  if (!row || !targetRow || oldIndex === newIndex) return
  await updateSort(row, targetRow, oldIndex, newIndex)
  await tableQueryRef.value?.refreshData()
}
```

树表格拖拽依赖 `tableProps.rowKey`，必须保证 row key 稳定。

## 自定义 action 渲染

### slot

```ts
const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  { key: 'custom', slot: 'custom-action' }
])
```

```vue
<ArtTableQuery :header-actions="headerActions">
  <template #custom-action="{ selectedRows, selectedCount }">
    <ElButton @click="doSomething(selectedRows)">
      自定义 {{ selectedCount }}
    </ElButton>
  </template>
</ArtTableQuery>
```

### render

```ts
const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
  {
    key: 'custom-render',
    render: CustomAction
  }
])
```

## 标准 CRUD 示例

```vue
<template>
  <div class="art-full-height">
    <ArtTableQuery
      ref="tableQueryRef"
      v-model="searchQuery"
      :search-items="searchItems"
      :api-fn="fetchTableData"
      :columns-factory="columnsFactory"
      :header-actions="headerActions"
    />

    <FeatureDialog ref="dialogRef" @success="handleSaveSuccess" />
  </div>
</template>
```

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
    content: ({ selectedCount }) => `确定删除选中的 ${selectedCount} 条数据吗？`,
    onClick: async ({ selectedRows }) => {
      await batchDelete(selectedRows.map((row) => row.id))
      await tableQueryRef.value?.refreshRemove()
    }
  }
])

const handleSaveSuccess = (type: 'add' | 'edit'): void => {
  void (type === 'add'
    ? tableQueryRef.value?.refreshCreate()
    : tableQueryRef.value?.refreshUpdate())
}
```

## 注意事项

- 标准 CRUD 页面优先使用内管模式。
- 内管模式中不要在 `search/reset/refresh/pagination` 事件里重复调用同一个刷新方法。
- `searchItems` 和 `searchBarProps.items` 同时存在时，优先使用 `searchItems`。
- `tableProps` 会在内部默认值之后合并，因此可以覆盖 `rowKey`、`tableLayout`。
- `immediate=false` 只阻止首次自动请求，不影响后续查询、分页、刷新。
- 批量删除可继续声明在 `headerActions` 中并由组件自动切换，也可用 `selectionActions.type = 'delete'` 显式覆盖；删除成功后调用 `api.refreshRemove()` 或 `tableQueryRef.value?.refreshRemove()`。
- 新增成功用 `refreshCreate()`，编辑成功用 `refreshUpdate()`，删除成功用 `refreshRemove()`。
- 导入导出列配置优先放在 `ArtTableQuery` 的 action 中，不要在业务页面堆页面级 Excel 解析/导出逻辑。
- 行拖拽只负责 UI 事件，不在公共组件里写业务持久化；业务页监听 `row-drag-end` 后自行保存。
