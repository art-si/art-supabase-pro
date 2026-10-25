<template>
  <div v-show="showTrigger" class="art-data-select">
    <template v-if="!$slots.trigger">
      <ElInput
        v-if="!multiple"
        :model-value="singleDisplayLabel"
        :placeholder="placeholder"
        :disabled="disabled"
        readonly
        class="art-data-select__single-input"
        aria-haspopup="dialog"
        @click="open"
        @keydown.enter.prevent="open"
        @keydown.space.prevent="open"
      >
        <template #suffix>
          <button
            v-if="clearable && displayRows.length && !disabled"
            type="button"
            class="art-data-select__clear size-6 shrink-0"
            aria-label="清空"
            @click.stop="clear"
          >
            <ElIcon>
              <CircleClose />
            </ElIcon>
          </button>
          <ElIcon v-else class="art-data-select__single-arrow">
            <ArrowDown />
          </ElIcon>
        </template>
      </ElInput>
      <ElInputTag
        v-else
        :model-value="multipleDisplayLabels"
        :aria-label="placeholder"
        :max="displayRows.length"
        :placeholder="placeholder"
        :disabled="disabled"
        :clearable="false"
        collapse-tags
        collapse-tags-tooltip
        :max-collapse-tags="maxTagCount"
        class="art-data-select__multiple-input"
        aria-haspopup="dialog"
        @click="open"
        @keydown.enter.prevent="open"
        @keydown.space.prevent="open"
        @remove-tag="handleRemoveDisplayTag"
      >
        <template #suffix>
          <button
            v-if="clearable && displayRows.length && !disabled"
            type="button"
            class="art-data-select__clear size-6 shrink-0"
            aria-label="清空"
            @click.stop="clear"
          >
            <ElIcon><CircleClose /></ElIcon>
          </button>
          <ElIcon v-else class="art-data-select__multiple-arrow">
            <ArrowDown />
          </ElIcon>
        </template>
      </ElInputTag>
      <button
        v-if="selectedReferenceError"
        type="button"
        class="mt-1 text-xs text-[var(--el-color-danger)] underline"
        @click="resolveSelectedReferences"
        >资料加载失败，点击重试</button
      >
    </template>

    <slot
      v-else
      name="trigger"
      :open="open"
      :clear="clear"
      :selected-rows="displayRows"
      :selected-keys="confirmedKeys"
    />

    <ArtDialog
      ref="dialogRef"
      :subtitle="subtitle"
      :dialog-props="dialogProps"
      @close="invalidateLoad"
      @opened="handleDialogOpened"
      @closed="handleDialogClosed"
    >
      <div class="art-data-select-dialog__body" :style="compactTableBodyStyle">
        <div
          class="art-data-select-dialog__layout"
          :class="[
            `is-${mode}-mode`,
            {
              'has-selected-panel': shouldShowSelectedPanel
            }
          ]"
        >
          <aside v-if="navigation" class="art-data-select-dialog__navigation">
            <div class="art-data-select-dialog__navigation-header">
              <span>{{ navigation.title || '分类导航' }}</span>
              <small>{{ navigationRows.length }} 项</small>
            </div>
            <ElInput
              v-if="navigationRows.length"
              v-model="navigationKeyword"
              clearable
              :placeholder="navigation.searchPlaceholder || '搜索分类'"
              class="art-data-select-dialog__navigation-search"
            >
              <template #prefix>
                <ElIcon><Search /></ElIcon>
              </template>
            </ElInput>
            <button
              type="button"
              class="art-data-select-dialog__navigation-all"
              :class="{ 'is-current': !selectedNavigationKey }"
              @click="selectNavigation()"
            >
              <span class="art-data-select-dialog__navigation-icon" aria-hidden="true">
                <ArtSvgIcon icon="ri:apps-2-line" />
              </span>
              <span class="art-data-select-dialog__navigation-copy">
                <strong>{{ navigation.allLabel || '全部' }}</strong>
                <small v-if="navigation.allDescription">{{ navigation.allDescription }}</small>
              </span>
              <ArtSvgIcon v-if="!selectedNavigationKey" icon="ri:check-line" aria-hidden="true" />
            </button>
            <ElScrollbar class="art-data-select-dialog__navigation-scrollbar">
              <ElTree
                ref="navigationTreeRef"
                :data="navigationTreeData"
                :props="navigationTreeProps"
                :node-key="navigationRowKey"
                :current-node-key="selectedNavigationKey || undefined"
                :filter-node-method="filterNavigationNode"
                default-expand-all
                highlight-current
                :expand-on-click-node="false"
                :empty-text="navigation.emptyText || '暂无分类'"
                @node-click="selectNavigation"
              >
                <template #default="{ data }">
                  <span class="art-data-select-dialog__navigation-node">
                    <span class="art-data-select-dialog__navigation-icon" aria-hidden="true">
                      <ArtSvgIcon icon="ri:folder-3-line" />
                    </span>
                    <span class="art-data-select-dialog__navigation-copy">
                      <strong>{{ getNavigationLabel(data) }}</strong>
                      <small v-if="getNavigationDescription(data)">
                        {{ getNavigationDescription(data) }}
                      </small>
                    </span>
                  </span>
                </template>
                <template #empty>
                  <ArtEmptyState
                    :title="
                      navigationKeyword ? '未找到匹配分类' : navigation.emptyText || '暂无分类'
                    "
                    description="请调整搜索关键词或刷新分类数据。"
                    size="compact"
                    :visual-size="64"
                  />
                </template>
              </ElTree>
            </ElScrollbar>
          </aside>

          <section
            ref="mainPanelRef"
            class="art-data-select-dialog__main"
            :class="{
              'has-error': loadError,
              'is-empty': !loading && !loadError && !tableRows.length
            }"
          >
            <div
              v-if="showSearch"
              class="art-data-select-dialog__search"
              :class="{ 'has-filter': normalizedFilterOptions.length }"
            >
              <ElInput
                v-model="keyword"
                clearable
                :placeholder="searchPlaceholder"
                @keyup.enter="handleSearch"
                @clear="handleSearch"
              >
                <template #prefix>
                  <ElIcon>
                    <Search />
                  </ElIcon>
                </template>
              </ElInput>
              <ElSelect
                v-if="normalizedFilterOptions.length"
                v-model="filterValue"
                clearable
                :placeholder="filterPlaceholder"
                @change="handleSearch"
                @clear="handleSearch"
              >
                <ElOption
                  v-for="item in normalizedFilterOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
                <template #empty>
                  <ArtPickerEmpty title="没有匹配的筛选项" />
                </template>
              </ElSelect>
            </div>
            <div
              class="art-data-select-dialog__content"
              :class="{ 'is-tree': mode === 'tree' }"
              :aria-busy="loading"
            >
              <ArtOverlayLoading
                v-if="loading && (mode === 'tree' || loadError)"
                loading
                overlay
                text="正在加载可选数据…"
                description="正在获取最新列表，请稍候"
              />
              <ElScrollbar v-if="loadError" class="art-data-select-dialog__tree-scrollbar">
                <ArtAsyncState
                  :error="loadError"
                  error-title="可选数据加载失败"
                  size="compact"
                  @retry="loadData"
                />
              </ElScrollbar>
              <ArtTable
                v-else-if="mode === 'table'"
                ref="tableRef"
                :data="tableRows"
                :loading="loading"
                loading-overlay
                :pagination="false"
                :show-table-header="false"
                :row-key="getTableRowKey"
                height="100%"
                empty-height="100%"
                :empty-text="emptyText"
                :row-class-name="getTableRowClassName"
                :highlight-current-row="!multiple"
                :tooltip-options="{ enterable: false, popperStyle: { pointerEvents: 'none' } }"
                @row-click="handleTableRowClick"
                @selection-change="handleTableSelectionChange"
              >
                <template v-if="emptyDescription || $slots.empty" #empty>
                  <ArtEmptyState
                    :title="emptyText"
                    :description="emptyDescription"
                    :visual-size="84"
                    size="compact"
                  >
                    <slot name="empty" />
                  </ArtEmptyState>
                </template>
                <ElTableColumn
                  v-if="multiple"
                  type="selection"
                  width="64"
                  align="center"
                  class-name="art-data-select-dialog__selection-cell"
                  :reserve-selection="reserveSelected"
                  :selectable="isRowSelectable"
                />
                <ElTableColumn
                  v-else
                  width="64"
                  align="center"
                  class-name="art-data-select-dialog__selection-cell"
                >
                  <template #default="{ row }">
                    <ElCheckbox
                      :model-value="isDraftSelected(row)"
                      :disabled="loading || !!loadError || isRowDisabled(row)"
                      @click.stop
                      @change="() => setSingle(row)"
                    />
                  </template>
                </ElTableColumn>
                <ElTableColumn
                  v-for="column in normalizedColumns"
                  :key="column.prop"
                  :prop="column.prop"
                  :label="column.label"
                  :width="column.width"
                  :min-width="column.minWidth"
                  :align="column.align"
                  show-overflow-tooltip
                >
                  <template
                    v-if="column.dict || column.formatter || column.tagType"
                    #default="{ row }"
                  >
                    <ArtDictDisplay
                      v-if="column.dict"
                      :dict-code="column.dict.code"
                      :value="getDictColumnValue(column, row)"
                      :display="column.dict.display"
                    />
                    <ElTag
                      v-else-if="column.tagType"
                      :type="getColumnTagType(column, row)"
                      size="small"
                      effect="light"
                    >
                      {{ getColumnValue(column, row) }}
                    </ElTag>
                    <template v-else>
                      <component
                        v-if="isComponentValue(getColumnValue(column, row))"
                        :is="getColumnValue(column, row)"
                      />
                      <span v-else>{{ getColumnValue(column, row) }}</span>
                    </template>
                  </template>
                </ElTableColumn>
              </ArtTable>

              <ArtEmptyState
                v-else-if="!loading && !tableRows.length && (emptyDescription || $slots.empty)"
                :title="emptyText"
                :description="emptyDescription"
                :visual-size="84"
                size="compact"
              >
                <slot name="empty" />
              </ArtEmptyState>

              <ElScrollbar v-else class="art-data-select-dialog__tree-scrollbar">
                <ElTree
                  ref="treeRef"
                  class="art-data-select-dialog__tree"
                  :data="tableRows"
                  :props="treeProps"
                  :node-key="treeNodeKey"
                  :show-checkbox="multiple"
                  :check-strictly="treeCheckStrictly"
                  :default-expand-all="true"
                  :expand-on-click-node="false"
                  :highlight-current="!multiple"
                  :empty-text="emptyText"
                  :filter-node-method="filterTreeNode"
                  @check="handleTreeCheck"
                  @node-click="handleTreeNodeClick"
                >
                  <template #default="{ data }">
                    <span
                      class="art-data-select-dialog__tree-node"
                      :class="{
                        'is-disabled': isRowDisabled(data) && !hasRowChildren(data),
                        'is-grouping': isRowDisabled(data) && hasRowChildren(data),
                        'is-selected': isDraftSelected(data)
                      }"
                    >
                      <span class="art-data-select-dialog__tree-icon" aria-hidden="true">
                        <ArtSvgIcon
                          :icon="hasRowChildren(data) ? 'ri:folder-6-line' : 'ri:node-tree'"
                        />
                      </span>
                      <span class="art-data-select-dialog__tree-copy">
                        <span class="art-data-select-dialog__tree-label">{{
                          getRowLabel(data)
                        }}</span>
                        <small v-if="getRowDescription(data)">{{ getRowDescription(data) }}</small>
                      </span>
                      <ArtSvgIcon
                        v-if="!multiple && isDraftSelected(data)"
                        icon="ri:check-line"
                        class="art-data-select-dialog__tree-check"
                      />
                    </span>
                  </template>
                  <template #empty>
                    <ArtEmptyState
                      :title="keyword ? '未找到匹配项' : emptyText"
                      :description="emptyDescription || '请调整搜索条件或稍后重试。'"
                      size="compact"
                      :visual-size="72"
                    >
                      <slot name="empty" />
                    </ArtEmptyState>
                  </template>
                </ElTree>
              </ElScrollbar>
            </div>

            <div v-if="mode === 'table' && showPagination" class="art-data-select-dialog__pager">
              <span>{{
                loadError
                  ? '数量暂不可用'
                  : mainPanelWidth < 440
                    ? `共 ${total} 条 · 第 ${page} 页`
                    : `共 ${total} 条`
              }}</span>
              <ElPagination
                v-model:current-page="page"
                v-model:page-size="innerPageSize"
                background
                :size="mainPanelWidth < 640 ? 'small' : 'default'"
                :layout="mainPanelWidth < 440 ? 'prev, next, sizes' : 'prev, pager, next, sizes'"
                :pager-count="5"
                :page-sizes="pageSizes"
                :total="total"
                :disabled="loading || !!loadError"
                @change="loadData"
              />
            </div>
          </section>

          <aside
            v-if="shouldShowSelectedPanel"
            class="art-data-select-dialog__selected"
            :class="{ 'is-empty': !draftRows.length }"
          >
            <div class="art-data-select-dialog__selected-header">
              <span>已选 {{ draftRows.length }}</span>
              <ElButton text type="primary" :disabled="!draftRows.length" @click="clearDraft">
                清空
              </ElButton>
            </div>
            <ElScrollbar class="art-data-select-dialog__selected-scrollbar">
              <ArtEmptyState
                v-if="!draftRows.length"
                title="暂未选择数据"
                description="从可选列表选择需要关联的记录。"
                :visual-size="68"
                size="compact"
              />
              <div
                v-for="row in draftRows"
                :key="getRowKey(row)"
                class="art-data-select-dialog__selected-item"
              >
                <div class="art-data-select-dialog__selected-icon">
                  <ArtSvgIcon :icon="mode === 'tree' ? 'ri:node-tree' : 'ri:building-4-line'" />
                </div>
                <div class="art-data-select-dialog__selected-text">
                  <strong>{{ getRowLabel(row) }}</strong>
                  <span v-if="getRowDescription(row)">{{ getRowDescription(row) }}</span>
                </div>
                <ElButton
                  text
                  class="art-data-select-dialog__selected-remove"
                  :aria-label="`移除 ${getRowLabel(row)}`"
                  :title="`移除 ${getRowLabel(row)}`"
                  @click="removeDraft(row)"
                >
                  <ArtSvgIcon icon="ri:close-line" />
                </ElButton>
              </div>
            </ElScrollbar>
          </aside>
        </div>
      </div>

      <template #footer-left>{{ selectionSummary }}</template>
    </ArtDialog>
  </div>
</template>

<script setup lang="ts" generic="T extends object = DataSelectRecord">
  import { dataSelectDefaults } from './defaults'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { useElementSize } from '@vueuse/core'
  import { get, uniqBy } from 'lodash-es'
  import type { Component } from 'vue'
  import type { ElTree } from 'element-plus'
  import { ArrowDown, CircleClose, Search } from '@element-plus/icons-vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import type { ArtDialogExpose, ArtDialogSize } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import TreeUtils from '@/utils/tree'
  import { storeToRefs } from 'pinia'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'
  import type {
    ArtDataSelectEmits,
    ArtDataSelectExpose,
    ArtDataSelectProps,
    DataSelectColumn,
    DataSelectKey,
    DataSelectModelValue,
    DataSelectRecord
  } from './types'

  defineOptions({ name: 'ArtDataSelect' })

  const props = withDefaults(defineProps<ArtDataSelectProps<T>>(), {
    ...dataSelectDefaults,
    mode: 'table',
    multiple: false,
    showPagination: true,
    showSelectedPanel: undefined
  })

  const emit = defineEmits<ArtDataSelectEmits<T>>()
  const { isPlatformScope } = storeToRefs(useTenantScopeStore())

  const mainPanelRef = ref<HTMLElement>()
  const { width: mainPanelWidth } = useElementSize(mainPanelRef)
  const tableRef = ref<ArtTableExpose>()
  const treeRef = ref<InstanceType<typeof ElTree>>()
  const navigationTreeRef = ref<InstanceType<typeof ElTree>>()
  const dialogRef = ref<ArtDialogExpose<void>>()
  const dialogSizePresets: readonly ArtDialogSize[] = ['sm', 'md', 'lg', 'xl', 'full']
  const requestLoading = ref(false)
  const loading = computed(() => requestLoading.value || props.loading)
  const loadError = shallowRef<Error | null>(null)
  const isOpen = ref(false)
  // This generation also owns selection synchronization and dialog-close invalidation;
  // guarding only the resolved list would still allow stale control updates after nextTick.
  let loadGeneration = 0
  const keyword = ref('')
  const filterValue = ref<string | number>()
  const navigationKeyword = ref('')
  const selectedNavigationKey = ref<DataSelectKey>()
  const page = ref(1)
  const innerPageSize = ref(props.pageSize)
  const total = ref(0)
  // 选择器可能承载大列表；行对象由 API/父组件拥有，数组替换即可驱动视图，无需深层代理。
  const tableRows = shallowRef<DataSelectRecord[]>([])
  const confirmedRows = shallowRef<DataSelectRecord[]>([])
  const draftRows = shallowRef<DataSelectRecord[]>([])
  const syncingSelection = ref(false)

  const dialogProps = {
    appendToBody: true,
    closeOnClickModal: false,
    class: 'art-data-select-dialog'
  }

  const confirmedKeys = computed(() => confirmedRows.value.map((row) => getRowKey(row)))
  const draftKeys = computed(() => draftRows.value.map((row) => getRowKey(row)))
  const currentSingleKey = computed(() => draftRows.value[0] && getRowKey(draftRows.value[0]))
  const displayRows = computed(() => confirmedRows.value)
  const singleDisplayLabel = computed(() =>
    displayRows.value[0] ? getRowLabel(displayRows.value[0]) : ''
  )
  const multipleDisplayLabels = computed(() => displayRows.value.map((row) => getRowLabel(row)))
  const normalizedFilterOptions = computed(() => props.filterOptions ?? [])
  const normalizedFilterKey = computed(() => props.filterKey ?? 'type')
  const navigationRowKey = computed(() => props.navigation?.rowKey ?? 'id')
  const navigationParentKey = computed(() => props.navigation?.parentKey ?? 'parentId')
  const navigationChildrenKey = computed(() => props.navigation?.childrenKey ?? 'children')
  const navigationRows = computed(() => props.navigation?.data ?? [])
  const navigationTreeData = computed(() =>
    new TreeUtils({
      idKey: navigationRowKey.value,
      parentKey: navigationParentKey.value,
      childrenKey: navigationChildrenKey.value,
      deepClone: false
    }).listToTree(navigationRows.value)
  )
  const navigationTreeProps = computed(() => ({
    label: (data: DataSelectRecord) => getNavigationLabel(data),
    children: navigationChildrenKey.value
  }))
  const shouldShowSelectedPanel = computed(() => props.showSelectedPanel ?? props.multiple)
  const compactTableBodyStyle = computed(() => {
    if (
      props.mode !== 'table' ||
      props.showPagination ||
      props.navigation ||
      shouldShowSelectedPanel.value
    )
      return undefined
    const rowCount = tableRows.value.length
    if (rowCount > 6) return undefined
    return { height: `${rowCount ? Math.max(220, 118 + rowCount * 62) : 300}px` }
  })
  const treeUtils = computed(
    () => new TreeUtils({ childrenKey: props.childrenKey, deepClone: false })
  )
  const selectionSummary = computed(() => {
    if (props.multiple) return `当前已选择 ${draftRows.value.length} 项`
    return `当前选择：${draftRows.value[0] ? getRowLabel(draftRows.value[0]) : '暂无'}`
  })
  const treeNodeKey = computed(() => (typeof props.rowKey === 'string' ? props.rowKey : '__artKey'))
  const treeProps = computed(() => ({
    label: (data: DataSelectRecord) => getRowLabel(data),
    children: props.childrenKey,
    disabled: (data: DataSelectRecord) => isRowDisabled(data)
  }))

  const normalizedColumns = computed<DataSelectColumn<T>[]>(() => {
    const columns = props.columns.length
      ? props.columns
      : [
          {
            prop: typeof props.labelKey === 'string' ? props.labelKey : 'label',
            label: '名称',
            minWidth: 180
          }
        ]
    return filterTenantDimensionDescriptors(columns, isPlatformScope.value)
  })

  const isComponentValue = (value: unknown): value is Component => {
    return typeof value === 'object' || typeof value === 'function'
  }

  const getColumnValue = (column: DataSelectColumn<T>, row: DataSelectRecord) => {
    const source = getSourceRow(row)
    return (source && column.formatter?.(source)) ?? get(row, column.prop) ?? ''
  }

  const getColumnTagType = (column: DataSelectColumn<T>, row: DataSelectRecord) => {
    const source = getSourceRow(row)
    return typeof column.tagType === 'function' ? source && column.tagType(source) : column.tagType
  }

  const getDictColumnValue = (column: DataSelectColumn<T>, row: DataSelectRecord) => {
    const source = getSourceRow(row)
    if (source && column.dict?.value) return column.dict.value(source)
    return get(row, column.prop) as string | number | null | undefined
  }

  const getRowKey = (row: DataSelectRecord): DataSelectKey => {
    if (typeof props.rowKey === 'function') {
      const source = getSourceRow(row)
      return source ? props.rowKey(source) : (get(row, 'id') as DataSelectKey)
    }
    return get(row, props.rowKey) as DataSelectKey
  }

  const getTableRowKey = (row: DataSelectRecord): string => String(getRowKey(row))

  const getRowLabel = (row: DataSelectRecord): string => {
    if (typeof props.labelKey === 'function') {
      const source = getSourceRow(row)
      return source ? props.labelKey(source) : String(get(row, 'label') ?? '所选资料不可用')
    }
    return String(get(row, props.labelKey) ?? '')
  }

  const getRowDescription = (row: DataSelectRecord): string => {
    if (!props.descriptionKey) return ''
    if (typeof props.descriptionKey === 'function') {
      const source = getSourceRow(row)
      return source ? props.descriptionKey(source) : ''
    }
    return String(get(row, props.descriptionKey) ?? '')
  }

  function getNavigationKey(row: DataSelectRecord): DataSelectKey {
    return get(row, navigationRowKey.value) as DataSelectKey
  }

  function getNavigationLabel(row: DataSelectRecord): string {
    return String(get(row, props.navigation?.labelKey ?? 'label') ?? '')
  }

  function getNavigationDescription(row: DataSelectRecord): string {
    const key = props.navigation?.descriptionKey
    return key ? String(get(row, key) ?? '') : ''
  }

  const filterNavigationNode = (value: string, row: DataSelectRecord): boolean => {
    if (!value) return true
    const query = value.toLowerCase()
    return (
      getNavigationLabel(row).toLowerCase().includes(query) ||
      getNavigationDescription(row).toLowerCase().includes(query)
    )
  }

  const hasRowChildren = (row: DataSelectRecord): boolean => {
    const children = get(row, props.childrenKey)
    return Array.isArray(children) && children.length > 0
  }

  const isRowDisabled = (row: DataSelectRecord): boolean => {
    if (typeof props.disabledKey === 'function') {
      const source = getSourceRow(row)
      return !source || props.disabledKey(source)
    }
    if (!props.disabledKey) return false
    return !!get(row, props.disabledKey)
  }

  const isRowSelectable = (row: DataSelectRecord) =>
    !loading.value && !loadError.value && !isRowDisabled(row)
  const isDraftSelected = (row: DataSelectRecord) => draftKeys.value.includes(getRowKey(row))

  const getTableRowClassName = ({ row }: { row: DataSelectRecord }) => {
    return !props.multiple && isDraftSelected(row) ? 'is-selected-row' : ''
  }

  const flattenRows = (rows: DataSelectRecord[]): DataSelectRecord[] => {
    const result: DataSelectRecord[] = []
    treeUtils.value.traverse(rows, (row) => void result.push(row))
    return result
  }

  const uniqueRows = (rows: DataSelectRecord[]): DataSelectRecord[] =>
    uniqBy(
      rows.filter((row) => getRowKey(row) !== undefined && getRowKey(row) !== null),
      getRowKey
    )

  const normalizeModelKeys = (value: DataSelectModelValue): DataSelectKey[] => {
    if (Array.isArray(value)) return value
    return value === undefined || value === null || value === '' ? [] : [value]
  }

  const getModelValueFromRows = (rows: DataSelectRecord[]): DataSelectModelValue => {
    const keys = rows.map((row) => getRowKey(row))
    return props.multiple ? keys : keys[0]
  }

  const findRowsByKeys = (keys: DataSelectKey[], rows: DataSelectRecord[]) => {
    const rowMap = new Map<DataSelectKey, DataSelectRecord>()
    flattenRows(rows).forEach((row) => rowMap.set(getRowKey(row), row))
    return keys.map((key) => rowMap.get(key) ?? createFallbackRow(key))
  }

  const fallbackRowMarker = Symbol('unresolved-data-select-row')
  const resolvedSelectedRows = shallowRef<T[]>([])
  const selectedReferenceError = ref(false)
  const resolvingSelected = ref(false)
  let selectedReferenceGeneration = 0

  // Element Plus exposes dynamic rows, but real rows originate from typed data/apiFn.
  // This adapter excludes display placeholders before any business callback or event.
  const getSourceRow = (row: DataSelectRecord): T | undefined =>
    Reflect.get(row, fallbackRowMarker) === true ? undefined : (row as T)

  const createFallbackRow = (key: DataSelectKey): DataSelectRecord => {
    if (typeof props.rowKey === 'string' && typeof props.labelKey === 'string') {
      return {
        [fallbackRowMarker]: true,
        [props.rowKey]: key,
        [props.labelKey]: resolvingSelected.value ? '正在加载所选资料…' : '所选资料不可用'
      }
    }
    return {
      [fallbackRowMarker]: true,
      id: key,
      label: resolvingSelected.value ? '正在加载所选资料…' : '所选资料不可用'
    }
  }

  const normalizeTreeRows = (rows: DataSelectRecord[]): DataSelectRecord[] =>
    treeUtils.value.mapTree(rows, (row) => ({
      ...row,
      [treeNodeKey.value]: getRowKey(row)
    }))

  const syncConfirmedFromProps = () => {
    const keys = normalizeModelKeys(props.modelValue)
    const sourceRows = [
      ...resolvedSelectedRows.value,
      ...props.selectedData,
      ...flattenRows(props.data),
      ...flattenRows(tableRows.value)
    ]
    confirmedRows.value = uniqueRows([
      ...findRowsByKeys(keys, sourceRows),
      ...props.selectedData
    ]).filter((row) => keys.includes(getRowKey(row)))
  }

  async function resolveSelectedReferences(): Promise<void> {
    const generation = ++selectedReferenceGeneration
    selectedReferenceError.value = false
    resolvingSelected.value = false
    const keys = normalizeModelKeys(props.modelValue)
    const knownRows = [
      ...props.selectedData,
      ...flattenRows(props.data),
      ...flattenRows(tableRows.value)
    ]
    const missingKeys = keys.filter((key) => !knownRows.some((row) => getRowKey(row) === key))
    resolvedSelectedRows.value = []
    if (!missingKeys.length || !props.resolveSelected) {
      syncConfirmedFromProps()
      return
    }
    resolvingSelected.value = true
    syncConfirmedFromProps()
    try {
      const rows = await props.resolveSelected(missingKeys)
      if (generation !== selectedReferenceGeneration) return
      resolvedSelectedRows.value = rows
    } catch (error) {
      if (generation !== selectedReferenceGeneration) return
      selectedReferenceError.value = true
      emit('load-error', error)
    } finally {
      if (generation === selectedReferenceGeneration) {
        resolvingSelected.value = false
        syncConfirmedFromProps()
      }
    }
  }
  onBeforeUnmount(() => {
    ++selectedReferenceGeneration
  })

  const applyDraftToControls = async (generation = loadGeneration) => {
    await nextTick()
    if (generation !== loadGeneration) return
    syncingSelection.value = true
    try {
      if (props.mode === 'table') {
        tableRef.value?.elTableRef?.clearSelection()
        if (props.multiple) {
          tableRows.value.forEach((row) => {
            if (draftKeys.value.includes(getRowKey(row))) {
              tableRef.value?.elTableRef?.toggleRowSelection(row, true)
            }
          })
        } else if (draftRows.value[0]) {
          tableRef.value?.elTableRef?.setCurrentRow(draftRows.value[0])
        } else {
          tableRef.value?.elTableRef?.setCurrentRow(null)
        }
        await nextTick()
        return
      }

      if (props.multiple) {
        treeRef.value?.setCheckedKeys?.(draftKeys.value, false)
      } else {
        treeRef.value?.setCurrentKey?.(currentSingleKey.value)
      }
      await nextTick()
    } finally {
      syncingSelection.value = false
    }
  }

  const extractListFromResult = (result: unknown): DataSelectRecord[] => {
    if (Array.isArray(result)) return result
    const fieldValue = props.resultField ? get(result, props.resultField) : result
    if (Array.isArray(fieldValue)) return fieldValue
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>
      if (Array.isArray(record.list)) return record.list as DataSelectRecord[]
      if (Array.isArray(record.records)) return record.records as DataSelectRecord[]
    }
    return []
  }

  const extractTotalFromResult = (result: unknown, list: DataSelectRecord[]): number => {
    const totalValue = props.totalField ? get(result, props.totalField) : result
    if (typeof totalValue === 'number') return totalValue
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>
      if (typeof record.total === 'number') return record.total
      if (typeof record.count === 'number') return record.count
    }
    return list.length
  }

  const localFilterRows = () => {
    const allRows = props.data
    if (props.mode === 'tree') {
      tableRows.value = normalizeTreeRows(allRows)
      total.value = flattenRows(allRows).length
      return
    }

    const query = keyword.value.trim().toLowerCase()
    const filteredRows = flattenRows(allRows).filter((row) => {
      const matchesKeyword =
        !query ||
        normalizedColumns.value.some((column) =>
          String(get(row, column.prop) ?? '')
            .toLowerCase()
            .includes(query)
        ) ||
        getRowLabel(row).toLowerCase().includes(query)
      const matchesFilter =
        filterValue.value === undefined ||
        filterValue.value === '' ||
        get(row, normalizedFilterKey.value) === filterValue.value
      return matchesKeyword && matchesFilter
    })
    total.value = filteredRows.length
    const start = (page.value - 1) * innerPageSize.value
    tableRows.value = props.showPagination
      ? filteredRows.slice(start, start + innerPageSize.value)
      : filteredRows
  }

  const loadData = async () => {
    const generation = ++loadGeneration
    requestLoading.value = true
    loadError.value = null
    try {
      if (props.apiFn) {
        const result = await props.apiFn({
          keyword: keyword.value,
          page: page.value,
          pageSize: innerPageSize.value,
          filters: {
            [normalizedFilterKey.value]: filterValue.value,
            ...(props.navigation
              ? {
                  [props.navigation.filterKey ?? 'navigationId']:
                    selectedNavigationKey.value || undefined
                }
              : {})
          }
        })
        if (generation !== loadGeneration) return
        if (!Array.isArray(result) && result.error) throw result.error
        const list = extractListFromResult(result)
        tableRows.value = props.mode === 'tree' ? normalizeTreeRows(list) : list
        total.value = extractTotalFromResult(result, list)
      } else {
        localFilterRows()
      }
      syncConfirmedFromProps()
      await applyDraftToControls(generation)
      if (generation !== loadGeneration) return
      if (props.mode === 'tree') {
        treeRef.value?.filter?.(keyword.value)
      }
    } catch (cause) {
      if (generation !== loadGeneration) return
      tableRows.value = []
      total.value = 0
      loadError.value = new Error('请检查网络连接后重新加载，已选内容会保留。', { cause })
      emit('load-error', cause)
    } finally {
      if (generation === loadGeneration) requestLoading.value = false
    }
  }

  const handleSearch = () => {
    page.value = 1
    void loadData()
  }

  const selectNavigation = (row?: DataSelectRecord) => {
    selectedNavigationKey.value = row ? getNavigationKey(row) : undefined
    navigationTreeRef.value?.setCurrentKey?.(selectedNavigationKey.value)
    handleSearch()
  }

  const open = async () => {
    if (props.disabled || isOpen.value) return
    isOpen.value = true
    draftRows.value = props.resetDraftOnOpen ? [] : confirmedRows.value.map((row) => ({ ...row }))
    emit('open')
    const dialogWidth =
      props.dialogWidth ?? (props.navigation && shouldShowSelectedPanel.value ? 1440 : 'xl')
    const usesSizePreset =
      typeof dialogWidth === 'string' && dialogSizePresets.includes(dialogWidth as ArtDialogSize)
    await dialogRef.value?.handleOpen(undefined, {
      title: props.title,
      ...(usesSizePreset ? { size: dialogWidth as ArtDialogSize } : { width: dialogWidth }),
      fullscreen: props.fullscreen,
      showFooter: true,
      confirmDisabled: true,
      dialogProps,
      onOpen: loadData,
      onConfirm: confirm
    })
  }

  const close = () => {
    invalidateLoad()
    void dialogRef.value?.handleClose(true)
  }

  const invalidateLoad = () => {
    ++loadGeneration
    isOpen.value = false
    requestLoading.value = false
  }

  onBeforeUnmount(invalidateLoad)

  const reload = async () => {
    await loadData()
  }

  const handleDialogOpened = () => {
    void applyDraftToControls()
  }

  const handleDialogClosed = () => {
    // The close icon can complete without the early `close` callback reaching this wrapper.
    // Always release the shared open guard after the dialog has fully closed.
    invalidateLoad()
    keyword.value = ''
    filterValue.value = undefined
    navigationKeyword.value = ''
    selectedNavigationKey.value = undefined
    page.value = 1
    emit('close')
  }

  const updateConfirmed = (
    rows: DataSelectRecord[],
    eventName: 'change' | 'confirm' = 'change'
  ) => {
    confirmedRows.value = uniqueRows(rows)
    const nextValue = getModelValueFromRows(confirmedRows.value)
    emit('update:modelValue', nextValue)
    const selectedRows = confirmedRows.value.flatMap((row) => {
      const source = getSourceRow(row)
      return source ? [source] : []
    })
    emit('update:selectedData', selectedRows)
    emit('change', nextValue, selectedRows)
    if (eventName === 'confirm') {
      emit('confirm', nextValue, selectedRows)
    }
  }

  const confirm = () => {
    if (loading.value || loadError.value) return false
    updateConfirmed(draftRows.value, 'confirm')
    return true
  }

  const clear = () => {
    updateConfirmed([])
    draftRows.value = []
    emit('clear')
  }

  const clearDraft = () => {
    draftRows.value = []
    void applyDraftToControls()
  }

  const removeDraft = (row: DataSelectRecord) => {
    const key = getRowKey(row)
    draftRows.value = draftRows.value.filter((item) => getRowKey(item) !== key)
    void applyDraftToControls()
  }

  const removeConfirmed = (row: DataSelectRecord) => {
    const key = getRowKey(row)
    updateConfirmed(confirmedRows.value.filter((item) => getRowKey(item) !== key))
  }

  const handleRemoveDisplayTag = (_value: string, index: number) => {
    const row = displayRows.value[index]
    if (row) removeConfirmed(row)
  }

  const setSingle = (row: DataSelectRecord) => {
    if (loading.value || loadError.value || isRowDisabled(row)) return
    draftRows.value = [row]
    void applyDraftToControls()
  }

  const toggleDraftRow = (row: DataSelectRecord) => {
    if (loading.value || loadError.value || isRowDisabled(row)) return
    const key = getRowKey(row)
    if (props.multiple) {
      if (draftKeys.value.includes(key)) {
        draftRows.value = draftRows.value.filter((item) => getRowKey(item) !== key)
      } else {
        draftRows.value = uniqueRows([...draftRows.value, row])
      }
      void applyDraftToControls()
      return
    }
    setSingle(row)
  }

  const handleTableRowClick = (row: DataSelectRecord, _column: unknown, event: MouseEvent) => {
    if ((event.target as HTMLElement | null)?.closest('.el-checkbox')) return
    toggleDraftRow(row)
  }

  const handleTableSelectionChange = (rows: DataSelectRecord[]) => {
    if (!props.multiple || syncingSelection.value || loading.value || loadError.value) return
    const pageKeys = tableRows.value.map((row) => getRowKey(row))
    const persistedRows = draftRows.value.filter((row) => !pageKeys.includes(getRowKey(row)))
    draftRows.value = uniqueRows([...persistedRows, ...rows])
  }

  const handleTreeCheck = () => {
    if (!props.multiple || syncingSelection.value || loading.value || loadError.value) return
    const checkedRows = (treeRef.value?.getCheckedNodes?.(false, false) ?? []) as DataSelectRecord[]
    draftRows.value = uniqueRows(checkedRows)
  }

  const handleTreeNodeClick = (row: DataSelectRecord) => {
    if (props.multiple) return
    setSingle(row)
  }

  const filterTreeNode = (value: string, data: DataSelectRecord) => {
    if (!value) return true
    const normalizedValue = value.toLowerCase()
    return (
      getRowLabel(data).toLowerCase().includes(normalizedValue) ||
      getRowDescription(data).toLowerCase().includes(normalizedValue)
    )
  }

  watch(
    [loading, loadError],
    () => dialogRef.value?.setOptions({ confirmDisabled: loading.value || !!loadError.value }),
    { flush: 'sync' }
  )

  watch(
    () => props.apiFn,
    () => {
      ++loadGeneration
      // The dialog can remain visible while its tenant/source-specific loader changes.
      if (isOpen.value) handleSearch()
      else requestLoading.value = false
    }
  )

  watch(
    () => [props.modelValue, props.selectedData, props.data, props.resolveSelected],
    () => {
      void resolveSelectedReferences()
    },
    { deep: true, immediate: true }
  )

  watch(
    () => props.pageSize,
    (value) => {
      innerPageSize.value = value
    }
  )

  watch(
    () => keyword.value,
    (value) => {
      if (props.mode === 'tree') {
        treeRef.value?.filter?.(value)
      }
    }
  )

  watch(navigationKeyword, (value) => navigationTreeRef.value?.filter?.(value))

  defineExpose<ArtDataSelectExpose>({
    open,
    close,
    clear,
    reload
  })
</script>

<style scoped lang="scss">
  :global(.art-dialog.art-data-select-dialog) {
    --art-dialog-content-padding: var(--art-space-4) var(--art-space-5);
  }

  .art-data-select {
    width: 100%;
  }

  .art-data-select__single-input {
    cursor: pointer;

    :deep(.el-input__wrapper),
    :deep(.el-input__inner) {
      cursor: pointer;
    }
  }

  .art-data-select__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    background: transparent;
    border: 0;
  }

  .art-data-select__single-arrow {
    color: var(--el-text-color-placeholder);
  }

  .art-data-select__multiple-input {
    cursor: pointer;

    :deep(.el-input-tag__wrapper),
    :deep(.el-input-tag__inner),
    :deep(.el-input-tag__input) {
      cursor: pointer;
    }
  }

  .art-data-select__multiple-arrow {
    color: var(--el-text-color-placeholder);
  }

  .art-data-select-dialog__body {
    display: flex;
    flex-direction: column;
    height: min(548px, calc(100dvh - 260px));
    min-height: 0;
  }

  .art-data-select-dialog__search {
    display: grid;
    flex: none;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &.has-filter {
      grid-template-columns: minmax(220px, 1fr) 260px;
    }

    :deep(.el-input__wrapper),
    :deep(.el-select__wrapper) {
      min-height: 36px;
      background: var(--art-gray-100);
      box-shadow: none;

      &:focus-within {
        box-shadow: 0 0 0 1px var(--theme-color) inset;
      }
    }
  }

  .art-data-select-dialog__layout {
    display: flex;
    flex: 1;
    gap: 0;
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
    background: var(--default-box-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--art-surface-radius, calc(var(--el-border-radius-base) + 2px));
  }

  .art-data-select-dialog__main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--default-box-color);
  }

  .art-data-select-dialog__navigation {
    display: flex;
    flex: 0 0 clamp(180px, 15vw, 240px);
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: color-mix(in srgb, var(--art-gray-100) 44%, var(--default-box-color));
    border-right: 1px solid var(--el-border-color-lighter);
  }

  .art-data-select-dialog__navigation-header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    min-height: 54px;
    padding: 0 16px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    background: var(--art-gray-100);
    border-bottom: 1px solid var(--el-border-color-lighter);

    small {
      font-size: 12px;
      font-weight: 400;
      color: var(--el-text-color-secondary);
    }
  }

  .art-data-select-dialog__navigation-search {
    flex: none;
    padding: 12px;

    :deep(.el-input__wrapper) {
      min-height: 36px;
      background: var(--default-box-color);
      box-shadow: 0 0 0 1px var(--el-border-color-lighter) inset;
    }
  }

  .art-data-select-dialog__navigation-all {
    display: flex;
    flex: none;
    gap: 9px;
    align-items: center;
    width: calc(100% - 16px);
    min-height: 48px;
    padding: 7px 10px;
    margin: 0 8px 4px;
    color: var(--el-text-color-primary);
    text-align: left;
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--el-border-radius-base);

    &:hover,
    &:focus-visible,
    &.is-current {
      background: var(--art-gray-100);
    }

    &.is-current {
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    > .art-svg-icon:last-child {
      flex: none;
      margin-left: auto;
      color: var(--theme-color);
    }
  }

  .art-data-select-dialog__navigation-scrollbar {
    flex: 1;
    height: 0;
    min-height: 0;
    padding: 0 8px 10px;

    :deep(.el-tree) {
      background: transparent;
    }

    :deep(.el-tree-node__content) {
      height: auto;
      min-height: 48px;
      padding-right: 8px;
      margin: 1px 0;
      border-radius: var(--el-border-radius-base);
    }

    :deep(.el-tree-node__content:hover),
    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      background: var(--art-gray-100);
    }

    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      box-shadow: inset 3px 0 0 var(--theme-color);
    }
  }

  .art-data-select-dialog__navigation-node {
    display: flex;
    flex: 1;
    gap: 9px;
    align-items: center;
    min-width: 0;
  }

  .art-data-select-dialog__navigation-icon {
    display: inline-flex;
    flex: 0 0 28px;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
    border-radius: var(--el-border-radius-base);
  }

  .art-data-select-dialog__navigation-copy {
    display: grid;
    flex: 1;
    min-width: 0;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 13px;
      font-weight: 600;
      line-height: 19px;
    }

    small {
      font-size: 11px;
      line-height: 16px;
      color: var(--el-text-color-secondary);
    }
  }

  .art-data-select-dialog__content {
    position: relative;
    flex: 1;
    height: 0;
    min-height: 0;

    &.is-tree {
      padding: 10px 8px 12px;
    }

    :deep(.el-table) {
      --el-table-header-bg-color: var(--art-gray-100);
      --el-table-header-text-color: var(--el-text-color-regular);
      --el-table-text-color: var(--el-text-color-primary);
      --el-table-row-hover-bg-color: var(--art-gray-100);
      --el-table-current-row-bg-color: color-mix(
        in srgb,
        var(--theme-color) 7%,
        var(--default-box-color)
      );

      font-size: 15px;
    }

    // ArtTable 的默认上边距会让等高表格越过内容区，遮住分页栏上沿。
    :deep(.art-table > .el-table) {
      margin-top: 0;
    }

    :deep(.el-table th.el-table__cell) {
      height: 54px;
      font-size: 15px;
      font-weight: 600;
    }

    :deep(.el-table td.el-table__cell) {
      height: 56px;
    }

    :deep(.el-table__row.is-selected-row td.el-table__cell) {
      background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
    }

    :deep(.el-table__row:hover > td.el-table__cell) {
      background: var(--art-gray-100);
    }

    :deep(.art-data-select-dialog__selection-cell .cell) {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    :deep(.art-data-select-dialog__selection-cell .el-checkbox) {
      height: auto;
      margin: 0;
    }
  }

  .art-data-select-dialog__tree-scrollbar {
    height: 100%;
  }

  .art-data-select-dialog__tree {
    color: var(--el-text-color-primary);

    --el-tree-node-hover-bg-color: transparent;

    :deep(.el-tree-node__content) {
      height: auto;
      min-height: 46px;
      padding: 3px 10px 3px 0;
      margin: 1px 0;
      border-radius: var(--el-border-radius-base);
      transition:
        background-color 0.16s ease,
        box-shadow 0.16s ease;
    }

    :deep(.el-tree-node__content:hover),
    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      background: var(--art-gray-100);
    }

    :deep(.el-tree-node:has(> .el-tree-node__content .is-selected) > .el-tree-node__content) {
      background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    :deep(.el-checkbox) {
      height: auto;
      margin-right: 8px;
    }

    :deep(.el-tree-node__expand-icon) {
      color: var(--el-text-color-secondary);
    }
  }

  .art-data-select-dialog__tree-node {
    display: flex;
    flex: 1;
    gap: 9px;
    align-items: center;
    min-width: 0;
    font-size: 14px;
    line-height: 20px;

    &.is-disabled {
      color: var(--el-disabled-text-color);
      cursor: not-allowed;
    }

    &.is-grouping {
      font-weight: 600;
      color: var(--el-text-color-primary);
    }
  }

  .art-data-select-dialog__tree-icon {
    display: inline-flex;
    flex: 0 0 28px;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--el-text-color-secondary);
    background: var(--art-gray-100);
    border-radius: var(--el-border-radius-base);
  }

  .art-data-select-dialog__tree-node.is-grouping .art-data-select-dialog__tree-icon {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
  }

  .art-data-select-dialog__tree-node.is-selected .art-data-select-dialog__tree-icon {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 12%, var(--default-box-color));
  }

  .art-data-select-dialog__tree-copy {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .art-data-select-dialog__tree-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .art-data-select-dialog__tree-copy small {
    min-width: 0;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    font-weight: 400;
    line-height: 16px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }

  .art-data-select-dialog__tree-check {
    flex: none;
    margin-left: auto;
    font-size: 20px;
    color: var(--el-text-color-secondary);
  }

  .art-data-select-dialog__pager {
    display: flex;
    flex: none;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 62px;
    padding: 10px 12px;
    color: var(--el-text-color-secondary);
    background: var(--art-gray-100);
    border-top: 1px solid var(--el-border-color-lighter);

    > span {
      flex: none;
      white-space: nowrap;
    }

    :deep(.el-pagination) {
      flex: none;
      flex-wrap: nowrap;
      gap: 8px;
      justify-content: flex-end;
      max-width: 100%;
      margin-left: auto;
    }
  }

  .art-data-select-dialog__selected {
    display: flex;
    flex: none;
    flex-direction: column;
    width: clamp(220px, 18vw, 300px);
    min-height: 0;
    overflow: hidden;
    background: color-mix(in srgb, var(--art-gray-100) 68%, var(--default-box-color));
    border-left: 1px solid var(--el-border-color-lighter);
  }

  .art-data-select-dialog__selected-header {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    min-height: 54px;
    padding: 0 14px 0 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    background: var(--art-gray-100);
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .art-data-select-dialog__selected-scrollbar {
    flex: 1;
    height: 0;
    min-height: 0;

    :deep(.el-scrollbar__view) {
      min-height: 100%;
    }
  }

  .art-data-select-dialog__selected-item {
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 56px;
    padding: 9px 12px 9px 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    transition: background-color 0.2s ease;

    &:hover {
      background: var(--art-gray-100);
    }
  }

  .art-data-select-dialog__selected-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    font-size: 16px;
    color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    border-radius: var(--el-border-radius-base);
  }

  .art-data-select-dialog__selected-text {
    flex: 1;
    min-width: 0;

    strong,
    span {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 15px;
      font-weight: 600;
      line-height: 22px;
      color: var(--el-text-color-primary);
    }

    span {
      margin-top: 4px;
      font-size: 13px;
      line-height: 18px;
      color: var(--el-text-color-secondary);
    }
  }

  .art-data-select-dialog__selected-remove {
    flex: none;
    width: 32px;
    height: 32px !important;
    padding: 0;
    font-size: 18px;
    color: var(--el-text-color-secondary);
    border-radius: var(--el-border-radius-base);

    &:hover,
    &:focus-visible {
      color: var(--el-text-color-primary);
      background: var(--el-fill-color-light);
    }
  }

  @media (width <= 960px) {
    .art-data-select-dialog__search {
      &.has-filter {
        grid-template-columns: 1fr;
      }
    }

    .art-data-select-dialog__layout {
      flex-direction: column;
      overflow-y: auto;
    }

    .art-data-select-dialog__main {
      flex: 0 0 320px;
      min-height: 320px;

      &.is-empty {
        flex-basis: auto;

        .art-data-select-dialog__content {
          flex: none;
          height: auto;
          min-height: 260px;
        }
      }

      &.has-error {
        flex-basis: 420px;
        min-height: 420px;
      }
    }

    .art-data-select-dialog__navigation {
      flex: 0 0 auto;
      width: auto;
      max-height: 190px;
      border-right: 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    .art-data-select-dialog__navigation-header {
      min-height: 44px;
    }

    .art-data-select-dialog__navigation-search {
      padding: 8px 12px;
    }

    .art-data-select-dialog__navigation-scrollbar {
      :deep(.art-empty-state__visual) {
        display: none;
      }
    }

    .art-data-select-dialog__selected {
      flex: 0 0 30%;
      width: auto;
      max-height: 160px;
      border-top: 1px solid var(--el-border-color-lighter);
      border-left: 0;

      &.is-empty {
        flex: none;
        max-height: none;

        .art-data-select-dialog__selected-scrollbar {
          flex: none;
          height: auto;
        }
      }
    }

    .art-data-select-dialog__pager {
      gap: 8px;
      padding: 8px 12px;
    }
  }

  @media (width <= 480px) {
    .art-data-select-dialog__pager {
      flex-wrap: wrap;
    }
  }
</style>
