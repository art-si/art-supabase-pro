<!-- 查询表格组合组件：整合 ArtSearchBar + ArtTableHeader + ArtTable -->
<template>
  <div
    ref="rootRef"
    class="art-table-query"
    :class="{
      'is-focus-mode': focusMode,
      'has-visible-search': hasSearchBar && showSearchBar
    }"
  >
    <ElScrollbar
      v-if="hasSearchBar"
      v-show="showSearchBar"
      class="art-table-query__search-scrollbar"
    >
      <ArtSearchBar
        v-model="searchModel"
        v-bind="resolvedSearchBarProps"
        :search-loading="resolvedLoading && !iconOnlyRefresh"
        @search="handleSearch"
        @reset="handleReset"
      >
        <template v-for="slotName in searchBarSlotNames" :key="slotName" #[slotName]="slotProps">
          <slot :name="`search-${slotName}`" v-bind="slotProps" />
        </template>
      </ArtSearchBar>
    </ElScrollbar>

    <Teleport
      v-if="headerActionDestination && visibleHeaderActions.length"
      :key="shouldTeleportHeaderActions ? 'workspace-header-actions' : 'table-header-actions'"
      :to="headerActionDestination"
      defer
    >
      <template v-for="action in visibleHeaderActions" :key="getHeaderActionKey(action)">
        <span
          v-auth="getHeaderActionPermission(action)"
          :class="getHeaderActionClass()"
          :inert="iconOnlyRefresh || undefined"
        >
          <slot v-if="action.slot" :name="action.slot" v-bind="getHeaderActionSlotProps(action)" />
          <component
            v-else-if="action.render"
            :is="action.render"
            v-bind="getHeaderActionSlotProps(action)"
          />
          <ArtExcelImport
            v-else-if="action.type === 'import'"
            :button-props="getHeaderActionButtonProps(action)"
            :disabled="isHeaderActionDisabled(action)"
            :icon="getHeaderActionIcon(action)"
            @import-success="handleHeaderActionImportSuccess(action, $event)"
            @import-error="handleHeaderActionImportError(action, $event)"
          >
            <component
              v-if="typeof getHeaderActionLabel(action) !== 'string'"
              :is="getHeaderActionLabel(action)"
            />
            <span v-else>{{ getHeaderActionLabel(action) }}</span>
          </ArtExcelImport>
          <ElButton
            v-else
            v-bind="getHeaderActionButtonProps(action)"
            :disabled="isHeaderActionDisabled(action)"
            @click="handleHeaderActionClick(action, $event)"
            v-ripple
          >
            <template v-if="getHeaderActionIcon(action)" #icon>
              <component
                v-if="typeof getHeaderActionIcon(action) !== 'string'"
                :is="getHeaderActionIcon(action)"
              />
              <ArtSvgIcon v-else :icon="String(getHeaderActionIcon(action))" />
            </template>
            <component
              v-if="typeof getHeaderActionLabel(action) !== 'string'"
              :is="getHeaderActionLabel(action)"
            />
            <span v-else>{{ getHeaderActionLabel(action) }}</span>
          </ElButton>
        </span>
      </template>
    </Teleport>

    <ElCard
      class="art-table-card"
      :class="{
        'has-header-top': hasHeaderTopContent,
        'has-table-header': shouldRenderTableHeader,
        'is-table-only': !hasHeaderTopContent && !shouldRenderTableHeader
      }"
      shadow="never"
    >
      <div v-if="hasHeaderTopContent" ref="headerTopRef" class="art-table-query__header-top">
        <div v-if="sectionTitle" class="art-table-query__section-heading">
          <div class="art-table-query__section-copy">
            <ArtSectionTitle :title="sectionTitle" :show-line="false" />
            <p v-if="sectionSubtitle" class="art-table-query__section-subtitle">
              {{ sectionSubtitle }}
            </p>
          </div>
          <div
            v-if="hasStandaloneHeaderActions"
            ref="sectionHeaderActionHostRef"
            class="art-table-query__section-actions"
          />
        </div>
        <slot
          v-if="$slots['table-header-top']"
          name="table-header-top"
          :selected-rows="selectedRows"
          :selected-count="selectedRows.length"
        />
      </div>

      <ArtTableHeader
        v-if="shouldRenderTableHeader"
        v-model:columns="resolvedColumnsModel"
        class="art-table-query__command-bar"
        :class="{
          'has-selection': showSelectionBar,
          'has-tools': effectiveShowTableToolbar
        }"
        v-bind="mergedTableHeaderProps"
        :show-search-bar="effectiveShowTableToolbar && hasSearchBar ? showSearchBar : undefined"
        :focus-mode="
          effectiveShowTableToolbar && focusable && (focusMode || !workspaceHeaderActionHostRef)
            ? focusMode
            : undefined
        "
        @update:show-search-bar="handleShowSearchBarChange"
        @update:focus-mode="handleFocusModeChange"
        @refresh="handleRefresh"
        @search="emit('header-search')"
      >
        <template #left>
          <div
            v-if="showSelectionBar || shouldRenderHeaderActionsInTable || $slots['header-left']"
            class="art-table-query__header-left"
          >
            <slot
              v-if="showSelectionBar && $slots['selection-bar']"
              name="selection-bar"
              :selected-rows="selectedRows"
              :selected-count="selectedRows.length"
              :clear-selection="clearSelectedRows"
            />

            <div
              v-else-if="showSelectionBar"
              class="art-table-query__selection-bar"
              role="region"
              aria-label="批量操作"
            >
              <div class="art-table-query__selection-summary" aria-live="polite">
                <ArtSvgIcon icon="ri:checkbox-circle-line" aria-hidden="true" />
                <span
                  >已选择 <strong>{{ selectedRows.length }}</strong> 项</span
                >
              </div>

              <ElConfigProvider size="small">
                <div class="art-table-query__selection-actions">
                  <template
                    v-for="(action, actionIndex) in visibleSelectionActions"
                    :key="getSelectionActionKey(action, actionIndex)"
                  >
                    <span
                      v-auth="getHeaderActionPermission(action)"
                      class="art-table-query__selection-action"
                      :inert="iconOnlyRefresh || undefined"
                    >
                      <slot
                        v-if="action.slot"
                        :name="action.slot"
                        v-bind="getHeaderActionSlotProps(action, 'selection')"
                      />
                      <component
                        v-else-if="action.render"
                        :is="action.render"
                        v-bind="getHeaderActionSlotProps(action, 'selection')"
                      />
                      <ArtExcelImport
                        v-else-if="action.type === 'import'"
                        :button-props="getSelectionActionButtonProps(action)"
                        :disabled="isHeaderActionDisabled(action, 'selection')"
                        :icon="getHeaderActionIcon(action)"
                        @import-success="
                          handleHeaderActionImportSuccess(action, $event, 'selection')
                        "
                        @import-error="handleHeaderActionImportError(action, $event, 'selection')"
                      >
                        <component
                          v-if="typeof getSelectionActionLabel(action) !== 'string'"
                          :is="getSelectionActionLabel(action)"
                        />
                        <span v-else>{{ getSelectionActionLabel(action) }}</span>
                      </ArtExcelImport>
                      <ElButton
                        v-else
                        v-bind="getSelectionActionButtonProps(action)"
                        :disabled="isHeaderActionDisabled(action, 'selection')"
                        @click="handleHeaderActionClick(action, $event, 'selection')"
                        v-ripple
                      >
                        <template v-if="getHeaderActionIcon(action)" #icon>
                          <component
                            v-if="typeof getHeaderActionIcon(action) !== 'string'"
                            :is="getHeaderActionIcon(action)"
                          />
                          <ArtSvgIcon v-else :icon="String(getHeaderActionIcon(action))" />
                        </template>
                        <component
                          v-if="typeof getSelectionActionLabel(action) !== 'string'"
                          :is="getSelectionActionLabel(action)"
                        />
                        <span v-else>{{ getSelectionActionLabel(action) }}</span>
                      </ElButton>
                    </span>
                  </template>

                  <span
                    v-if="visibleSelectionActions.length"
                    class="art-table-query__selection-divider"
                    aria-hidden="true"
                  />
                  <ElButton
                    class="art-table-query__selection-clear"
                    size="small"
                    link
                    type="primary"
                    @click="clearSelectedRows"
                  >
                    取消选择
                  </ElButton>
                </div>
              </ElConfigProvider>
              <slot
                name="selection-details"
                :selected-rows="selectedRows"
                :selected-count="selectedRows.length"
              />
            </div>

            <div
              v-if="!showSelectionBar && shouldRenderHeaderActionsInTable"
              ref="tableHeaderActionHostRef"
              class="art-table-query__header-actions"
            />
            <slot
              v-if="!showSelectionBar"
              name="header-left"
              :selected-rows="selectedRows"
              :selected-count="selectedRows.length"
            />
          </div>
        </template>
        <template v-if="$slots['header-right']" #right>
          <slot name="header-right" />
        </template>
      </ArtTableHeader>

      <slot v-if="$slots.content" name="content" />
      <ElScrollbar
        v-else-if="isManaged && managedTable.error.value && !resolvedLoading"
        class="art-table-query__error-state"
        tabindex="0"
      >
        <ArtEmptyState
          size="compact"
          :visual-size="80"
          title="数据加载失败"
          description="暂时无法获取列表，请检查网络后重试。"
        >
          <ElButton type="primary" @click="handleRefresh">重新加载</ElButton>
        </ArtEmptyState>
      </ElScrollbar>
      <ArtTable
        v-else
        ref="tableRef"
        v-bind="artTableBindings"
        @row-drag-start="handleRowDragStart"
        @row-drag-update="handleRowDragUpdate"
        @row-drag-end="handleRowDragEnd"
      >
        <template v-for="slotName in tableSlotNames" :key="slotName" #[slotName]="slotProps">
          <slot :name="slotName" v-bind="slotProps" />
        </template>
        <template v-if="$slots.default" #default>
          <slot />
        </template>
      </ArtTable>
    </ElCard>
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    h,
    nextTick,
    onActivated,
    onBeforeUnmount,
    onDeactivated,
    onMounted,
    ref,
    shallowRef,
    watch,
    type Component,
    type ComputedRef,
    type VNode,
    type VNodeChild
  } from 'vue'
  import type { ButtonProps, TableColumnCtx, TableProps } from 'element-plus'
  import { ElMessage } from 'element-plus'
  import { useEventListener, useRafFn, useResizeObserver } from '@vueuse/core'
  import { cloneDeep, get, uniqBy } from 'lodash-es'
  import {
    commandIcon,
    isRangeAction,
    singleActionLabel,
    tableRowCommandsKey
  } from './row-action-context'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import ArtExcelImport from '@/components/core/forms/art-excel-import/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ArtTableInstance } from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTable, type TableRequestOptions } from '@/hooks/core/useTable'
  import type { ApiResponse } from '@/utils/table/table-cache'
  import {
    defaultResponseAdapter,
    extractTableData,
    loadTableExportRows,
    type TableError
  } from '@/utils/table/table-utils'
  import { exportExcel, mapExcelRowsToRecords, type ExcelColumn } from '@/utils/file'
  import { useCrossPageSelection } from './use-cross-page-selection'
  import { useRoute } from 'vue-router'
  import { useTenantScopeAccessPolicy } from '@/hooks/core/useTenantScopeAccessPolicy'
  import { resolveBusinessButtonPermission } from '@/utils/business-permission'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useUserStore } from '@/store/modules/user'
  import { toDictionaryOption } from '@/utils/form/option'
  import { isPlainObjectRecord } from '@/utils/type-guards'
  import { getFriendlySupabaseErrorMessage, wasErrorUserNotified } from '@/utils/supabase'
  import {
    filterTenantDimensionDescriptors,
    isTenantDimensionDescriptor
  } from '@/utils/tenant-dimension-visibility'

  defineOptions({ name: 'ArtTableQuery' })

  const { hasAuth } = useAuth()
  const captureExportScope = useTenantOperationGuard()
  const userStore = useUserStore()
  const { confirmAction } = useArtFeedback()
  const route = useRoute()
  const { isCrossTenantReadOnly } = useTenantScopeAccessPolicy()
  const { isPlatformScope } = storeToRefs(useTenantScopeStore())

  export interface ArtTableQuerySanitizeOutputOptions {
    /** 移除空字符串 */
    removeEmptyString: boolean
    /** 移除空数组 */
    removeEmptyArray: boolean
    /** 移除清洗后为空的对象 */
    removeEmptyObject: boolean
    /** 移除空富文本占位内容 */
    removeEmptyRichText: boolean
    /** 保留数字 0 */
    keepZero: boolean
    /** 保留 boolean false */
    keepFalse: boolean
  }

  /** ArtSearchBar 除 modelValue 外的 props */
  export interface ArtTableQuerySearchBarProps {
    /** 查询表单项，推荐优先使用 ArtTableQuery.searchItems */
    items?: SearchFormItem[]
    /** 默认列宽，基于 24 栅格 */
    span?: number
    /** 表单项间距 */
    gutter?: number
    /** 是否强制展开所有查询项 */
    isExpand?: boolean
    /** 默认是否展开 */
    defaultExpanded?: boolean
    /** label 位置 */
    labelPosition?: 'left' | 'right' | 'top'
    /** label 宽度 */
    labelWidth?: string | number
    /** 是否显示展开/收起 */
    showExpand?: boolean
    /** 查询项数量小于等于该值时按钮左对齐 */
    buttonLeftLimit?: number
    /** 是否显示重置按钮 */
    showReset?: boolean
    /** 异步重置业务筛选时的按钮加载状态 */
    resetLoading?: boolean
    /** 是否显示查询按钮 */
    showSearch?: boolean
    /** 是否禁用查询按钮 */
    disabledSearch?: boolean
    /** 是否允许在查询项中按 Enter 触发查询 */
    enableEnterSearch?: boolean
    /** 查询输出清洗策略 */
    sanitizeOutput?: Partial<ArtTableQuerySanitizeOutputOptions>
  }

  /** ArtTableHeader 除 columns、showSearchBar、loading 外的 props */
  export interface ArtTableQueryTableHeaderProps {
    /** 是否显示斑马纹设置项 */
    showZebra?: boolean
    /** 是否显示边框设置项 */
    showBorder?: boolean
    /** 是否显示表头背景设置项 */
    showHeaderBackground?: boolean
    /** 全屏容器 class */
    fullClass?: string
    /** 工具栏布局，逗号分隔，如 search,refresh,size,fullscreen,columns,settings */
    layout?: string
  }

  export type ArtTableQueryTableSize = 'small' | 'default' | 'large'
  // Vue SFC props cannot expose a component-level row generic. Keep the dynamic boundary here;
  // business callbacks narrow it through the exported generic helper types below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type TableQueryRecord = Record<string, any>
  type HeaderButtonProps = Omit<Partial<ButtonProps>, 'type'> & {
    type?: '' | 'default' | 'primary' | 'success' | 'warning' | 'info' | 'danger' | 'text'
  }
  // Page APIs own incompatible parameter models, so the non-generic SFC boundary remains broad.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type TableQueryApiParams = any
  type TableQueryApiResponse = unknown
  // Vue's dynamic slot index signature must accept heterogeneous child-component payloads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type TableQuerySlotProps = any

  type BivariantSyncHandler<TParams, TResponse> = {
    bivarianceHack(params: TParams): TResponse
  }['bivarianceHack']

  type BivariantEventHandler<TArgs extends unknown[]> = {
    bivarianceHack(...args: TArgs): void
  }['bivarianceHack']

  export interface ArtTableQueryPaginationOptions {
    /** 每页条数选项 */
    pageSizes?: number[]
    /** 分页对齐方式 */
    align?: 'left' | 'center' | 'right'
    /** 分页布局 */
    layout?: string
    /** 是否显示分页背景 */
    background?: boolean
    /** 只有一页时是否隐藏分页 */
    hideOnSinglePage?: boolean
    /** 分页尺寸 */
    size?: ArtTableQueryTableSize
    /** 页码按钮数量 */
    pagerCount?: number
  }

  type ElementTablePassThroughProps = Partial<Omit<TableProps<TableQueryRecord>, 'data'>>

  /**
   * 透传给 ArtTable / Element Plus ElTable 的属性。
   * data、columns、loading、pagination 由 ArtTableQuery 接管，不建议在 tableProps 里传。
   */
  export interface ArtTableQueryTableProps extends ElementTablePassThroughProps {
    /** 有现有行时也显示表格加载遮罩。 */
    loadingOverlay?: boolean
    /** 行数据 key，默认 id */
    rowKey?: string | BivariantSyncHandler<TableQueryRecord, string>
    /** 表格布局，默认 fixed */
    tableLayout?: 'fixed' | 'auto'
    /** 表格高度 */
    height?: string | number
    /** 表格最大高度 */
    maxHeight?: string | number
    /** 是否带斑马纹；未传时使用全局表格设置 */
    stripe?: boolean
    /** 是否带边框；未传时使用全局表格设置 */
    border?: boolean
    /** 表格尺寸；未传时使用全局表格设置 */
    size?: ArtTableQueryTableSize
    /** 列宽是否自动撑开 */
    fit?: boolean
    /** 是否显示表头 */
    showHeader?: boolean
    /** 是否高亮当前行 */
    highlightCurrentRow?: boolean
    /** 当前行 key */
    currentRowKey?: string | number
    /** 空数据时是否按最大高度撑开 */
    flexible?: boolean
    /** 是否默认展开所有行 */
    defaultExpandAll?: boolean
    /** 默认展开行 key */
    expandRowKeys?: string[]
    /** 树形数据懒加载 */
    lazy?: boolean
    /** 树形数据加载函数 */
    load?: TableProps<TableQueryRecord>['load']
    /** 树形数据配置 */
    treeProps?: TableProps<TableQueryRecord>['treeProps']
    /** tooltip 配置 */
    tooltipOptions?: TableProps<TableQueryRecord>['tooltipOptions']
    /** 表头行 class */
    headerRowClassName?: TableProps<TableQueryRecord>['headerRowClassName']
    /** 表头行 style */
    headerRowStyle?: TableProps<TableQueryRecord>['headerRowStyle']
    /** 表头单元格 class */
    headerCellClassName?: TableProps<TableQueryRecord>['headerCellClassName']
    /** 表头单元格 style */
    headerCellStyle?: TableProps<TableQueryRecord>['headerCellStyle']
    /** 行 class */
    rowClassName?: TableProps<TableQueryRecord>['rowClassName']
    /** 行 style */
    rowStyle?: TableProps<TableQueryRecord>['rowStyle']
    /** 单元格 class */
    cellClassName?: TableProps<TableQueryRecord>['cellClassName']
    /** 单元格 style */
    cellStyle?: TableProps<TableQueryRecord>['cellStyle']
    /** 合并行列 */
    spanMethod?: TableProps<TableQueryRecord>['spanMethod']
    /** 默认排序 */
    defaultSort?: TableProps<TableQueryRecord>['defaultSort']
    /** tooltip effect */
    tooltipEffect?: TableProps<TableQueryRecord>['tooltipEffect']
    /** 是否显示溢出 tooltip */
    showOverflowTooltip?: TableProps<TableQueryRecord>['showOverflowTooltip']
    /** 空数据表格高度，默认 100% */
    emptyHeight?: string
    /** 空数据文案 */
    emptyText?: string
    /** 空数据辅助说明 */
    emptyDescription?: string
    /** 是否启用表头高度参与表格高度计算，默认 true */
    showTableHeader?: boolean
    /** 工具栏上方额外内容占用的高度 */
    additionalHeightOffset?: number
    /** 分页器配置 */
    paginationOptions?: ArtTableQueryPaginationOptions
    /** ElTable 行点击事件 */
    onRowClick?: BivariantEventHandler<
      [TableQueryRecord, TableColumnCtx<TableQueryRecord> | null, PointerEvent]
    >
    /** ElTable 行双击事件 */
    onRowDblclick?: BivariantEventHandler<
      [TableQueryRecord, TableColumnCtx<TableQueryRecord> | null, MouseEvent]
    >
    /** ElTable 当前行变化事件 */
    onCurrentChange?: BivariantEventHandler<[TableQueryRecord | null, TableQueryRecord | null]>
    /** ElTable 选择项变化事件 */
    onSelectionChange?: BivariantEventHandler<[TableQueryRecord[]]>
  }

  export type ArtTableQueryApiFn<
    TParams = TableQueryApiParams,
    TResponse = TableQueryApiResponse
  > = {
    bivarianceHack(params: TParams, options?: TableRequestOptions): Promise<TResponse>
  }['bivarianceHack']
  export type ArtTableQueryResponseAdapter<
    TRecord = TableQueryRecord,
    TResponse = TableQueryApiResponse
  > = BivariantSyncHandler<TResponse, ApiResponse<TRecord>>
  export type ArtTableQueryDataTransformer<TRecord = TableQueryRecord> = BivariantSyncHandler<
    TRecord[],
    TRecord[]
  >
  export type ArtTableQuerySuccessHandler<TRecord = TableQueryRecord> = BivariantEventHandler<
    [TRecord[], ApiResponse<TRecord>]
  >
  export type ArtTableQueryHeaderActionType = 'add' | 'delete' | 'import' | 'export'
  export type ArtTableQueryHeaderActionContent =
    string | Component | ((ctx: ArtTableQueryHeaderActionContext) => VNodeChild)
  export type ArtTableQueryExcelColumn = ExcelColumn<TableQueryRecord>
  export type ArtTableQueryExcelColumns =
    | ArtTableQueryExcelColumn[]
    | ((ctx: ArtTableQueryHeaderActionContext) => ArtTableQueryExcelColumn[])
  export interface ArtTableQueryExportApiParams {
    selectedRows: TableQueryRecord[]
    selectedIds: Array<string | number>
    selectedCount: number
    searchParams: Record<string, unknown>
    columns: ArtTableQueryExcelColumn[]
    maxRows: number
  }

  export interface ArtTableQueryHeaderActionContext {
    action: ArtTableQueryHeaderAction
    /** 动作所在交互面：普通操作或勾选后的批量操作。 */
    scope: 'default' | 'selection'
    selectedRows: TableQueryRecord[]
    selectedCount: number
    event?: MouseEvent
    api: Pick<
      ArtTableQueryExpose,
      'refreshData' | 'refreshCreate' | 'refreshUpdate' | 'refreshRemove' | 'getData'
    >
  }

  export interface ArtTableQueryHeaderAction {
    /** 唯一标识，未传时使用 type 或数组索引 */
    key?: string
    /** 预制类型；不传 type 时可使用 slot/render 自定义 */
    type?: ArtTableQueryHeaderActionType
    /** 是否隐藏，支持按当前选中行动态判断 */
    hidden?: boolean | ((ctx: ArtTableQueryHeaderActionContext) => boolean)
    /** 按钮文本；未传时使用预制类型默认文案 */
    label?: string | Component
    /** 点击回调；批量删除确认后才会触发 */
    onClick?: (ctx: ArtTableQueryHeaderActionContext) => void | Promise<void>
    /** Excel 导入成功回调，仅 type=import 时生效 */
    onImportSuccess?: (
      data: Array<Record<string, unknown>>,
      ctx: ArtTableQueryHeaderActionContext
    ) => void | Promise<void>
    importColumns?: ArtTableQueryExcelColumns
    importTransformer?: (
      rows: Array<Record<string, unknown>>,
      ctx: ArtTableQueryHeaderActionContext
    ) => Array<TableQueryRecord> | Promise<Array<TableQueryRecord>>
    /** 在 importColumns 映射完成后转换业务记录；与原始行 importTransformer 二选一。 */
    importRecordTransformer?: (
      rows: Array<TableQueryRecord>,
      ctx: ArtTableQueryHeaderActionContext
    ) => Array<TableQueryRecord> | Promise<Array<TableQueryRecord>>
    importApi?: (
      rows: Array<TableQueryRecord>,
      ctx: ArtTableQueryHeaderActionContext
    ) => void | Promise<void>
    /** Excel 导入失败回调，仅 type=import 时生效 */
    onImportError?: (error: Error, ctx: ArtTableQueryHeaderActionContext) => void | Promise<void>
    /** 文件解析成功后，转换、提交或刷新失败时的自定义处理；默认显示可读错误。 */
    onImportSubmitError?: (
      error: Error,
      ctx: ArtTableQueryHeaderActionContext
    ) => void | Promise<void>
    /** 确认框内容；delete 默认启用确认框 */
    content?: ArtTableQueryHeaderActionContent
    /** 权限标识，会透传给 v-auth */
    permission?: string
    /** 图标；字符串使用 ArtSvgIcon，组件直接渲染 */
    icon?: string | Component
    /** 是否禁用，支持按当前选中行动态判断 */
    disabled?: boolean | ((ctx: ArtTableQueryHeaderActionContext) => boolean)
    /** 是否需要选中行；delete 默认 true */
    selectionRequired?: boolean
    /** False for commands whose business meaning requires a group rather than one record. */
    rowAction?: boolean
    /** 是否点击前确认；delete 默认 true，其他默认 false */
    confirm?: boolean
    /** 确认框标题 */
    confirmTitle?: string
    /** 自定义 slot 名；传入后不渲染默认按钮 */
    slot?: string
    /** 自定义渲染组件；传入后不渲染默认按钮 */
    render?: Component
    /** 透传给 ElButton 的属性 */
    buttonProps?: HeaderButtonProps
    exportColumns?: ArtTableQueryExcelColumns
    exportFilename?: string | ((ctx: ArtTableQueryHeaderActionContext) => string)
    exportSheetName?: string
    exportMaxRows?: number
    exportApi?: (
      params: ArtTableQueryExportApiParams,
      ctx: ArtTableQueryHeaderActionContext
    ) => unknown | Promise<unknown>
    exportResponseAdapter?: ArtTableQueryResponseAdapter
    exportData?: (
      ctx: ArtTableQueryHeaderActionContext
    ) => Array<TableQueryRecord> | Promise<Array<TableQueryRecord>>
  }

  interface PaginationConfig {
    current: number
    size: number
    total: number
  }

  interface ArtTableExpose {
    elTableRef?: ArtTableInstance | null
  }

  interface ArtTableBindings extends ArtTableQueryTableProps {
    additionalHeightOffset: number
    loading: boolean
    data: TableQueryRecord[]
    columns: ColumnOption[]
    pagination: PaginationConfig
    selectedRowKeys: Array<string | number>
    'onSelection-change': (selection: TableQueryRecord[]) => void
    'onPagination:size-change': (value: number) => void
    'onPagination:current-change': (value: number) => void
  }

  export interface ArtTableQueryProps {
    /** 外部受控模式的加载状态；传 apiFn 时由组件内部 useTable 接管。 */
    loading?: boolean
    refreshFeedback?: 'table' | 'icon'
    /** 外部受控模式的表格数据；传 apiFn 时由组件内部 useTable 接管。 */
    data?: TableQueryRecord[]
    /** 外部受控模式的表格列配置；传 columnsFactory 时由组件内部 useTable 接管。 */
    tableColumns?: ColumnOption[]
    /** 外部受控模式的分页状态；传 apiFn 时由组件内部 useTable 接管。 */
    pagination?: PaginationConfig
    /** 查询表单项配置。推荐常规页面使用该属性，复杂场景再使用 searchBarProps.items。 */
    searchItems?: SearchFormItem[]
    /** 表格头部左侧操作按钮配置，内置 add/delete/import/export 四类预制按钮。 */
    headerActions?: ArtTableQueryHeaderAction[]
    /** 表格工作区标题；与 subtitle、section 操作位共同形成稳定的分区层级。 */
    sectionTitle?: string
    /** 表格工作区说明，固定显示在 sectionTitle 下方。 */
    sectionSubtitle?: string
    /** 普通态非批量操作的展示位置；workspace 会在专注模式下自动回到表格左侧。 */
    headerActionsPlacement?: 'table' | 'section' | 'workspace'
    /** 勾选数据后显示在表格上方的批量操作；未勾选时不占用空间。 */
    selectionActions?: ArtTableQueryHeaderAction[]
    /** 内管模式的数据接口。传入后 ArtTableQuery 会内部创建 useTable 并接管查询、分页、刷新。 */
    apiFn?: ArtTableQueryApiFn
    /** 内管模式的默认接口参数，默认会合并 { current: 1, size: 20 }。 */
    apiParams?: TableQueryRecord
    /** 内管模式是否挂载后立即请求接口，默认 true。false 时可通过 ref.getData()/refreshData() 手动加载。 */
    immediate?: boolean
    /** 请求前从 apiParams / 搜索参数中排除的字段 */
    excludeParams?: string[]
    /** 自定义分页字段名，默认 current / size */
    paginationKey?: { current?: string; size?: string }
    /** 是否启用 useTable 缓存 */
    enableCache?: boolean
    /** 缓存时间，单位毫秒 */
    cacheTime?: number
    /** 搜索防抖时间，单位毫秒 */
    debounceTime?: number
    /** 最大缓存条数 */
    maxCacheSize?: number
    /** 数据转换函数 */
    dataTransformer?: ArtTableQueryDataTransformer
    /** 响应适配器，用于把接口响应转成 records/total/current/size */
    responseAdapter?: ArtTableQueryResponseAdapter
    /** 请求成功回调 */
    onSuccess?: ArtTableQuerySuccessHandler
    /** 请求失败回调 */
    onError?: (error: TableError) => void
    /** 缓存命中回调 */
    onCacheHit?: ArtTableQuerySuccessHandler
    /** 是否开启 useTable 调试日志 */
    debug?: boolean
    /** 内管模式的列工厂函数，用法同 useTable.core.columnsFactory。 */
    columnsFactory?: () => ColumnOption[]
    /** 列工厂依赖的业务上下文；变化时重新生成列。 */
    columnsContextKey?: string | number
    /** 透传给 ArtSearchBar 的额外配置，例如 labelWidth、span、showExpand。 */
    searchBarProps?: ArtTableQuerySearchBarProps
    /** 透传给 ArtTableHeader 的额外配置，例如 layout、showBorder。 */
    tableHeaderProps?: ArtTableQueryTableHeaderProps
    /** 是否显示表格右侧工具栏，默认关闭；左侧 headerActions 仍会按需渲染。 */
    showTableToolbar?: boolean
    /** 透传给 ArtTable 的额外配置，默认已内置 rowKey: 'id'、tableLayout: 'fixed'。 */
    tableProps?: ArtTableQueryTableProps
    /** 是否允许专注模式；工具栏开启时显示入口，也可通过 v-model:focus-mode 从页面头部进入。 */
    focusable?: boolean
    /**
     * 专注模式需要整体保留的最近祖先选择器。
     * 适用于“导航树 + 查询表格”等复合工作区；未传时仅保留当前查询表格。
     */
    focusScopeSelector?: string
  }

  const props = withDefaults(defineProps<Omit<ArtTableQueryProps, 'showTableToolbar'>>(), {
    loading: false,
    data: () => [],
    tableColumns: () => [],
    searchItems: () => [],
    headerActions: () => [],
    headerActionsPlacement: 'table',
    selectionActions: () => [],
    apiParams: () => ({}),
    immediate: true,
    excludeParams: () => [],
    enableCache: false,
    cacheTime: 5 * 60 * 1000,
    debounceTime: 300,
    maxCacheSize: 50,
    debug: false,
    searchBarProps: () => ({}),
    tableHeaderProps: () => ({}),
    tableProps: () => ({}),
    focusable: false
  })

  const searchModel = defineModel<TableQueryRecord>({ default: () => ({}) })
  const columnsModel = defineModel<ColumnOption[]>('columns', { default: () => [] })
  const showSearchBar = defineModel<boolean>('showSearchBar', { default: true })
  const showTableToolbar = defineModel<boolean>('showTableToolbar', { default: false })
  const focusMode = defineModel<boolean>('focusMode', { default: false })
  const importPending = ref(false)
  const pendingActionKey = ref<string | null>(null)
  const initialSearchModel = ref<Record<string, unknown>>({})
  const rootRef = ref<HTMLElement>()
  const tableRef = ref<ArtTableExpose | null>(null)
  const headerTopRef = ref<HTMLElement>()
  const tableHeaderActionHostRef = ref<HTMLElement>()
  const sectionHeaderActionHostRef = ref<HTMLElement>()
  const workspaceHeaderActionHostRef = shallowRef<HTMLElement>()
  const headerTopHeight = ref(0)

  export interface ArtTableQueryEmits {
    /** 点击查询按钮时触发。内管模式下组件会先自动 replaceSearchParams + getData。 */
    search: [Record<string, unknown>]
    /** 点击重置按钮时触发。内管模式下组件会先自动 resetSearchParams。 */
    reset: []
    /** 点击表格头部刷新按钮时触发。内管模式下组件会先自动 refreshData。 */
    refresh: []
    /** 点击表格头部搜索显隐按钮时触发。 */
    'header-search': []
    /** 专注模式状态变化时触发。 */
    'focus-change': [boolean]
    /** ElTable selection-change 透传。 */
    'selection-change': [TableQueryRecord[]]
    /** 行拖拽开始透传。 */
    'row-drag-start': [TableQueryRecord]
    /** 行拖拽位置更新透传。 */
    'row-drag-update': [TableQueryRecord]
    /** 行拖拽结束透传。 */
    'row-drag-end': [TableQueryRecord]
    /** 分页 page-size 改变时触发。内管模式下组件会先自动处理分页。 */
    'pagination:size-change': [number]
    /** 分页 current-page 改变时触发。内管模式下组件会先自动处理分页。 */
    'pagination:current-change': [number]
    /** 点击头部操作按钮时触发。 */
    'header-action-click': [
      action: ArtTableQueryHeaderAction,
      ctx: ArtTableQueryHeaderActionContext
    ]
  }

  const emit = defineEmits<ArtTableQueryEmits>()

  export interface ArtTableQueryHeaderLeftSlotProps {
    /** 当前跨页选中的完整行 */
    selectedRows: TableQueryRecord[]
    /** 当前跨页选中数量 */
    selectedCount: number
  }

  export interface ArtTableQuerySelectionBarSlotProps extends ArtTableQueryHeaderLeftSlotProps {
    /** 清空当前跨页选择。 */
    clearSelection: () => void
  }

  export interface ArtTableQuerySlots {
    /** 替换表格区域，共用查询条件和工具栏，适用于图表等替代视图。 */
    content?: () => VNodeChild
    /** 工具栏左侧扩展区，渲染在 headerActions 后 */
    'header-left'?: (props: ArtTableQueryHeaderLeftSlotProps) => VNodeChild
    /** 工具栏右侧扩展区 */
    'header-right'?: () => VNodeChild
    /** 勾选后批量操作条；传入后替换 selectionActions 的默认外观。 */
    'selection-bar'?: (props: ArtTableQuerySelectionBarSlotProps) => VNodeChild
    /** 默认批量命令栏中的补充信息，如选中行金额汇总。 */
    'selection-details'?: (props: ArtTableQueryHeaderLeftSlotProps) => VNodeChild
    /** 透传给 ArtTable 的默认插槽 */
    default?: () => VNodeChild
    /** 动态表格列插槽和 search-{key} 查询项插槽 */
    [name: string]: ((props: TableQuerySlotProps) => VNodeChild) | undefined
  }

  const slots = defineSlots<ArtTableQuerySlots>()
  const isManaged = computed(() => !!props.apiFn)
  const managedTable = useTable<TableQueryRecord>({
    core: {
      apiFn: (params: TableQueryRecord, options?: TableRequestOptions) => {
        if (!props.apiFn) {
          return Promise.resolve({ records: [], total: 0, current: 1, size: 20 })
        }
        return props.apiFn(params, options)
      },
      apiParams: {
        current: 1,
        size: 20,
        ...props.apiParams,
        ...searchModel.value
      },
      excludeParams: props.excludeParams,
      immediate: !!props.apiFn && props.immediate,
      paginationKey: props.paginationKey,
      columnsFactory: () => props.columnsFactory?.() ?? []
    },
    transform: {
      dataTransformer: props.dataTransformer,
      responseAdapter: props.responseAdapter
    },
    performance: {
      enableCache: props.enableCache,
      cacheTime: props.cacheTime,
      debounceTime: props.debounceTime,
      maxCacheSize: props.maxCacheSize
    },
    hooks: {
      onSuccess: props.onSuccess,
      onError: props.onError,
      onCacheHit: props.onCacheHit
    },
    debug: {
      enableLog: props.debug
    }
  })

  const resolvedSearchItems = computed(() =>
    props.searchItems.length > 0 ? props.searchItems : props.searchBarProps.items
  )

  const hasSearchBar = computed(() => (resolvedSearchItems.value?.length ?? 0) > 0)

  const resolvedSearchBarProps = computed(() => ({
    labelWidth: '96px',
    ...props.searchBarProps,
    items: resolvedSearchItems.value ?? []
  }))

  const resolvedTableProps = computed(() => ({
    rowKey: 'id',
    tableLayout: 'fixed',
    ...props.tableProps
  }))

  let measurementActive = true
  const { resume: measureHeaderTop, pause: stopHeaderTopMeasurement } = useRafFn(
    () => {
      const element = headerTopRef.value
      if (!element) return
      const style = window.getComputedStyle(element)
      const marginHeight =
        (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0)
      headerTopHeight.value = element.getBoundingClientRect().height + marginHeight
    },
    { immediate: false, once: true }
  )
  useResizeObserver(headerTopRef, () => {
    if (measurementActive) measureHeaderTop()
  })
  onActivated(() => {
    measurementActive = true
    measureHeaderTop()
  })

  const resolvedColumnsModel = computed({
    get: () =>
      isManaged.value
        ? (managedTable.columnChecks?.value ?? columnsModel.value)
        : columnsModel.value,
    set: (value) => {
      if (isManaged.value && managedTable.columnChecks) {
        managedTable.columnChecks.value = value
      } else {
        columnsModel.value = value
      }
    }
  })

  const resolvedLoading = computed(() =>
    isManaged.value ? managedTable.loading.value : props.loading
  )

  const resolvedData = computed(() => (isManaged.value ? managedTable.data.value : props.data))

  const {
    selectedRows,
    selectedRowKeys,
    getRowIdentity,
    clearSelectedRows,
    handleSelectionChange
  } = useCrossPageSelection<TableQueryRecord>({
    data: resolvedData,
    getRowKey: () => resolvedTableProps.value.rowKey,
    clearTableSelection: () => tableRef.value?.elTableRef?.clearSelection(),
    onChange: (rows) => emit('selection-change', rows)
  })

  const resolvedColumns = computed(() =>
    filterTenantDimensionDescriptors(
      isManaged.value ? (managedTable.columns?.value ?? props.tableColumns) : props.tableColumns,
      isPlatformScope.value
    )
  )

  const resolvedPagination = computed(() =>
    isManaged.value ? managedTable.pagination : props.pagination
  )

  const isStrictSelectionAction = (action: ArtTableQueryHeaderAction): boolean =>
    action.selectionRequired === true ||
    (action.selectionRequired == null && action.type === 'delete')

  const isAutomaticSelectionAction = (action: ArtTableQueryHeaderAction): boolean =>
    isStrictSelectionAction(action) || action.type === 'export'

  const selectionActionSource = computed(() =>
    props.selectionActions.length
      ? props.selectionActions
      : props.headerActions.filter(isAutomaticSelectionAction)
  )

  const showSelectionBar = computed(
    () =>
      selectedRows.value.length > 0 &&
      (selectionActionSource.value.length > 0 || !!slots['selection-bar'])
  )

  const hasStandaloneHeaderActions = computed(() =>
    props.headerActions.some(
      (action) => !isStrictSelectionAction(action) && isHeaderActionVisible(action)
    )
  )

  const shouldTeleportHeaderActions = computed(
    () =>
      props.headerActionsPlacement === 'workspace' &&
      !focusMode.value &&
      Boolean(workspaceHeaderActionHostRef.value)
  )

  const shouldRenderHeaderActionsInSection = computed(
    () =>
      props.headerActionsPlacement === 'section' &&
      !focusMode.value &&
      Boolean(sectionHeaderActionHostRef.value)
  )

  const shouldRenderHeaderActionsInTable = computed(
    () =>
      hasStandaloneHeaderActions.value &&
      !showSelectionBar.value &&
      !shouldTeleportHeaderActions.value &&
      !shouldRenderHeaderActionsInSection.value
  )

  const effectiveShowTableToolbar = computed(
    () => showTableToolbar.value || (focusMode.value && props.focusable)
  )

  const headerActionDestination = computed<HTMLElement | undefined>(() =>
    shouldRenderHeaderActionsInSection.value
      ? sectionHeaderActionHostRef.value
      : shouldTeleportHeaderActions.value
        ? workspaceHeaderActionHostRef.value
        : tableHeaderActionHostRef.value
  )

  const shouldRenderTableHeader = computed(
    () =>
      showSelectionBar.value ||
      effectiveShowTableToolbar.value ||
      (focusMode.value && props.focusable) ||
      shouldRenderHeaderActionsInTable.value ||
      !!slots['header-left'] ||
      !!slots['header-right']
  )

  const hasHeaderTopContent = computed(() =>
    Boolean(props.sectionTitle || slots['table-header-top'])
  )

  const artTableBindings = computed<ArtTableBindings>(
    () =>
      ({
        ...resolvedTableProps.value,
        showTableHeader: shouldRenderTableHeader.value,
        additionalHeightOffset:
          Number(resolvedTableProps.value.additionalHeightOffset ?? 0) + headerTopHeight.value,
        loading: resolvedLoading.value && !iconOnlyRefresh.value,
        inert: iconOnlyRefresh.value || undefined,
        'aria-busy': resolvedLoading.value || undefined,
        data: resolvedData.value,
        columns: resolvedColumns.value,
        pagination: resolvedPagination.value,
        selectedRowKeys: selectedRowKeys.value,
        'onSelection-change': handleSelectionChange,
        'onPagination:size-change': handleSizeChange,
        'onPagination:current-change': handleCurrentChange
        // ArtTable 组合透传时，vue-tsc 对含冒号的事件名推断不完整，运行时正常。
      }) as ArtTableBindings
  )

  const mergedTableHeaderProps = computed(() => ({
    ...props.tableHeaderProps,
    layout: effectiveShowTableToolbar.value ? props.tableHeaderProps.layout : '',
    loading: resolvedLoading.value
  }))

  const reservedSlotNames = new Set([
    'header-left',
    'header-right',
    'selection-bar',
    'selection-details',
    'table-header-top',
    'content',
    'default'
  ])

  const searchBarSlotNames = computed(() => {
    return resolvedSearchItems.value?.map((item) => item.key) ?? []
  })

  const tableSlotNames = computed(() => {
    return Object.keys(slots).filter((name) => {
      return !reservedSlotNames.has(name) && !name.startsWith('search-')
    })
  })

  const headerActionDefaults: Record<
    ArtTableQueryHeaderActionType,
    {
      label: string
      icon: string
      buttonProps: HeaderButtonProps
      selectionRequired?: boolean
      confirm?: boolean
      confirmTitle?: string
    }
  > = {
    add: {
      label: '新增',
      icon: 'ri:add-line',
      buttonProps: { type: 'primary', plain: true }
    },
    delete: {
      label: '批量删除',
      icon: 'ri:delete-bin-line',
      buttonProps: { type: 'danger', plain: true },
      selectionRequired: true,
      confirm: true,
      confirmTitle: '删除确认'
    },
    import: {
      label: '导入',
      icon: 'ri:upload-2-line',
      buttonProps: { type: 'success', plain: true }
    },
    export: {
      label: '导出',
      icon: 'ri:download-2-line',
      buttonProps: { type: 'warning', plain: true }
    }
  }

  const headerActionApi = computed<ArtTableQueryHeaderActionContext['api']>(() => ({
    refreshData: managedTable.refreshData,
    refreshCreate: managedTable.refreshCreate,
    refreshUpdate: managedTable.refreshUpdate,
    refreshRemove: managedTable.refreshRemove,
    getData: managedTable.getData
  }))

  const createHeaderActionContext = (
    action: ArtTableQueryHeaderAction,
    event?: MouseEvent,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default',
    rows: TableQueryRecord[] = selectedRows.value
  ): ArtTableQueryHeaderActionContext => ({
    action,
    scope,
    selectedRows: rows,
    selectedCount: rows.length,
    event,
    api: headerActionApi.value
  })

  const isHeaderActionVisible = (
    action: ArtTableQueryHeaderAction,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default',
    rows?: TableQueryRecord[]
  ): boolean => {
    if (isCrossTenantReadOnly.value && ['add', 'delete', 'import'].includes(String(action.type))) {
      return false
    }
    const permission = getHeaderActionPermission(action)
    if (permission && !hasAuth(permission)) return false
    if (typeof action.hidden === 'function') {
      return !action.hidden(createHeaderActionContext(action, undefined, scope, rows))
    }
    return !action.hidden
  }

  const getHeaderActionPermission = (action: ArtTableQueryHeaderAction): string | undefined =>
    resolveBusinessButtonPermission(route, action.key ?? action.type, action.permission)

  const visibleHeaderActions = computed(() => {
    if (showSelectionBar.value && !shouldTeleportHeaderActions.value) return []
    return props.headerActions.filter((action) => {
      return !isStrictSelectionAction(action) && isHeaderActionVisible(action)
    })
  })

  const visibleSelectionActions = computed(() => {
    return selectionActionSource.value.filter((action) =>
      isHeaderActionVisible(action, 'selection')
    )
  })

  const getHeaderActionKey = (action: ArtTableQueryHeaderAction): string => {
    return action.key || action.type || `${props.headerActions.indexOf(action)}`
  }

  const getSelectionActionKey = (
    action: ArtTableQueryHeaderAction,
    actionIndex: number
  ): string => {
    return `selection-${action.key || action.type || 'action'}-${actionIndex}`
  }

  const getHeaderActionClass = () => ({
    'art-table-query__header-action': true
  })

  const getHeaderActionDefault = (action: ArtTableQueryHeaderAction) => {
    return action.type ? headerActionDefaults[action.type] : undefined
  }

  const getHeaderActionLabel = (action: ArtTableQueryHeaderAction): string | Component => {
    if (action.label) return action.label
    const defaultLabel = getHeaderActionDefault(action)?.label || '操作'
    if (action.type === 'delete' && selectedRows.value.length > 0) {
      return `${defaultLabel}(${selectedRows.value.length})`
    }
    return defaultLabel
  }

  const getSelectionActionLabel = (action: ArtTableQueryHeaderAction): string | Component => {
    if (!action.label && action.type === 'export') return '导出选中'
    return action.label || getHeaderActionDefault(action)?.label || '操作'
  }

  const getHeaderActionIcon = (
    action: ArtTableQueryHeaderAction
  ): string | Component | undefined => {
    return (
      commandIcon(
        getHeaderActionKey(action),
        typeof action.label === 'string' ? action.label : ''
      ) ||
      action.icon ||
      getHeaderActionDefault(action)?.icon
    )
  }

  const getHeaderActionButtonProps = (action: ArtTableQueryHeaderAction) => ({
    ...(getHeaderActionDefault(action)?.buttonProps ?? {}),
    ...(action.buttonProps ?? {}),
    loading:
      Boolean(action.buttonProps?.loading) ||
      pendingActionKey.value === getHeaderActionKey(action) ||
      (action.type === 'import' && importPending.value)
  })

  const getSelectionActionButtonProps = (action: ArtTableQueryHeaderAction) => {
    const destructive =
      action.type === 'delete' ||
      /delete|remove|删除|清理/i.test(`${getHeaderActionKey(action)}:${String(action.label ?? '')}`)
    const contextualButtonProps =
      action.type === 'export'
        ? { type: 'primary' as const, plain: true }
        : destructive
          ? { type: 'danger' as const, plain: true }
          : {}

    return {
      size: 'small' as const,
      ...(getHeaderActionDefault(action)?.buttonProps ?? {}),
      ...contextualButtonProps,
      ...(action.buttonProps ?? {}),
      loading:
        Boolean(action.buttonProps?.loading) ||
        pendingActionKey.value === getHeaderActionKey(action) ||
        (action.type === 'import' && importPending.value)
    }
  }

  const isHeaderActionSelectionRequired = (action: ArtTableQueryHeaderAction): boolean => {
    return action.selectionRequired ?? getHeaderActionDefault(action)?.selectionRequired ?? false
  }

  const isHeaderActionDisabled = (
    action: ArtTableQueryHeaderAction,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default',
    rows?: TableQueryRecord[]
  ): boolean => {
    const ctx = createHeaderActionContext(action, undefined, scope, rows)
    const disabled = typeof action.disabled === 'function' ? action.disabled(ctx) : action.disabled
    return (
      !!disabled ||
      iconOnlyRefresh.value ||
      pendingActionKey.value !== null ||
      (action.type === 'import' && importPending.value) ||
      (isHeaderActionSelectionRequired(action) && ctx.selectedCount === 0)
    )
  }

  const getHeaderActionSlotProps = (
    action: ArtTableQueryHeaderAction,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default'
  ) => createHeaderActionContext(action, undefined, scope)

  const resolveHeaderActionContent = (
    action: ArtTableQueryHeaderAction,
    ctx: ArtTableQueryHeaderActionContext
  ): string | VNode | undefined => {
    const content =
      action.content ||
      (action.type === 'delete'
        ? `确定删除选中的 ${ctx.selectedCount} 条数据吗？删除后无法恢复。`
        : '')

    const resolvedContent =
      typeof content === 'function'
        ? (content as (ctx: ArtTableQueryHeaderActionContext) => VNodeChild)(ctx)
        : content

    if (resolvedContent == null || typeof resolvedContent === 'boolean') return undefined
    if (typeof resolvedContent === 'string') return resolvedContent
    if (typeof resolvedContent === 'number') return String(resolvedContent)
    if (Array.isArray(resolvedContent)) return h('div', resolvedContent)
    if (typeof resolvedContent === 'object' && '__v_isVNode' in resolvedContent) {
      return resolvedContent as VNode
    }

    return h(resolvedContent as Component, ctx)
  }

  const shouldConfirmHeaderAction = (action: ArtTableQueryHeaderAction): boolean => {
    return action.confirm ?? getHeaderActionDefault(action)?.confirm ?? false
  }

  const isExcelColumn = (column: ColumnOption): boolean => {
    return (
      !!column.prop &&
      column.prop !== 'operation' &&
      column.exportable !== false &&
      !['selection', 'expand', 'index', 'globalIndex'].includes(String(column.type)) &&
      typeof column.label === 'string'
    )
  }

  const getExcelDictionaryValue = (
    column: ColumnOption,
    row: TableQueryRecord
  ): string | number | null | undefined => {
    const value: unknown = column.dict?.value ? column.dict.value(row) : get(row, column.prop || '')
    return value == null || typeof value === 'string' || typeof value === 'number'
      ? value
      : String(value)
  }

  const resolveExcelColumns = (
    columns: ArtTableQueryExcelColumns | undefined,
    ctx: ArtTableQueryHeaderActionContext
  ): ArtTableQueryExcelColumn[] => {
    const excelColumns =
      typeof columns === 'function'
        ? columns(ctx)
        : Array.isArray(columns) && columns.length
          ? columns
          : resolvedColumns.value.filter(isExcelColumn).map((column: ColumnOption) => ({
              key: column.prop as string,
              title: String(column.label),
              width: typeof column.width === 'number' ? column.width : undefined,
              formatter: column.dict
                ? (_value: unknown, row: TableQueryRecord) => {
                    const value = getExcelDictionaryValue(column, row)
                    const item = userStore.getDictDisplayItemByValue(column.dict!.code, value)
                    return item
                      ? toDictionaryOption(item).label || String(value ?? '')
                      : String(value ?? '')
                  }
                : column.formatter
                  ? (_value: unknown, row: TableQueryRecord) => {
                      const formattedValue = column.formatter?.(row)
                      if (formattedValue && typeof formattedValue === 'object') return ''
                      return formattedValue as string | number | boolean | null | undefined
                    }
                  : undefined
            }))

    return isPlatformScope.value
      ? excelColumns
      : excelColumns.filter(
          (column) => !isTenantDimensionDescriptor({ key: column.key, label: column.title })
        )
  }

  const getActionFilename = (
    action: ArtTableQueryHeaderAction,
    ctx: ArtTableQueryHeaderActionContext
  ): string => {
    if (typeof action.exportFilename === 'function') return action.exportFilename(ctx)
    return action.exportFilename || '表格数据'
  }

  const fetchExportRows = async (
    action: ArtTableQueryHeaderAction,
    ctx: ArtTableQueryHeaderActionContext
  ): Promise<TableQueryRecord[]> => {
    const maxRows = action.exportMaxRows || 10000
    const columns = resolveExcelColumns(action.exportColumns, ctx)
    const scopedSelectedRows = ctx.scope === 'selection' ? ctx.selectedRows : []

    if (action.exportApi) {
      const selectedIds = scopedSelectedRows
        .map((row) => getRowIdentity(row))
        .filter((id): id is string | number => id !== undefined)
      const response = await action.exportApi(
        {
          selectedRows: scopedSelectedRows,
          selectedIds,
          selectedCount: scopedSelectedRows.length,
          searchParams: cloneSearchModel(searchModel.value),
          columns,
          maxRows
        },
        ctx
      )

      if (Array.isArray(response)) return response as TableQueryRecord[]
      if (isPlainObjectRecord(response) && response.error) throw response.error

      const adapter =
        action.exportResponseAdapter || props.responseAdapter || defaultResponseAdapter
      const result = adapter(response)
      if (result.error) throw result.error
      return extractTableData(result)
    }

    if (scopedSelectedRows.length) return scopedSelectedRows
    if (action.exportData) return await action.exportData(ctx)
    if (scopedSelectedRows.length) return scopedSelectedRows
    if (!props.apiFn) return resolvedData.value

    return loadTableExportRows<TableQueryRecord>(
      props.apiFn,
      searchModel.value,
      maxRows,
      props.paginationKey,
      props.responseAdapter
    )
  }

  const handleDefaultExport = async (
    action: ArtTableQueryHeaderAction,
    ctx: ArtTableQueryHeaderActionContext
  ): Promise<void> => {
    const scopeCurrent = captureExportScope()
    const permission = getHeaderActionPermission(action)
    const assertCanDownload = () => {
      if (!scopeCurrent() || (permission && !hasAuth(permission)))
        throw new Error('导出范围或权限已变化，请重新导出')
    }
    try {
      assertCanDownload()
      const rows = await fetchExportRows(action, ctx)
      assertCanDownload()
      if (!rows.length) {
        ElMessage.warning('暂无可导出的数据')
        return
      }

      if (
        !action.exportColumns ||
        (Array.isArray(action.exportColumns) && !action.exportColumns.length)
      ) {
        await Promise.all(
          resolvedColumns.value.filter(isExcelColumn).flatMap((column) => {
            const dictionary = column.dict
            return dictionary
              ? uniqBy(rows, (row) => String(getExcelDictionaryValue(column, row))).map((row) =>
                  userStore.ensureDictDisplayItemLoaded(
                    dictionary.code,
                    getExcelDictionaryValue(column, row)
                  )
                )
              : []
          })
        )
      }
      assertCanDownload()

      await exportExcel({
        data: rows,
        columns: resolveExcelColumns(action.exportColumns, ctx),
        filename: getActionFilename(action, ctx),
        sheetName: action.exportSheetName || getActionFilename(action, ctx),
        maxRows: action.exportMaxRows,
        assertCanDownload
      })
    } catch (error) {
      if (scopeCurrent()) throw error
    }
  }

  const resolveImportRows = async (
    action: ArtTableQueryHeaderAction,
    rows: Array<Record<string, unknown>>,
    ctx: ArtTableQueryHeaderActionContext
  ): Promise<Array<TableQueryRecord>> => {
    if (action.importTransformer) return await action.importTransformer(rows, ctx)
    const records = mapExcelRowsToRecords(rows, resolveExcelColumns(action.importColumns, ctx))
    if (action.importRecordTransformer && records.length !== rows.length) {
      throw new Error(`导入文件有 ${rows.length - records.length} 行缺少必填字段，请补全后重新导入`)
    }
    return action.importRecordTransformer
      ? await action.importRecordTransformer(records, ctx)
      : records
  }

  const handleHeaderActionImportSuccess = async (
    action: ArtTableQueryHeaderAction,
    data: Array<Record<string, unknown>>,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default'
  ): Promise<void> => {
    if (importPending.value) return
    importPending.value = true
    const ctx = createHeaderActionContext(action, undefined, scope)
    let submitted = false
    try {
      emit('header-action-click', action, ctx)
      const rows =
        action.importApi ||
        action.importTransformer ||
        action.importRecordTransformer ||
        action.importColumns
          ? await resolveImportRows(action, data, ctx)
          : data

      if (action.importApi) {
        if (!rows.length) {
          ElMessage.warning('未读取到可导入的数据')
          return
        }
        await action.importApi(rows as Array<TableQueryRecord>, ctx)
        submitted = true
        if (isManaged.value) {
          await managedTable.refreshCreate()
        }
      }

      await action.onImportSuccess?.(rows, ctx)
    } catch (error) {
      const fallback = submitted
        ? '导入已提交，但界面更新失败，请刷新查看结果'
        : '导入失败，请检查数据后重试'
      const importError = error instanceof Error ? error : new Error(fallback)
      try {
        if (action.onImportSubmitError) {
          await action.onImportSubmitError(importError, ctx)
        } else if (!wasErrorUserNotified(importError)) {
          ElMessage.error(getFriendlySupabaseErrorMessage(importError, fallback))
        }
      } catch (handlerError) {
        ElMessage.error(getFriendlySupabaseErrorMessage(handlerError, '导入失败，请稍后重试'))
      }
    } finally {
      importPending.value = false
    }
  }

  const handleHeaderActionImportError = async (
    action: ArtTableQueryHeaderAction,
    error: Error,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default'
  ): Promise<void> => {
    try {
      if (action.onImportError) {
        await action.onImportError(error, createHeaderActionContext(action, undefined, scope))
      } else {
        ElMessage.error('导入文件解析失败，请检查文件后重试')
      }
    } catch (handlerError) {
      ElMessage.error(getFriendlySupabaseErrorMessage(handlerError, '导入文件解析失败，请重试'))
    }
  }

  const handleHeaderActionClick = async (
    action: ArtTableQueryHeaderAction,
    event?: MouseEvent,
    scope: ArtTableQueryHeaderActionContext['scope'] = 'default',
    rows?: TableQueryRecord[]
  ): Promise<void> => {
    if (!isHeaderActionVisible(action, scope, rows) || isHeaderActionDisabled(action, scope, rows))
      return

    pendingActionKey.value = getHeaderActionKey(action)
    try {
      const ctx = createHeaderActionContext(
        action,
        event,
        scope,
        rows ? [...rows] : [...selectedRows.value]
      )
      if (shouldConfirmHeaderAction(action)) {
        try {
          await confirmAction(
            resolveHeaderActionContent(action, ctx),
            action.confirmTitle || '操作确认',
            {
              type: action.type === 'delete' ? 'warning' : 'info',
              confirmButtonText: action.type === 'delete' ? '删除' : '确定',
              cancelButtonText: '取消',
              confirmButtonType: action.type === 'delete' ? 'danger' : 'primary'
            }
          )
        } catch {
          return
        }
      }
      const permission = getHeaderActionPermission(action)
      if (permission && !hasAuth(permission)) {
        ElMessage.error('操作权限已变化，请刷新页面后重试')
        return
      }
      emit('header-action-click', action, ctx)
      if (action.type === 'export' && !action.onClick) {
        await handleDefaultExport(action, ctx)
      } else {
        await action.onClick?.(ctx)
      }
      // 自行确认的删除流程可能被引用检查阻止；成功后由 refreshRemove 更新选择。
      if (action.type === 'delete' && !rows && shouldConfirmHeaderAction(action))
        clearSelectedRows()
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      if (!wasErrorUserNotified(error)) {
        console.error('[ArtTableQuery] header action failed', error)
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '操作未完成，请重试'))
      }
    } finally {
      pendingActionKey.value = null
    }
  }

  provide(tableRowCommandsKey, {
    items: (row) =>
      selectionActionSource.value.flatMap((action, index) => {
        if (
          action.type === 'export' ||
          action.slot ||
          action.render ||
          action.rowAction === false ||
          !isHeaderActionVisible(action, 'selection', [row])
        )
          return []
        const label = getSelectionActionLabel(action)
        if (typeof label !== 'string') return []
        if (isRangeAction(action.key ?? '', label)) return []
        const icon = getHeaderActionIcon(action)
        const destructive =
          action.type === 'delete' || /delete|remove|删除|注销/.test(`${action.key}:${label}`)
        return [
          {
            key: `table-selection-action:${index}`,
            label: singleActionLabel(label),
            icon: typeof icon === 'string' ? icon : undefined,
            auth: getHeaderActionPermission(action),
            disabled: isHeaderActionDisabled(action, 'selection', [row]),
            color: destructive ? 'var(--el-color-danger)' : undefined,
            iconColor: destructive ? 'var(--el-color-danger)' : undefined
          }
        ]
      }),
    run: async (key, row) => {
      const index = Number(String(key).replace('table-selection-action:', ''))
      const action = selectionActionSource.value[index]
      if (action) await handleHeaderActionClick(action, undefined, 'selection', [row])
    }
  })

  const cloneSearchModel = (value: Record<string, unknown> | undefined) => {
    if (!value) return {}
    return cloneDeep(value)
  }

  const resetSearchModel = (): void => {
    searchModel.value = cloneSearchModel(initialSearchModel.value)
  }

  onMounted(() => {
    initialSearchModel.value = cloneSearchModel(searchModel.value)
  })

  const handleSearch = (params: Record<string, unknown>): void => {
    clearSelectedRows()
    if (isManaged.value) {
      managedTable.replaceSearchParams(params)
      void managedTable.getData()
    }
    emit('search', params)
  }

  const handleReset = (): void => {
    clearSelectedRows()
    resetSearchModel()
    if (isManaged.value) {
      void managedTable.resetSearchParams()
    }
    emit('reset')
  }

  const manualRefreshing = ref(false)
  const iconOnlyRefresh = computed(() => props.refreshFeedback === 'icon' && manualRefreshing.value)
  const handleRefresh = async (): Promise<void> => {
    if (resolvedLoading.value || manualRefreshing.value) return
    manualRefreshing.value = true
    try {
      emit('refresh')
      if (isManaged.value) await managedTable.refreshData()
    } finally {
      manualRefreshing.value = false
    }
  }

  const refreshRemove = async (): Promise<void> => {
    clearSelectedRows()
    await managedTable.refreshRemove()
  }

  const handleRowDragStart = (payload: TableQueryRecord): void => {
    emit('row-drag-start', payload)
  }

  const handleRowDragUpdate = (payload: TableQueryRecord): void => {
    emit('row-drag-update', payload)
  }

  const handleRowDragEnd = (payload: TableQueryRecord): void => {
    emit('row-drag-end', payload)
  }

  const handleSizeChange = (val: number): void => {
    if (isManaged.value) {
      void managedTable.handleSizeChange(val)
    }
    emit('pagination:size-change', val)
  }

  const handleCurrentChange = (val: number): void => {
    if (isManaged.value) {
      void managedTable.handleCurrentChange(val)
    }
    emit('pagination:current-change', val)
  }

  const handleShowSearchBarChange = (value: boolean): void => {
    showSearchBar.value = value
  }

  const focusHiddenClass = 'art-table-focus-hidden'
  const focusPathClass = 'art-table-focus-path'
  const focusPageClass = 'art-table-focus-page'
  const focusHiddenElements = new Set<HTMLElement>()
  const focusPathElements = new Set<HTMLElement>()
  let focusPageElement: HTMLElement | undefined
  let showSearchBarBeforeFocus = true
  let focusScrollPositions: Array<{ element: HTMLElement; top: number; left: number }> = []

  const addManagedClass = (
    element: HTMLElement,
    className: string,
    collection: Set<HTMLElement>
  ): void => {
    if (element.classList.contains(className)) return
    element.classList.add(className)
    collection.add(element)
  }

  /** 恢复进入专注模式前的页面结构，不影响页面自身已有的 class。 */
  const restoreFocusLayout = (): void => {
    focusHiddenElements.forEach((element) => element.classList.remove(focusHiddenClass))
    focusPathElements.forEach((element) => element.classList.remove(focusPathClass))
    focusPageElement?.classList.remove(focusPageClass)
    focusHiddenElements.clear()
    focusPathElements.clear()
    focusPageElement = undefined
  }

  /**
   * 只保留当前专注工作区到路由页面根节点之间的 DOM 路径。
   * 默认保留最近的标准页签容器；其他复合页面可通过 focusScopeSelector 保留导航树等必要上下文。
   */
  const applyFocusLayout = (): void => {
    restoreFocusLayout()
    const tableQueryElement = rootRef.value
    if (!tableQueryElement) return

    const pageElement = tableQueryElement.closest<HTMLElement>('.art-page-view')
    if (!pageElement) return

    focusPageElement = pageElement
    pageElement.classList.add(focusPageClass)

    const focusScopeElement = props.focusScopeSelector
      ? tableQueryElement.closest<HTMLElement>(props.focusScopeSelector)
      : tableQueryElement.closest<HTMLElement>('.el-tabs')
    if (focusScopeElement?.matches('.el-tabs')) {
      let contextElement = tableQueryElement.parentElement
      while (contextElement && focusScopeElement.contains(contextElement)) {
        addManagedClass(contextElement, focusPathClass, focusPathElements)
        if (contextElement === focusScopeElement) break
        contextElement = contextElement.parentElement
      }
    }
    let currentElement = focusScopeElement ?? tableQueryElement
    while (currentElement !== pageElement) {
      const parentElement: HTMLElement | null = currentElement.parentElement
      if (!parentElement || !pageElement.contains(parentElement)) break

      Array.from(parentElement.children).forEach((sibling) => {
        if (sibling instanceof HTMLElement && sibling !== currentElement) {
          addManagedClass(sibling, focusHiddenClass, focusHiddenElements)
        }
      })

      if (parentElement !== pageElement) {
        addManagedClass(parentElement, focusPathClass, focusPathElements)
      }
      currentElement = parentElement
    }
  }

  const handleFocusModeChange = (value: boolean): void => {
    if (!props.focusable) return
    if (value && !focusMode.value) {
      focusScrollPositions = []
      for (
        let element: HTMLElement | null = rootRef.value ?? null;
        element;
        element = element.parentElement
      ) {
        focusScrollPositions.push({ element, top: element.scrollTop, left: element.scrollLeft })
      }
    }
    focusMode.value = value
    emit('focus-change', value)
  }

  export interface ArtTableQueryWorkspaceController {
    focusMode: ComputedRef<boolean>
    showTableToolbar: ComputedRef<boolean>
    effectiveShowTableToolbar: ComputedRef<boolean>
    focusable: ComputedRef<boolean>
    setFocusMode: (value: boolean) => void
    setShowTableToolbar: (value: boolean) => void
    attachHeaderActionHost: (element: HTMLElement) => void
    detachHeaderActionHost: (element: HTMLElement) => void
  }

  const attachHeaderActionHost = (element: HTMLElement): void => {
    workspaceHeaderActionHostRef.value = element
  }

  const detachHeaderActionHost = (element: HTMLElement): void => {
    if (workspaceHeaderActionHostRef.value === element) {
      workspaceHeaderActionHostRef.value = undefined
    }
  }

  const workspaceController: ArtTableQueryWorkspaceController = {
    focusMode: computed(() => focusMode.value),
    showTableToolbar: computed(() => showTableToolbar.value),
    effectiveShowTableToolbar,
    focusable: computed(() => props.focusable),
    setFocusMode: handleFocusModeChange,
    setShowTableToolbar: (value) => {
      if (focusMode.value && !value) return
      showTableToolbar.value = value
    },
    attachHeaderActionHost,
    detachHeaderActionHost
  }

  watch(
    () => props.columnsContextKey,
    () => managedTable.resetColumns?.(),
    { flush: 'sync' }
  )

  watch(
    focusMode,
    (value, previousValue) => {
      if (value && props.focusable) {
        if (!previousValue) {
          showSearchBarBeforeFocus = showSearchBar.value
        }
        void nextTick(applyFocusLayout)
      } else {
        if (previousValue && hasSearchBar.value) {
          showSearchBar.value = showSearchBarBeforeFocus
        }
        restoreFocusLayout()
        const positions = focusScrollPositions
        focusScrollPositions = []
        void nextTick(() => {
          if (focusMode.value || !rootRef.value?.isConnected) return
          positions.forEach(({ element, top, left }) => {
            if (!element.isConnected) return
            element.scrollTop = top
            element.scrollLeft = left
          })
        })
      }
    },
    { flush: 'post' }
  )

  const handleFocusEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !focusMode.value) return
    // A loading modal can move focus to body when its active control is disabled.
    // Let any visible modal own Escape without changing the workspace behind it.
    const hasVisibleModal = Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
      (modal) => modal.getClientRects().length > 0
    )
    if (!hasVisibleModal) handleFocusModeChange(false)
  }

  useEventListener(document, 'keydown', handleFocusEscape)

  onDeactivated(() => {
    measurementActive = false
    stopHeaderTopMeasurement()
    focusScrollPositions = []
    if (focusMode.value) handleFocusModeChange(false)
    restoreFocusLayout()
  })
  onBeforeUnmount(() => {
    focusScrollPositions = []
    restoreFocusLayout()
  })

  export interface ArtTableQueryDataState {
    /** 当前实际呈现的数据，沿用表格的请求失效保护。 */
    rows: ComputedRef<readonly object[]>
    loading: ComputedRef<boolean>
    error: ComputedRef<unknown>
    /** 替代视图复用当前分页状态。 */
    pagination: ComputedRef<PaginationConfig | undefined>
  }

  const dataState: ArtTableQueryDataState = {
    rows: resolvedData,
    loading: computed(() => Boolean(resolvedLoading.value)),
    error: computed(() => (isManaged.value ? managedTable.error.value : null)),
    pagination: resolvedPagination
  }

  export interface ArtTableQueryExpose {
    /** 只读数据状态；关联记录提示等 UI 必须以实际表格结果为准。 */
    dataState: ArtTableQueryDataState
    /** 全量刷新，适用于工具栏手动刷新。 */
    refreshData: () => Promise<void>
    /** 新增后刷新，默认回到第一页。 */
    refreshCreate: () => Promise<void>
    /** 数据上下文变化后刷新；保留查询条件并回到第一页。 */
    refreshContext: () => Promise<void>
    /** 编辑后刷新，默认保留当前页。 */
    refreshUpdate: () => Promise<void>
    /** 删除后刷新，当前页为空时自动回退上一页。 */
    refreshRemove: () => Promise<void>
    /** 查询数据，默认按搜索语义回到第一页。 */
    getData: () => Promise<unknown>
    /** 立即使当前请求失效；适用于筛选条件改变后的防抖等待阶段。 */
    cancelRequest: () => void
    /** 清空查询表单模型并重置内部查询参数。 */
    resetSearchParams: () => Promise<void>
    /** 清空当前跨页选择。 */
    clearSelection: () => void
    /** 重新执行列工厂；用于字段权限等运行时条件改变后刷新列结构。 */
    resetColumns: () => void
    /** 替代视图复用表格的分页请求。 */
    changePage: (page: number) => void
    /** 业务工作区头部与表格共享的显示状态和动作挂载控制器。 */
    workspaceController: ArtTableQueryWorkspaceController
  }

  const resetSearchParams = async (): Promise<void> => {
    resetSearchModel()
    if (isManaged.value) {
      await managedTable.resetSearchParams()
    }
  }

  const getData = async (): Promise<unknown> => {
    if (isManaged.value) {
      managedTable.replaceSearchParams(cloneSearchModel(searchModel.value))
    }
    return await managedTable.getData()
  }

  defineExpose<ArtTableQueryExpose>({
    dataState,
    refreshData: managedTable.refreshData,
    refreshCreate: managedTable.refreshCreate,
    refreshContext: managedTable.refreshCreate,
    refreshUpdate: managedTable.refreshUpdate,
    refreshRemove,
    getData,
    cancelRequest: managedTable.cancelRequest,
    resetSearchParams,
    clearSelection: clearSelectedRows,
    resetColumns: () => managedTable.resetColumns?.(),
    changePage: handleCurrentChange,
    workspaceController
  })
</script>

<style scoped lang="scss" src="./style.scss"></style>
