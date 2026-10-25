<!-- 表格组件 -->
<!-- 支持：el-table 全部属性、事件、插槽，同官方文档写法 -->
<!-- 扩展功能：分页组件、渲染自定义列、loading、表格全局边框、斑马纹、表格尺寸、表头背景配置 -->
<!-- 获取 ref：默认暴露了 elTableRef 外部通过 ref.value.elTableRef 可以调用 el-table 方法 -->
<template>
  <div
    ref="containerRef"
    class="art-table"
    :class="{
      'is-empty': isEmpty,
      'is-max-height': usesMaxHeight,
      'is-row-selection-dragging': isRowSelectionDragging
    }"
    :style="tableContainerStyle"
    :aria-busy="!!loading"
    @mousedown="handleTableMouseDown"
    @wheel.capture="handleWheelBoundary"
    @focusin="handleControlFocus"
  >
    <ElTable ref="elTableRef" v-bind="mergedTableProps">
      <template v-for="col in visibleColumns" :key="col.prop || col.type">
        <!-- 渲染全局序号列 -->
        <ElTableColumn v-if="col.type === 'globalIndex'" v-bind="cleanColumnProps(col)">
          <template #default="{ $index }">
            <span>{{ getGlobalIndex($index) }}</span>
          </template>
        </ElTableColumn>

        <!-- 渲染展开行 -->
        <ElTableColumn v-else-if="col.type === 'expand'" v-bind="cleanColumnProps(col)">
          <template #default="{ row }">
            <div
              class="art-table__expand-content"
              :style="{
                width: containerWidth > 0 ? `${Math.max(0, containerWidth - 2)}px` : '100%'
              }"
            >
              <component :is="col.formatter ? col.formatter(row) : null" />
            </div>
          </template>
        </ElTableColumn>

        <!-- 渲染分组列 -->
        <ElTableColumn
          v-else-if="Array.isArray(col.children) && col.children.length"
          v-bind="cleanColumnProps(col)"
        >
          <ElTableColumn
            v-for="child in col.children"
            :key="child.prop || child.label"
            v-bind="cleanColumnProps(child)"
          >
            <template
              v-if="child.required || (child.useHeaderSlot && child.prop) || hasColumnFilter(child)"
              #header="headerScope"
            >
              <span class="art-table__header-label">
                <span v-if="child.required" class="art-table__required-marker" aria-hidden="true"
                  >*</span
                >
                <slot
                  v-if="child.useHeaderSlot && child.prop"
                  :name="child.headerSlotName || `${child.prop}-header`"
                  v-bind="{ ...headerScope, prop: child.prop, label: child.label }"
                >
                  {{ child.label }}
                </slot>
                <component
                  v-else-if="typeof child.renderHeader === 'function'"
                  :is="child.renderHeader(headerScope)"
                />
                <template v-else>{{ child.label }}</template>
                <span v-if="child.required" class="sr-only">（必填）</span>
                <component v-if="hasColumnFilter(child)" :is="renderColumnFilter(child)" />
              </span>
            </template>
            <template v-if="shouldUseCustomCellTemplate(child)" #default="slotScope">
              <div
                v-if="shouldRenderSlotScope(slotScope)"
                class="art-table__cell-content"
                :class="{
                  'is-validation-error': isCellValidationError(child, slotScope.row)
                }"
                :data-art-validation-key="getCellValidationKey(child, slotScope.row)"
                :aria-invalid="isCellValidationError(child, slotScope.row) ? 'true' : undefined"
              >
                <component
                  :is="isRowActionsColumn(child) ? BusinessTableRowActions : 'span'"
                  :row="isRowActionsColumn(child) ? slotScope.row : undefined"
                  class="art-table__cell-value"
                >
                  <slot
                    v-if="child.useSlot && child.prop"
                    :name="child.slotName || child.prop"
                    v-bind="{
                      ...slotScope,
                      prop: child.prop,
                      value: child.prop ? getCellValue(slotScope.row, child.prop) : undefined
                    }"
                  />
                  <ArtDictDisplay
                    v-else-if="child.dict"
                    :dict-code="child.dict.code"
                    :value="getDictColumnValue(child, slotScope.row)"
                    :display="child.dict.display"
                  />
                  <component v-else-if="child.link" :is="renderColumnLink(child, slotScope.row)" />
                  <component
                    v-else-if="isComponentCellContent(getColumnCellContent(child, slotScope))"
                    :is="getColumnCellContent(child, slotScope)"
                  />
                  <span v-else>{{ getColumnCellContent(child, slotScope) }}</span>
                </component>
                <span
                  v-if="getCellValidationError(child, slotScope.row)"
                  class="sr-only"
                  role="alert"
                >
                  {{ getCellValidationError(child, slotScope.row)?.message }}
                </span>
              </div>
            </template>
          </ElTableColumn>
        </ElTableColumn>

        <!-- 渲染普通列 -->
        <ElTableColumn v-else v-bind="cleanColumnProps(col)">
          <template
            v-if="col.required || (col.useHeaderSlot && col.prop) || hasColumnFilter(col)"
            #header="headerScope"
          >
            <span class="art-table__header-label">
              <span v-if="col.required" class="art-table__required-marker" aria-hidden="true"
                >*</span
              >
              <slot
                v-if="col.useHeaderSlot && col.prop"
                :name="col.headerSlotName || `${col.prop}-header`"
                v-bind="{ ...headerScope, prop: col.prop, label: col.label }"
              >
                {{ col.label }}
              </slot>
              <component
                v-else-if="typeof col.renderHeader === 'function'"
                :is="col.renderHeader(headerScope)"
              />
              <template v-else>{{ col.label }}</template>
              <span v-if="col.required" class="sr-only">（必填）</span>
              <component v-if="hasColumnFilter(col)" :is="renderColumnFilter(col)" />
            </span>
          </template>
          <template v-if="shouldUseCustomCellTemplate(col)" #default="slotScope">
            <div
              v-if="shouldRenderSlotScope(slotScope)"
              class="art-table__cell-content"
              :class="{ 'is-validation-error': isCellValidationError(col, slotScope.row) }"
              :data-art-validation-key="getCellValidationKey(col, slotScope.row)"
              :aria-invalid="isCellValidationError(col, slotScope.row) ? 'true' : undefined"
            >
              <button
                v-if="isColumnDraggable(col, slotScope.row)"
                type="button"
                class="art-table__drag-handle"
                :class="{ 'is-disabled': isColumnDragDisabled(col, slotScope.row) }"
                :disabled="isColumnDragDisabled(col, slotScope.row)"
                :data-row-key="getRowIdentity(slotScope.row)"
                :aria-label="isColumnDragDisabled(col, slotScope.row) ? '不可拖拽' : '拖拽排序'"
                :title="isColumnDragDisabled(col, slotScope.row) ? '不可拖拽' : '拖拽排序'"
              >
                <ArtSvgIcon :icon="col.dragIcon || 'ri:draggable'" />
              </button>
              <component
                :is="isRowActionsColumn(col) ? BusinessTableRowActions : 'span'"
                :row="isRowActionsColumn(col) ? slotScope.row : undefined"
                class="art-table__cell-value"
              >
                <slot
                  v-if="col.useSlot && col.prop"
                  :name="col.slotName || col.prop"
                  v-bind="{
                    ...slotScope,
                    prop: col.prop,
                    value: col.prop ? getCellValue(slotScope.row, col.prop) : undefined
                  }"
                />
                <ArtDictDisplay
                  v-else-if="col.dict"
                  :dict-code="col.dict.code"
                  :value="getDictColumnValue(col, slotScope.row)"
                  :display="col.dict.display"
                />
                <component v-else-if="col.link" :is="renderColumnLink(col, slotScope.row)" />
                <component
                  v-else-if="isComponentCellContent(getColumnCellContent(col, slotScope))"
                  :is="getColumnCellContent(col, slotScope)"
                />
                <span v-else>{{ getColumnCellContent(col, slotScope) }}</span>
              </component>
              <span v-if="getCellValidationError(col, slotScope.row)" class="sr-only" role="alert">
                {{ getCellValidationError(col, slotScope.row)?.message }}
              </span>
            </div>
          </template>
        </ElTableColumn>
      </template>

      <template v-if="$slots.default" #default><ConfiguredSlotColumns /></template>

      <template #empty>
        <div v-if="loading"></div>
        <div v-else ref="emptyContentRef">
          <slot name="empty">
            <ArtEmptyState
              :title="activeColumnFilterCount ? '当前页没有匹配记录' : emptyText"
              :description="
                activeColumnFilterCount
                  ? '请调整表头过滤条件，或清空列过滤后重试。'
                  : emptyDescription
              "
              :visual-size="92"
              size="compact"
            />
          </slot>
        </div>
      </template>
    </ElTable>

    <ArtOverlayLoading
      v-if="loading && (isEmpty || loadingOverlay)"
      loading
      overlay
      size="compact"
      text="正在加载表格数据…"
      description="正在获取最新列表，请稍候"
    />

    <div
      class="pagination custom-pagination flex-wrap items-center gap-x-3 gap-y-2"
      v-if="showPagination || activeColumnFilterCount"
      :class="mergedPaginationOptions?.align"
      ref="paginationRef"
    >
      <div
        v-if="activeColumnFilterCount"
        class="flex flex-wrap items-center justify-end gap-2 text-xs text-g-700"
        role="status"
      >
        <span
          >当前页过滤 {{ activeColumnFilterCount }} 项 · 显示 {{ filteredRows.length }} /
          {{ props.data?.length ?? 0 }} 条</span
        >
        <ElButton link type="primary" @click="clearColumnFilters">清空列过滤</ElButton>
      </div>
      <ElPagination
        v-if="showPagination"
        v-bind="mergedPaginationOptions"
        :total="currentPagination?.total"
        :disabled="loading"
        :page-size="currentPagination?.size"
        :current-page="currentPagination?.current"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import {
    ref,
    computed,
    nextTick,
    onActivated,
    onDeactivated,
    watch,
    watchEffect,
    watchPostEffect,
    getCurrentInstance,
    useAttrs,
    h,
    isVNode
  } from 'vue'
  import { shallowRef, useSlots } from 'vue'
  import ArtTableColumnFilter from '@/components/core/tables/art-table-column-filter/index.vue'
  import {
    columnFilterOptions,
    filterColumnRows,
    isColumnFilterActive,
    type ColumnFilterCondition
  } from '@/utils/table/column-filters'
  import { isEqual, uniqBy } from 'lodash-es'
  import { readSlotColumns, renderSlotColumns } from '@/utils/table/slot-columns'
  import { fitColumnHeaderControls } from '@/utils/table/column-profile'
  import { cloneVNode, type ComponentPublicInstance } from 'vue'
  import { useI18n } from 'vue-i18n'
  import type { TableProps } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import { useDraggable, type DraggableEvent } from 'vue-draggable-plus'
  import type { ColumnOption, TableColumnValidationContext } from '@/types'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessAttachmentRowActions from '@/components/business/business-attachment-row-actions/index.vue'
  import { useTableStore } from '@/store/modules/table'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useCommon } from '@/hooks/core/useCommon'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTableHeight } from '@/hooks/core/useTableHeight'
  import { useConfiguredTableColumns } from '@/hooks/core/useConfiguredTableColumns'
  import {
    useEventListener,
    useMutationObserver,
    useRafFn,
    useResizeObserver,
    useWindowSize
  } from '@vueuse/core'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import TreeUtils from '@/utils/tree'
  import { handoffVerticalWheel } from '@/utils/ui/wheel-scroll'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'

  defineOptions({ name: 'ArtTable' })

  export type ArtTableInstance = ComponentPublicInstance & {
    clearSelection: () => void
    toggleAllSelection: () => void
    toggleRowSelection: (row: unknown, selected?: boolean) => void
    setCurrentRow: (row?: unknown) => void
    clearSort: () => void
    clearFilter: (columnKeys?: string[]) => void
    doLayout: () => void
    sort: (prop: string, order: string) => void
    setScrollTop: (top?: number) => void
    setScrollLeft: (left?: number) => void
  }

  export interface ArtTableValidationError {
    row: unknown
    rowIndex: number
    prop: string
    label: string
    value: unknown
    message: string
  }

  export interface ArtTableValidationResult {
    valid: boolean
    errors: ArtTableValidationError[]
    firstError?: ArtTableValidationError
  }

  export interface ArtTableExpose {
    validate: () => Promise<ArtTableValidationResult>
    validateField: (props: string | string[]) => Promise<ArtTableValidationResult>
    clearValidate: (props?: string | string[]) => void
    scrollToTop: () => void
    elTableRef: ArtTableInstance | null
  }

  // ArtTable 是项目级通用表格外壳，行数据由各业务模块决定字段形状；这里把动态边界集中到一个别名中。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ArtTableRow = any

  type ArtTableColumn = ColumnOption<ArtTableRow>

  const { width } = useWindowSize()
  const containerRef = ref<HTMLElement>()
  const containerWidth = ref(0)
  const rowActionsWidth = ref(64)
  let pendingContainerWidth = 0
  let measurementActive = true
  // 固定列切换会再次布局；在下一帧接收容器宽度，避免观察回调中的尺寸反馈。
  const { resume: scheduleContainerWidth, pause: stopContainerWidth } = useRafFn(
    () => {
      containerWidth.value = pendingContainerWidth
      const groups = containerRef.value?.querySelectorAll<HTMLElement>(
        '.el-table__body-wrapper td.art-table-operation-column .business-table-row-actions'
      )
      let minimumWidth = 64
      groups?.forEach((group) => {
        if (!group.offsetWidth) return
        const cell = group.closest<HTMLElement>('.cell')
        if (!cell) return
        const style = getComputedStyle(cell)
        const scrollbar = containerRef.value?.querySelector<HTMLElement>(
          '.el-scrollbar__bar.is-vertical'
        )
        const scrollbarSize = scrollbar
          ? Number.parseFloat(getComputedStyle(scrollbar).width) || 6
          : 6
        // Measure the actual controls, not a wrapper stretched by the current column width.
        // Measuring that wrapper feeds the previous width back into every row deletion/layout.
        const controls = Array.from(
          group.querySelectorAll<HTMLElement>('button, a, [role="button"]')
        ).filter(
          (control) =>
            control.offsetWidth > 0 && !control.querySelector('button, a, [role="button"]')
        )
        if (!controls.length) return
        const gap = Number.parseFloat(getComputedStyle(group).columnGap) || 0
        const contentWidth =
          controls.reduce((total, control) => total + control.getBoundingClientRect().width, 0) +
          Math.max(controls.length - 1, 0) * gap
        minimumWidth = Math.max(
          minimumWidth,
          Math.ceil(contentWidth) +
            (Number.parseFloat(style.paddingLeft) || 0) +
            (Number.parseFloat(style.paddingRight) || 0) +
            scrollbarSize
        )
      })
      rowActionsWidth.value = minimumWidth
    },
    { immediate: false, once: true }
  )
  useResizeObserver(containerRef, ([entry]) => {
    if (!entry || !measurementActive) return
    pendingContainerWidth = entry.contentRect.width
    scheduleContainerWidth()
  })
  useMutationObserver(
    containerRef,
    () => {
      if (measurementActive) scheduleContainerWidth()
    },
    { childList: true, subtree: true }
  )
  const elTableRef = ref<ArtTableInstance | null>(null)
  const paginationRef = ref<HTMLElement>()
  const tableHeaderRef = ref<HTMLElement>()
  const sortableTargetRef = ref<HTMLElement>()
  const rowKeysBeforeDrag = ref<string[]>([])
  interface InternalTableValidationError extends ArtTableValidationError {
    row: ArtTableRow
    key: string
  }
  const validationErrors = ref(new Map<string, InternalTableValidationError>())
  const validationRowKeys = new WeakMap<object, string>()
  let validationRowKeySeed = 0
  let validationRefreshSeed = 0
  const tableStore = useTableStore()
  const { isBorder, isZebra, tableSize, isFullScreen, isHeaderBackground } = storeToRefs(tableStore)
  const { isPlatformScope } = storeToRefs(useTenantScopeStore())
  const { hasAuth } = useAuth()

  interface RowDragPayload<T = ArtTableRow> {
    row?: T
    targetRow?: T
    oldIndex?: number
    newIndex?: number
    event: DraggableEvent<T>
  }

  /** 分页配置接口 */
  interface PaginationConfig {
    /** 当前页码 */
    current: number
    /** 每页显示条目个数 */
    size: number
    /** 总条目数 */
    total: number
  }

  /** 分页器配置选项接口 */
  interface PaginationOptions {
    /** 每页显示个数选择器的选项列表 */
    pageSizes?: number[]
    /** 分页器的对齐方式 */
    align?: 'left' | 'center' | 'right'
    /** 分页器的布局 */
    layout?: string
    /** 是否显示分页器背景 */
    background?: boolean
    /** 只有一页时是否隐藏分页器 */
    hideOnSinglePage?: boolean
    /** 分页器的大小 */
    size?: 'small' | 'default' | 'large'
    /** 分页器的页码数量 */
    pagerCount?: number
  }

  /** ArtTable 组件的 Props 接口 */
  interface ArtTableProps extends Partial<TableProps<ArtTableRow>> {
    /** 表格数据 */
    data?: ArtTableRow[]
    /** 加载状态 */
    loading?: boolean
    /** 有现有行时也显示表格加载遮罩，避免刷新期间的旧数据被误认为最新结果。 */
    loadingOverlay?: boolean
    /** 列渲染配置 */
    columns?: ArtTableColumn[]
    /** 分页状态 */
    pagination?: PaginationConfig | false
    /** 分页配置 */
    paginationOptions?: PaginationOptions
    /** 空数据表格高度 */
    emptyHeight?: string
    /** 空数据时显示的文本 */
    emptyText?: string
    /** 空数据时的辅助说明 */
    emptyDescription?: string
    /** 是否开启 ArtTableHeader，解决表格高度自适应问题 */
    showTableHeader?: boolean
    /** 工具栏上方额外内容占用的高度 */
    additionalHeightOffset?: number
    /** 已选中行 key，用于选中行背景展示 */
    selectedRowKeys?: Array<string | number>
    /** 容器低于此宽度时解除固定列，保留完整横向滚动；0 表示关闭。 */
    fixedColumnMinWidth?: number
  }

  const props = withDefaults(defineProps<ArtTableProps>(), {
    columns: () => [],
    fit: true,
    showHeader: true,
    stripe: undefined,
    border: undefined,
    size: undefined,
    emptyHeight: '190px',
    loadingOverlay: true,
    emptyText: '暂无数据',
    emptyDescription: '',
    showTableHeader: true,
    additionalHeightOffset: 0,
    selectedRowKeys: () => [],
    fixedColumnMinWidth: 640
  })
  const { t } = useI18n()
  const configuredColumns = useConfiguredTableColumns(() => props.columns)
  const slots = useSlots()
  const slotColumnDescriptors = shallowRef<ColumnOption<unknown>[]>([])
  const configuredSlotColumns = useConfiguredTableColumns(() => slotColumnDescriptors.value)
  const ConfiguredSlotColumns = () => {
    const nodes = slots.default?.() ?? []
    const descriptors = readSlotColumns(nodes).map((entry) => entry.column)
    if (!isEqual(descriptors, slotColumnDescriptors.value))
      slotColumnDescriptors.value = descriptors
    return descriptors.length
      ? renderSlotColumns(nodes, configuredSlotColumns.factory(), (column, content) =>
          hasColumnFilter(column)
            ? h('span', { class: 'inline-flex items-center gap-1' }, [
                content,
                renderColumnFilter(column)
              ])
            : content
        )
      : nodes
  }
  const visibleColumns = computed(() =>
    filterTenantDimensionDescriptors(
      configuredColumns
        .factory()
        .filter((column) => column.visible !== false && column.checked !== false),
      isPlatformScope.value
    )
  )
  const instance = getCurrentInstance()
  const columnFilters = ref<Record<string, ColumnFilterCondition>>({})
  const filterColumnTree = new TreeUtils({ deepClone: false })
  const filterableColumns = computed(() => {
    const columns: ArtTableColumn[] = []
    filterColumnTree.traverse(
      [
        ...visibleColumns.value,
        ...configuredSlotColumns
          .factory()
          .filter((column) => column.visible !== false && column.checked !== false)
      ],
      (column) => {
        if (hasColumnFilter(column)) columns.push(column)
      }
    )
    return uniqBy(columns, 'prop')
  })
  const activeColumnFilterCount = computed(
    () =>
      filterableColumns.value.filter((column) =>
        isColumnFilterActive(columnFilters.value[column.prop!])
      ).length
  )
  const filteredRows = computed(() =>
    filterColumnRows(
      props.data ?? [],
      filterableColumns.value,
      columnFilters.value,
      props.treeProps?.children ?? 'children'
    )
  )
  function hasColumnFilter(column: ArtTableColumn): boolean {
    return Boolean(
      column.prop &&
      column.filterType &&
      column.filterType !== 'none' &&
      column.visible !== false &&
      column.checked !== false &&
      !column.type &&
      column.prop !== 'operation'
    )
  }
  function clearColumnFilters(): void {
    columnFilters.value = {}
  }
  function renderColumnFilter(column: ArtTableColumn) {
    return h(ArtTableColumnFilter, {
      label: column.label ?? column.prop!,
      type: column.filterType!,
      modelValue: columnFilters.value[column.prop!],
      options: columnFilterOptions(flattenRows(props.data ?? []), column.prop!),
      dictCode: column.dict?.code,
      'onUpdate:modelValue': (value: ColumnFilterCondition) => {
        columnFilters.value = { ...columnFilters.value, [column.prop!]: value }
      }
    })
  }
  watch([configuredColumns.revision, configuredSlotColumns.revision], clearColumnFilters)
  const attrs = useAttrs()

  const LAYOUT = {
    MOBILE: 'prev, pager, next, sizes, jumper, total',
    IPAD: 'prev, pager, next, jumper, total',
    DESKTOP: 'total, prev, pager, next, sizes, jumper'
  }

  const layout = computed(() => {
    if (width.value < 768) {
      return LAYOUT.MOBILE
    } else if (width.value < 1024) {
      return LAYOUT.IPAD
    } else {
      return LAYOUT.DESKTOP
    }
  })

  // 默认分页常量
  const DEFAULT_PAGINATION_OPTIONS: PaginationOptions = {
    pageSizes: [10, 20, 30, 50, 100],
    align: 'center',
    background: true,
    hideOnSinglePage: false,
    size: 'default'
  }

  // 合并分页配置
  const mergedPaginationOptions = computed(() => ({
    ...DEFAULT_PAGINATION_OPTIONS,
    layout: layout.value,
    pagerCount: width.value > 1200 ? 7 : 5,
    ...props.paginationOptions
  }))

  // 边框 (优先级：props > store)
  const border = computed(() => props.border ?? isBorder.value)
  // 斑马纹
  const stripe = computed(() => props.stripe ?? isZebra.value)
  // 表格尺寸
  const size = computed(() => props.size ?? tableSize.value)
  // 数据是否为空
  const isEmpty = computed(() => props.data?.length === 0)
  watch(isEmpty, async (empty) => {
    if (!empty) return
    await nextTick()
    if (isEmpty.value) elTableRef.value?.setScrollLeft(0)
  })

  const paginationHeight = ref(0)
  const tableHeaderHeight = ref(0)
  const emptyContentRef = ref<HTMLElement>()
  const emptyTableHeight = ref(0)
  let pendingPaginationHeight: number | undefined
  let pendingTableHeaderHeight: number | undefined
  const { resume: scheduleLayoutMeasurement, pause: stopLayoutMeasurement } = useRafFn(
    () => {
      if (pendingPaginationHeight !== undefined) paginationHeight.value = pendingPaginationHeight
      if (pendingTableHeaderHeight !== undefined) tableHeaderHeight.value = pendingTableHeaderHeight
      pendingPaginationHeight = undefined
      pendingTableHeaderHeight = undefined
      const content = emptyContentRef.value
      if (!content) return
      const header = elTableRef.value?.$el.querySelector(
        '.el-table__header-wrapper'
      ) as HTMLElement | null
      emptyTableHeight.value = Math.ceil(
        content.getBoundingClientRect().height + (header?.getBoundingClientRect().height ?? 0) + 1
      )
    },
    { immediate: false, once: true }
  )
  useResizeObserver(emptyContentRef, () => {
    if (measurementActive) scheduleLayoutMeasurement()
  })
  const isRowSelectionDragging = ref(false)
  const rowSelectionDragStartRow = ref<ArtTableRow>()
  const rowSelectionDragMode = ref<'select' | 'deselect'>('select')
  const dragSelectedRowKeys = new Set<string>()

  // 使用 useResizeObserver 监听分页器高度变化
  useResizeObserver(paginationRef, (entries) => {
    const entry = entries[0]
    if (entry && measurementActive) {
      pendingPaginationHeight = entry.contentRect.height
      scheduleLayoutMeasurement()
    }
  })

  // 使用 useResizeObserver 监听表格头部高度变化
  useResizeObserver(tableHeaderRef, (entries) => {
    const entry = entries[0]
    if (entry && measurementActive) {
      pendingTableHeaderHeight = entry.contentRect.height
      scheduleLayoutMeasurement()
    }
  })
  onActivated(() => {
    measurementActive = true
    scheduleLayoutMeasurement()
  })
  onDeactivated(() => {
    measurementActive = false
    stopContainerWidth()
    stopLayoutMeasurement()
  })

  // 分页器与表格之间的间距常量（计算属性，响应 showTableHeader 变化）
  const PAGINATION_SPACING = computed(() => (props.showTableHeader ? 6 : 15))

  // 使用表格高度计算 Hook
  const { containerHeight } = useTableHeight({
    showTableHeader: computed(() => props.showTableHeader),
    additionalHeightOffset: computed(() => props.additionalHeightOffset),
    paginationHeight,
    tableHeaderHeight,
    paginationSpacing: PAGINATION_SPACING
  })

  // 最大高度表格由内容撑开，再由 Element Plus 限高；不能同时强制 100% 高度。
  const usesMaxHeight = computed(
    () => props.maxHeight != null && !props.height && !isFullScreen.value
  )
  const tableContainerStyle = computed(() =>
    usesMaxHeight.value ? { height: 'auto' } : containerHeight.value
  )

  // 表格高度逻辑
  const height = computed(() => {
    // 全屏模式下占满全屏
    if (isFullScreen.value) return '100%'
    // 初次加载也使用稳定的空表格高度，避免未定高容器中的百分比高度反馈。
    // 加载期间保留业务显式传入的高度。
    if (isEmpty.value && !props.loading)
      return `max(${props.emptyHeight}, ${emptyTableHeight.value}px)`
    if (isEmpty.value && !props.height) return props.emptyHeight
    // 使用传入的高度
    if (props.height) return props.height
    // 显式清除空表格留下的内联高度；undefined 不会重置 Element Plus 的旧高度。
    if (usesMaxHeight.value) return ''
    // 默认占满容器高度
    return '100%'
  })

  type HeaderCellStyle = NonNullable<TableProps<ArtTableRow>['headerCellStyle']>
  type HeaderCellStyleResolver = Extract<HeaderCellStyle, (...args: never[]) => unknown>
  type HeaderCellStyleContext = Parameters<HeaderCellStyleResolver>[0]

  // 默认使用可辨识的项目灰阶；业务传入的样式保持最高优先级。
  const headerCellStyle = computed<HeaderCellStyle>(() => {
    const defaultStyle = {
      backgroundColor: isHeaderBackground.value ? 'var(--art-gray-200)' : 'var(--default-box-color)'
    }
    const customStyle = props.headerCellStyle

    if (typeof customStyle === 'function') {
      return (context: HeaderCellStyleContext) => ({
        ...defaultStyle,
        ...customStyle(context)
      })
    }

    return {
      ...defaultStyle,
      ...customStyle
    }
  })

  // 只有显式传入时才覆盖 ElTable 的原生默认值，避免继承的 Boolean props 把官方默认值冲掉。
  const hasExplicitTableProp = (propName: string): boolean => {
    const rawProps = (instance?.vnode.props || {}) as Record<string, unknown>
    const kebabName = propName.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
    return propName in rawProps || kebabName in rawProps
  }

  const mergedTableProps = computed(() => {
    const tableProps = {
      ...attrs,
      ...props
    } as Record<string, unknown>
    delete tableProps.selectedRowKeys
    delete tableProps.fixedColumnMinWidth
    delete tableProps.loadingOverlay

    return {
      ...tableProps,
      data: filteredRows.value,
      height: height.value,
      scrollbarAlwaysOn: hasExplicitTableProp('scrollbarAlwaysOn')
        ? props.scrollbarAlwaysOn
        : false,
      stripe: stripe.value,
      border: border.value,
      size: size.value,
      headerCellStyle: headerCellStyle.value,
      rowClassName: resolveRowClassName,
      onCellMouseEnter: handleCellMouseEnter,
      // Element Plus 默认值为 true，未显式传入时不应被 ArtTable 覆盖成 false。
      selectOnIndeterminate: hasExplicitTableProp('selectOnIndeterminate')
        ? props.selectOnIndeterminate
        : undefined
    }
  })

  // 是否显示分页器
  const currentPagination = computed(() =>
    props.pagination === false ? undefined : props.pagination
  )

  const showPagination = computed(() => !!currentPagination.value && !isEmpty.value)
  watchPostEffect(() => {
    if (!showPagination.value) return
    // Element Plus does not expose a label prop for its built-in page-size selector.
    paginationRef.value
      ?.querySelector<HTMLInputElement>('.el-pagination__sizes input[role="combobox"]')
      ?.setAttribute('aria-label', t('table.pagination.pageSize'))
  })
  const hasDraggableColumn = computed(() =>
    visibleColumns.value.some(
      (column) => column.draggable === true || typeof column.draggable === 'function'
    )
  )

  const hasSelectionColumn = computed(() =>
    visibleColumns.value.some((column) => column.type === 'selection')
  )

  // Element Plus 在部分场景会先用 $index = -1 进行预渲染。
  // 这对普通展示无影响，但会让 ElForm 错误注册出 lineList.-1.xxx 这类字段。
  const shouldRenderSlotScope = (slotScope: { $index?: number }) => {
    return slotScope.$index === undefined || slotScope.$index >= 0
  }

  const shouldUseCustomCellTemplate = (col: ArtTableColumn) => {
    return (
      (col.useSlot && col.prop) ||
      !!col.dict ||
      !!col.link ||
      isValidationColumn(col) ||
      col.draggable === true ||
      typeof col.draggable === 'function'
    )
  }

  const isRowActionsColumn = (col: ArtTableColumn): boolean => col.prop === 'operation'

  const isBusinessTableRowActions = (content: unknown): boolean =>
    isVNode(content) &&
    (content.type === BusinessTableRowActions || content.type === BusinessAttachmentRowActions)

  const EMPTY_CELL_TEXT = '--'

  const isEmptyCellValue = (value: unknown) => {
    return (
      value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
    )
  }

  const formatEmptyCellValue = (value: unknown) => {
    if (isEmptyCellValue(value)) return EMPTY_CELL_TEXT
    if (isComponentCellContent(value)) return value
    return value
  }

  const resolveColumnBoolean = (
    value: boolean | ((row: ArtTableRow) => boolean) | undefined,
    row: ArtTableRow,
    defaultValue = false
  ) => {
    if (typeof value === 'function') return value(row)
    return value ?? defaultValue
  }

  const isColumnDraggable = (col: ArtTableColumn, row: ArtTableRow) => {
    return resolveColumnBoolean(col.draggable, row)
  }

  const isColumnDragDisabled = (col: ArtTableColumn, row: ArtTableRow) => {
    return activeColumnFilterCount.value > 0 || resolveColumnBoolean(col.dragDisabled, row)
  }

  const getCellValue = (row: ArtTableRow, prop: string) => {
    return prop.split('.').reduce<unknown>((value, key) => {
      if (value && typeof value === 'object') {
        return (value as Record<string, unknown>)[key]
      }
      return undefined
    }, row)
  }

  const isValidationColumn = (column: ArtTableColumn): boolean =>
    Boolean(column.prop && (column.required || column.rules))

  const getValidationRowKey = (row: ArtTableRow): string => {
    const identity = getRowIdentity(row)
    if (identity) return `key:${identity}`
    if (row && typeof row === 'object') {
      const existing = validationRowKeys.get(row)
      if (existing) return existing
      const generated = `row:${++validationRowKeySeed}`
      validationRowKeys.set(row, generated)
      return generated
    }
    return `value:${String(row)}`
  }

  const getValidationKey = (column: ArtTableColumn, row: ArtTableRow): string =>
    `${getValidationRowKey(row)}::${String(column.prop)}`

  const getCellValidationKey = (column: ArtTableColumn, row: ArtTableRow): string | undefined =>
    isValidationColumn(column) ? getValidationKey(column, row) : undefined

  const getCellValidationError = (
    column: ArtTableColumn,
    row: ArtTableRow
  ): InternalTableValidationError | undefined => {
    if (!isValidationColumn(column)) return undefined
    return validationErrors.value.get(getValidationKey(column, row))
  }

  const isCellValidationError = (column: ArtTableColumn, row: ArtTableRow): boolean =>
    Boolean(getCellValidationError(column, row))

  const isRequiredValueEmpty = (value: unknown): boolean =>
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)

  const getValidationColumns = (): ArtTableColumn[] => {
    const columns: ArtTableColumn[] = []
    const visit = (items: ArtTableColumn[]): void => {
      items.forEach((column) => {
        if (column.children?.length) visit(column.children)
        else if (isValidationColumn(column)) columns.push(column)
      })
    }
    visit(visibleColumns.value)
    return columns
  }

  const resolveValidationMessage = (
    message: ArtTableColumn['requiredMessage'],
    context: TableColumnValidationContext<ArtTableRow>,
    fallback: string
  ): string => (typeof message === 'function' ? message(context) : message || fallback)

  const validateCell = async (
    column: ArtTableColumn,
    row: ArtTableRow,
    rowIndex: number
  ): Promise<InternalTableValidationError | undefined> => {
    const prop = String(column.prop)
    const value = getCellValue(row, prop)
    const context: TableColumnValidationContext<ArtTableRow> = { row, rowIndex, prop, value }
    const label = column.label || prop
    const key = getValidationKey(column, row)
    const createError = (message: string): InternalTableValidationError => ({
      key,
      row,
      rowIndex,
      prop,
      label,
      value,
      message
    })

    if (column.required && isRequiredValueEmpty(value)) {
      return createError(
        resolveValidationMessage(
          column.requiredMessage,
          context,
          `第 ${rowIndex + 1} 行“${label}”不能为空`
        )
      )
    }

    const rules = column.rules ? (Array.isArray(column.rules) ? column.rules : [column.rules]) : []
    for (const rule of rules) {
      try {
        const result = await rule.validator(context)
        if (result === false || typeof result === 'string') {
          return createError(
            typeof result === 'string'
              ? result
              : resolveValidationMessage(
                  rule.message,
                  context,
                  `第 ${rowIndex + 1} 行“${label}”填写不正确`
                )
          )
        }
      } catch {
        return createError(
          resolveValidationMessage(
            rule.message,
            context,
            `第 ${rowIndex + 1} 行“${label}”校验失败，请检查后重试`
          )
        )
      }
    }
    return undefined
  }

  const revealTableCell = (cell: HTMLElement): void => {
    cell.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' })
    const viewport = cell
      .closest('.el-table__body-wrapper')
      ?.querySelector<HTMLElement>('.el-scrollbar__wrap')
    const row = cell.closest('tr')
    const tableCell = cell.closest('td')
    // 原生焦点滚动不扣除固定列占用的空间，需要按实际可见边界补偿。
    if (
      viewport &&
      row &&
      !tableCell?.matches('.el-table-fixed-column--left, .el-table-fixed-column--right')
    ) {
      const viewportRect = viewport.getBoundingClientRect()
      const visibleLeft = Math.max(
        viewportRect.left,
        ...Array.from(row.querySelectorAll('.el-table-fixed-column--left')).map(
          (fixedCell) => fixedCell.getBoundingClientRect().right
        )
      )
      const visibleRight = Math.min(
        viewportRect.left + viewport.clientWidth,
        ...Array.from(row.querySelectorAll('.el-table-fixed-column--right')).map(
          (fixedCell) => fixedCell.getBoundingClientRect().left
        )
      )
      const cellRect = cell.getBoundingClientRect()
      if (cellRect.left < visibleLeft) viewport.scrollLeft += cellRect.left - visibleLeft
      else if (cellRect.right > visibleRight) viewport.scrollLeft += cellRect.right - visibleRight
    }
  }

  const handleControlFocus = (event: FocusEvent): void => {
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.matches('input, textarea, button, [tabindex]'))
      return
    const cell = target.closest<HTMLElement>('td')
    if (!cell || target.closest('.art-table') !== containerRef.value) return
    // 展开行的单元格跨越整张宽表，滚动它会把左侧输入框带到最右端。
    const region = cell.classList.contains('el-table__expanded-cell')
      ? (target.closest<HTMLElement>('.el-input, .el-textarea, .el-select, .el-date-editor') ??
        target)
      : cell
    requestAnimationFrame(() => {
      if (!target.isConnected || document.activeElement !== target) return
      if (region !== cell) {
        const viewport = cell
          .closest('.el-table__body-wrapper')
          ?.querySelector<HTMLElement>('.el-scrollbar__wrap')
        if (viewport) {
          const bounds = viewport.getBoundingClientRect()
          const control = region.getBoundingClientRect()
          if (
            control.left >= bounds.left &&
            control.right <= bounds.left + viewport.clientWidth &&
            control.top >= bounds.top &&
            control.bottom <= bounds.top + viewport.clientHeight
          )
            return
        }
      }
      revealTableCell(region)
    })
  }

  const focusValidationError = async (
    error: InternalTableValidationError | undefined
  ): Promise<void> => {
    if (!error) return
    await nextTick()
    const cells = Array.from(
      containerRef.value?.querySelectorAll<HTMLElement>('[data-art-validation-key]') ?? []
    )
    const cell = cells.find((item) => item.dataset.artValidationKey === error.key)
    if (!cell) return
    revealTableCell(cell)
    const control = cell.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    control?.focus({ preventScroll: true })
  }

  const toValidationResult = (
    errors: InternalTableValidationError[]
  ): ArtTableValidationResult => ({
    valid: errors.length === 0,
    errors,
    firstError: errors[0]
  })

  const validateColumns = async (
    columns: ArtTableColumn[],
    replaceAll: boolean
  ): Promise<ArtTableValidationResult> => {
    const rows = flattenRows(props.data ?? [])
    const errors: InternalTableValidationError[] = []
    for (const [rowIndex, row] of rows.entries()) {
      for (const column of columns) {
        const error = await validateCell(column, row, rowIndex)
        if (error) errors.push(error)
      }
    }

    const nextErrors = replaceAll
      ? new Map<string, InternalTableValidationError>()
      : new Map(validationErrors.value)
    if (!replaceAll) {
      const propsToReplace = new Set(columns.map((column) => String(column.prop)))
      nextErrors.forEach((error, key) => {
        if (propsToReplace.has(error.prop)) nextErrors.delete(key)
      })
    }
    errors.forEach((error) => nextErrors.set(error.key, error))
    validationErrors.value = nextErrors
    await focusValidationError(errors[0])
    return toValidationResult(errors)
  }

  const validate = (): Promise<ArtTableValidationResult> =>
    validateColumns(getValidationColumns(), true)

  const validateField = (fields: string | string[]): Promise<ArtTableValidationResult> => {
    const fieldSet = new Set(Array.isArray(fields) ? fields : [fields])
    return validateColumns(
      getValidationColumns().filter((column) => fieldSet.has(String(column.prop))),
      false
    )
  }

  const clearValidate = (fields?: string | string[]): void => {
    validationRefreshSeed++
    if (!fields) {
      validationErrors.value = new Map()
      return
    }
    const fieldSet = new Set(Array.isArray(fields) ? fields : [fields])
    const nextErrors = new Map(validationErrors.value)
    nextErrors.forEach((error, key) => {
      if (fieldSet.has(error.prop)) nextErrors.delete(key)
    })
    validationErrors.value = nextErrors
  }

  const revalidateActiveErrors = async (): Promise<void> => {
    const currentErrors = [...validationErrors.value.values()]
    if (!currentErrors.length) return
    const refreshId = ++validationRefreshSeed
    const rows = flattenRows(props.data ?? [])
    const columns = getValidationColumns()
    const nextErrors = new Map(validationErrors.value)
    for (const currentError of currentErrors) {
      const rowIndex = rows.indexOf(currentError.row)
      const column = columns.find((item) => String(item.prop) === currentError.prop)
      if (rowIndex < 0 || !column) {
        nextErrors.delete(currentError.key)
        continue
      }
      const error = await validateCell(column, currentError.row, rowIndex)
      if (error) nextErrors.set(error.key, error)
      else nextErrors.delete(currentError.key)
    }
    if (refreshId === validationRefreshSeed) validationErrors.value = nextErrors
  }

  const getDictColumnValue = (col: ArtTableColumn, row: ArtTableRow) => {
    if (col.dict?.value) return col.dict.value(row)
    if (col.prop) return getCellValue(row, col.prop) as string | number | null | undefined
    return undefined
  }

  const getColumnCellContent = (
    col: ArtTableColumn,
    slotScope: { row: ArtTableRow; column: unknown; $index: number }
  ) => {
    if (col.formatter) return formatEmptyCellValue(col.formatter(slotScope.row))
    if (col.prop) return formatEmptyCellValue(getCellValue(slotScope.row, col.prop))
    return EMPTY_CELL_TEXT
  }

  const renderColumnLink = (col: ArtTableColumn, row: ArtTableRow) => {
    const rawContent = col.formatter
      ? col.formatter(row)
      : col.prop
        ? getCellValue(row, col.prop)
        : null
    const content = formatEmptyCellValue(rawContent)
    const link = col.link
    const authorized = !link?.permission || hasAuth(link.permission)
    const enabled = authorized && !link?.disabled?.(row) && !isEmptyCellValue(rawContent)
    const children = isVNode(content) ? [content] : String(content)

    if (!link || !enabled) return h('span', null, children)

    const title =
      link.title?.(row) || `查看${isVNode(content) ? col.label || '详情' : String(rawContent)}详情`
    const isCompositeContent = isVNode(content)
    const activate = () => {
      if ((!link.permission || hasAuth(link.permission)) && !link.disabled?.(row)) {
        void link.onClick(row)
      }
    }
    return h(
      isCompositeContent ? 'div' : 'button',
      {
        ...(isCompositeContent ? { role: 'button', tabindex: 0 } : { type: 'button' }),
        class: ['art-table__cell-link', { 'is-composite': isCompositeContent }],
        title,
        onClick: (event: MouseEvent) => {
          event.stopPropagation()
          activate()
        },
        onKeydown: (event: KeyboardEvent) => {
          if (isCompositeContent && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            event.stopPropagation()
            activate()
          }
        }
      },
      children
    )
  }

  const isComponentCellContent = (content: unknown) => {
    return content !== null && (typeof content === 'object' || typeof content === 'function')
  }

  /**
   * Element Plus 表格内部始终包含一个滚动容器。仅有横向溢出时，这个容器会吞掉
   * 纵向滚轮，导致外层弹窗/抽屉无法滚动。内部确实可纵向滚动时保持原行为；否则
   * 将纵向滚动交给最近的可滚动父容器，避免形成滚轮陷阱。
   */
  const handleWheelBoundary = (event: WheelEvent): void => {
    const tableElement = event.currentTarget as HTMLElement | null
    handoffVerticalWheel(event, tableElement)
  }

  const getRowIdentity = (row: ArtTableRow): string => {
    const rowKey = props.rowKey
    if (typeof rowKey === 'function') return String(rowKey(row))
    if (typeof rowKey === 'string') return String(getCellValue(row, rowKey) ?? '')
    return String(row.id ?? '')
  }

  const selectedRowKeySet = computed(
    () => new Set(props.selectedRowKeys.map((key) => String(key)).filter(Boolean))
  )

  const normalizeClassName = (value: unknown): string => {
    if (Array.isArray(value)) return value.map(normalizeClassName).filter(Boolean).join(' ')
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([className]) => className)
        .join(' ')
    }
    return typeof value === 'string' ? value : ''
  }

  const resolveRowClassName = (scope: { row: ArtTableRow; rowIndex: number }) => {
    const customClassName =
      typeof props.rowClassName === 'function' ? props.rowClassName(scope) : props.rowClassName
    const classNames = [normalizeClassName(customClassName)]
    if (selectedRowKeySet.value.has(getRowIdentity(scope.row))) {
      classNames.push('is-art-selected-row')
    }
    return classNames.filter(Boolean).join(' ')
  }

  const callTableEventHandler = (handler: unknown, ...args: unknown[]): void => {
    if (Array.isArray(handler)) {
      handler.forEach((item) => callTableEventHandler(item, ...args))
      return
    }
    if (typeof handler === 'function') {
      handler(...args)
    }
  }

  const applyRowSelectionByDrag = (row: ArtTableRow | undefined): void => {
    if (!row) return
    const rowKey = getRowIdentity(row)
    if (!rowKey || dragSelectedRowKeys.has(rowKey)) return
    const selected = selectedRowKeySet.value.has(rowKey)
    const shouldSelect = rowSelectionDragMode.value === 'select'
    if (selected === shouldSelect) return
    dragSelectedRowKeys.add(rowKey)
    elTableRef.value?.toggleRowSelection(row, shouldSelect)
  }

  const startRowSelectionDrag = (row: ArtTableRow): void => {
    const startRow = rowSelectionDragStartRow.value
    if (!startRow) return
    isRowSelectionDragging.value = true
    applyRowSelectionByDrag(startRow)
    applyRowSelectionByDrag(row)
  }

  const endRowSelectionDrag = (): void => {
    isRowSelectionDragging.value = false
    rowSelectionDragStartRow.value = undefined
    dragSelectedRowKeys.clear()
  }

  const handleCellMouseEnter = (
    row: ArtTableRow,
    column: unknown,
    cell: HTMLTableCellElement,
    event: Event
  ): void => {
    callTableEventHandler(
      (attrs as Record<string, unknown>).onCellMouseEnter,
      row,
      column,
      cell,
      event
    )
    if (!rowSelectionDragStartRow.value) return
    if (!(event instanceof MouseEvent) || (event.buttons & 1) === 0) {
      endRowSelectionDrag()
      return
    }
    startRowSelectionDrag(row)
  }

  const ignoredDragStartSelector = [
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '.el-button',
    '.el-switch',
    '.el-radio',
    '.el-input',
    '.el-select',
    '.el-dropdown',
    '.art-table__drag-handle'
  ].join(',')

  const getPointerRow = (event: MouseEvent): ArtTableRow | undefined => {
    const target = event.target
    if (!(target instanceof Element)) return undefined
    const rowElement = target.closest<HTMLTableRowElement>('tr.el-table__row')
    const tableBody = rowElement?.parentElement
    if (!rowElement || !tableBody) return undefined
    const rowElements = Array.from(
      tableBody.querySelectorAll<HTMLTableRowElement>('tr.el-table__row')
    )
    const rowIndex = rowElements.indexOf(rowElement)
    return flattenRows(props.data ?? [])[rowIndex]
  }

  const handleTableMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || props.loading || !hasSelectionColumn.value) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('.el-table__body-wrapper')) return
    if (target.closest('.el-checkbox')) return
    if (target.closest(ignoredDragStartSelector)) return

    const row = getPointerRow(event)
    if (!row) return
    rowSelectionDragStartRow.value = row
    rowSelectionDragMode.value = selectedRowKeySet.value.has(getRowIdentity(row))
      ? 'deselect'
      : 'select'
    dragSelectedRowKeys.clear()
  }

  useEventListener(window, 'mouseup', endRowSelectionDrag)
  useEventListener(window, 'blur', endRowSelectionDrag)

  const rowTreeUtils = new TreeUtils({ deepClone: false })

  const flattenRows = (rows: ArtTableRow[] = []): ArtTableRow[] => {
    const result: ArtTableRow[] = []
    rowTreeUtils.traverse(rows, (row) => {
      result.push(row)
    })
    return result
  }

  const rowMap = computed(() => {
    const map = new Map<string, ArtTableRow>()
    flattenRows(props.data ?? []).forEach((row) => {
      const key = getRowIdentity(row)
      if (key) map.set(key, row)
    })
    return map
  })

  const getDragHandleRowKey = (rowElement: Element | undefined): string | undefined => {
    const handle = rowElement?.querySelector<HTMLElement>('.art-table__drag-handle')
    return handle?.dataset.rowKey || undefined
  }

  const getVisibleRowKeysFromDom = (): string[] => {
    const tableElement = elTableRef.value?.$el as HTMLElement | undefined
    return Array.from(
      tableElement?.querySelectorAll('.el-table__body-wrapper .el-table__row') ?? []
    )
      .map((rowElement) => getDragHandleRowKey(rowElement))
      .filter((key): key is string => !!key)
  }

  const buildRowDragPayload = (event: DraggableEvent<ArtTableRow>): RowDragPayload => {
    const snapshotKeys = rowKeysBeforeDrag.value.length
      ? rowKeysBeforeDrag.value
      : getVisibleRowKeysFromDom()
    const rowKey = snapshotKeys[event.oldIndex ?? -1]
    const targetRowKey = snapshotKeys[event.newIndex ?? -1]
    return {
      row: rowKey ? rowMap.value.get(rowKey) : undefined,
      targetRow: targetRowKey ? rowMap.value.get(targetRowKey) : undefined,
      oldIndex: event.oldIndex,
      newIndex: event.newIndex,
      event
    }
  }

  const handleRowDragStart = (event: DraggableEvent<ArtTableRow>) => {
    rowKeysBeforeDrag.value = getVisibleRowKeysFromDom()
    emit('row-drag-start', buildRowDragPayload(event))
  }

  const handleRowDragUpdate = (event: DraggableEvent<ArtTableRow>) => {
    emit('row-drag-update', buildRowDragPayload(event))
  }

  const handleRowDragEnd = (event: DraggableEvent<ArtTableRow>) => {
    emit('row-drag-end', buildRowDragPayload(event))
    rowKeysBeforeDrag.value = []
  }

  const rowDraggable = useDraggable<ArtTableRow>(sortableTargetRef, {
    immediate: false,
    handle: '.art-table__drag-handle:not(.is-disabled)',
    draggable: '.el-table__row',
    filter: '.art-table__drag-handle.is-disabled',
    preventOnFilter: false,
    animation: 150,
    ghostClass: 'art-table__drag-ghost',
    chosenClass: 'art-table__drag-chosen',
    onStart: handleRowDragStart,
    onUpdate: handleRowDragUpdate,
    onEnd: handleRowDragEnd
  })

  const syncRowDraggable = async () => {
    await nextTick()
    const tableElement = elTableRef.value?.$el as HTMLElement | undefined
    const target = tableElement?.querySelector<HTMLElement>('.el-table__body-wrapper tbody')

    if (target && sortableTargetRef.value !== target) {
      sortableTargetRef.value = target
      rowDraggable.start(target)
    }

    rowDraggable.option('disabled', !hasDraggableColumn.value || !!props.loading)
  }

  watch(
    () => [hasDraggableColumn.value, props.loading, props.data?.length],
    () => {
      void syncRowDraggable()
    },
    { immediate: true, flush: 'post' }
  )

  watch(
    () => props.data,
    (value, previous) => {
      if (value !== previous) clearValidate()
      else void revalidateActiveErrors()
    },
    { deep: true, flush: 'post' }
  )

  // 清理列属性，移除插槽相关的自定义属性，确保它们不会被 ElTableColumn 错误解释
  const cleanColumnProps = (col: ArtTableColumn) => {
    const columnProps = fitColumnHeaderControls({ ...col })
    if (isRowActionsColumn(columnProps)) {
      // 按当前可见操作测量宽度，计入单元格留白和纵向滚动条，避免按钮被遮挡。
      columnProps.className = [columnProps.className, 'art-table-operation-column']
        .filter(Boolean)
        .join(' ')
      columnProps.width = rowActionsWidth.value
      columnProps.minWidth = rowActionsWidth.value
    }
    if (containerWidth.value > 0 && containerWidth.value < props.fixedColumnMinWidth) {
      columnProps.fixed = false
    }
    const shouldDefaultOverflowTooltip =
      columnProps.showOverflowTooltip === undefined &&
      !['selection', 'expand', 'globalIndex'].includes(String(columnProps.type)) &&
      columnProps.prop !== 'operation'

    if (shouldDefaultOverflowTooltip) {
      columnProps.showOverflowTooltip = true
    }

    const shouldFormatEmptyValue =
      !columnProps.useSlot &&
      !columnProps.dict &&
      columnProps.prop &&
      !['selection', 'expand', 'globalIndex', 'index'].includes(String(columnProps.type))

    if (shouldFormatEmptyValue) {
      const userFormatter = columnProps.formatter
      columnProps.formatter = (row: ArtTableRow) => {
        const value = userFormatter
          ? userFormatter(row)
          : getCellValue(row, String(columnProps.prop))
        const formattedValue = formatEmptyCellValue(value)

        if (
          isRowActionsColumn(columnProps) &&
          isVNode(formattedValue) &&
          isBusinessTableRowActions(formattedValue)
        ) {
          return cloneVNode(formattedValue, { row })
        }

        if (
          isRowActionsColumn(columnProps) &&
          userFormatter &&
          !isBusinessTableRowActions(formattedValue)
        ) {
          return h(BusinessTableRowActions, { row }, { default: () => formattedValue })
        }

        return formattedValue
      }
    }

    // 删除自定义的插槽控制属性
    delete columnProps.useHeaderSlot
    delete columnProps.headerSlotName
    delete columnProps.useSlot
    delete columnProps.slotName
    delete columnProps.draggable
    delete columnProps.dragDisabled
    delete columnProps.dragIcon
    delete columnProps.dict
    delete columnProps.link
    delete columnProps.children
    delete columnProps.required
    delete columnProps.requiredMessage
    delete columnProps.rules
    delete columnProps.filterType
    return columnProps
  }

  // 分页大小变化
  const handleSizeChange = (val: number) => {
    emit('pagination:size-change', val)
  }

  // 分页当前页变化
  const handleCurrentChange = (val: number) => {
    emit('pagination:current-change', val)
    scrollToTop() // 页码改变后滚动到表格顶部
  }

  const { scrollToTop: scrollPageToTop } = useCommon()

  // 滚动表格内容到顶部，并可以联动页面滚动到顶部
  const scrollToTop = () => {
    nextTick(() => {
      elTableRef.value?.setScrollTop(0) // 滚动 ElTable 内部滚动条到顶部
      scrollPageToTop() // 调用公共 composable 滚动页面到顶部
    })
  }

  // 全局序号
  const getGlobalIndex = (index: number) => {
    if (!currentPagination.value) return index + 1
    const { current, size } = currentPagination.value
    return (current - 1) * size + index + 1
  }

  const emit = defineEmits<{
    (e: 'pagination:size-change', val: number): void
    (e: 'pagination:current-change', val: number): void
    (e: 'row-drag-start', payload: RowDragPayload): void
    (e: 'row-drag-update', payload: RowDragPayload): void
    (e: 'row-drag-end', payload: RowDragPayload): void
  }>()

  // 查找并绑定当前表格所在卡片内的头部元素，避免多个表格共享全局 id 时算错高度。
  const findTableHeader = () => {
    if (!props.showTableHeader) {
      tableHeaderRef.value = undefined
      return
    }

    const tableElement = elTableRef.value?.$el as HTMLElement | undefined
    const tableBody = tableElement?.closest('.el-card__body')
    const tableHeader = tableBody?.querySelector<HTMLElement>('.art-table-header')

    if (tableHeader) {
      tableHeaderRef.value = tableHeader
    } else {
      tableHeaderRef.value = undefined
    }
  }

  watchEffect(
    () => {
      // 访问响应式数据以建立依赖追踪
      void props.data?.length // 追踪数据变化
      const shouldShow = props.showTableHeader

      // 只有在需要显示表格头部时才查找
      if (shouldShow) {
        nextTick(() => {
          findTableHeader()
        })
      } else {
        // 不显示时清空引用
        tableHeaderRef.value = undefined
      }
    },
    { flush: 'post' }
  )

  defineExpose({
    validate,
    validateField,
    clearValidate,
    scrollToTop,
    elTableRef
  })
</script>

<style lang="scss" scoped>
  @use './style';
</style>
