<template>
  <div class="result-table-container flex h-full min-h-0 flex-col" @keydown="handleDraftKeydown">
    <div
      class="sql-result-tools flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-g-200 px-3 py-2"
    >
      <span class="min-w-0 text-xs text-g-700" role="status">{{
        editMode
          ? `编辑副本 · 已修改 ${records.changes.length} 行 / ${changeCount} 处`
          : `本次已加载 ${data.length} 行 · 显示 ${visibleColumnCount}/${availableColumnCount} 列${desiredPins.length ? ` · 固定 ${pinLayout.appliedPins.size} 列` : ''}${activeSearch || effectiveValueFilters.length ? ` · 匹配 ${filteredRows.length} 行（导出全部已加载行）` : ''}`
      }}</span>
      <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <div
          v-if="!editMode && sortSelection && sortResult"
          class="flex min-w-0 max-w-full items-center gap-1"
          role="status"
        >
          <ElPopover
            v-model:visible="sortDetailsOpen"
            width="min(360px, calc(100vw - 24px))"
            trigger="click"
            placement="bottom"
            :show-arrow="false"
            :popper-options="{
              modifiers: [
                { name: 'preventOverflow', options: { altAxis: true, tether: false, padding: 8 } }
              ]
            }"
          >
            <template #reference>
              <ElButton
                ref="sortSummaryRef"
                size="small"
                class="min-w-0 max-w-56"
                :disabled="loading"
                aria-label="本地排序说明"
                :title="`${sortSelection.field} · ${sortSelection.order === 'ascending' ? '升序' : '降序'} · 仅已加载结果`"
                @keydown.esc.prevent.stop="closeSortDetails"
              >
                <span class="flex min-w-0 items-center gap-1">
                  <span class="shrink-0">本地排序</span>
                  <span class="min-w-0 max-w-16 truncate" :title="sortSelection.field">{{
                    sortSelection.field
                  }}</span>
                  <span class="shrink-0"
                    >· {{ sortSelection.order === 'ascending' ? '升序' : '降序' }}</span
                  >
                  <span class="shrink-0"
                    >· 置后 {{ sortResult.nullCount + sortResult.excludedCount }}</span
                  >
                </span>
              </ElButton>
            </template>
            <section
              aria-label="本地排序说明"
              class="flex min-w-0 flex-col gap-3"
              @keydown.esc.prevent.stop="closeSortDetails"
            >
              <div class="flex items-center justify-between gap-2">
                <strong class="text-sm text-g-900">本地排序说明</strong>
                <ArtIconButton
                  size="small"
                  icon="ri:close-line"
                  label="关闭排序说明"
                  @click="closeSortDetails"
                />
              </div>
              <ElScrollbar max-height="min(320px, 50vh)">
                <div class="flex min-w-0 flex-col gap-3 pr-1 text-xs leading-5 text-g-700">
                  <p class="m-0 break-all font-medium"
                    >{{ sortSelection.field }} ·
                    {{ sortSelection.order === 'ascending' ? '升序' : '降序' }}</p
                  >
                  <p class="m-0">仅对本次已加载结果排序，不重跑 SQL；先筛选，再排序与分页。</p>
                  <dl class="m-0 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                    <dt>NULL/缺失</dt
                    ><dd class="m-0 tabular-nums">{{ sortResult.nullCount }} 行</dd>
                    <dt>未参与比较</dt
                    ><dd class="m-0 tabular-nums">{{ sortResult.excludedCount }} 行</dd>
                  </dl>
                  <p class="m-0">这些值统一置后；相同值和置后值均保留原相对顺序。</p>
                  <p v-if="sortResult.message" class="m-0">{{ sortResult.message }}</p>
                  <p v-if="['date', 'datetime', 'time'].includes(sortResult.kind)" class="m-0"
                    >时间按 ISO 格式比较，支持公元 0100–9999 年、最多 9 位小数秒及 ±14:00
                    内的明确偏移；不猜测时区或日期。</p
                  >
                </div>
              </ElScrollbar>
            </section>
          </ElPopover>
          <ArtIconButton
            size="small"
            icon="ri:arrow-go-back-line"
            label="恢复查询顺序"
            :disabled="loading"
            @click="clearResultSort"
          />
        </div>
        <ArtTableHeader
          v-if="!editMode && !loading && availableColumnCount && !hasDuplicateColumns"
          v-model:columns="columnChecks"
          layout="columns"
          action-size="small"
          class="sql-result-column-tools"
        />
        <ArtIconButton
          v-else-if="!editMode && availableColumnCount"
          size="small"
          icon="ri:align-right"
          label="设置显示列"
          disabled
        />
        <ArtIconButton
          v-if="!editMode && availableColumnCount"
          size="small"
          icon="ri:restart-line"
          label="重置列视图"
          :disabled="loading || hasDuplicateColumns"
          @click="resetResultColumnView"
        />
        <ResultColumnPins
          v-if="!editMode && availableColumnCount && !hasDuplicateColumns"
          :columns="pinColumns"
          :all-columns="allPinColumns"
          :pins="desiredPins"
          :applied="pinLayout.appliedPins"
          :suspended-count="visibleSuspendedPinCount"
          :ready="pinsReady"
          :viewport-width="pinRawLayout.viewportWidth"
          :disabled="loading"
          @change="applyColumnPin"
          @clear="clearPins"
        />
        <ElButton
          v-if="!editMode"
          size="small"
          :disabled="loading || !data.length"
          :loading="profileLoading"
          @click="openProfile"
          ><ArtSvgIcon icon="ri:equalizer-line" />字段统计</ElButton
        >
        <ElButton
          v-if="!editMode"
          size="small"
          :disabled="loading || !data.length"
          :loading="chartLoading"
          @click="openChart"
          ><ArtSvgIcon icon="ri:bar-chart-line" />结果图表</ElButton
        >
        <ResultCopyControls
          :rows="sortedRows"
          :columns="copyColumns"
          :owner="copyOwner"
          :disabled="Boolean(copyDisabledReason)"
          :disabled-reason="copyDisabledReason"
          :truncated="truncated"
        />
        <ElInput
          v-if="!editMode"
          ref="resultSearchRef"
          v-model="resultSearch"
          class="w-52! max-w-full"
          size="small"
          placeholder="筛选本次已加载结果"
          aria-label="搜索已加载结果"
          clearable
          :disabled="loading || !data.length"
          @keydown.esc.stop="resultSearch = ''"
        >
          <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
        </ElInput>
        <template v-if="editMode">
          <ElCheckbox v-model="onlyChanged" size="small">仅看修改</ElCheckbox>
          <ArtIconButton
            size="small"
            icon="ri:arrow-go-back-line"
            label="撤销结果修改"
            :disabled="!canUndo"
            @click="tableRef?.undo()"
          />
          <ArtIconButton
            size="small"
            icon="ri:arrow-go-forward-line"
            label="重做结果修改"
            :disabled="!canRedo"
            @click="tableRef?.redo()"
          />
          <ElButton size="small" :disabled="!changeCount" @click="validateDraft(true)"
            ><ArtSvgIcon icon="ri:checkbox-circle-line" />校验</ElButton
          >
          <ElButton size="small" type="primary" :disabled="!changeCount" @click="reviewChanges"
            ><ArtSvgIcon icon="ri:git-pull-request-line" />变更预览</ElButton
          >
          <ArtIconButton
            size="small"
            icon="ri:restart-line"
            label="还原全部结果修改"
            :disabled="!changeCount"
            @click="resetDraft"
          />
          <ElButton size="small" @click="exitEditing">退出编辑</ElButton>
        </template>
        <ElButton
          v-else
          size="small"
          :loading="analyzing"
          :disabled="loading || !data.length"
          @click="startEditing"
          ><ArtSvgIcon icon="ri:edit-line" />编辑副本</ElButton
        >
      </div>
    </div>
    <ResultValueFilters
      v-if="!editMode"
      :filters="effectiveValueFilters"
      :disabled="loading"
      @view="viewValueFilter"
      @remove="removeValueFilter"
      @clear="clearValueFilters"
    />
    <div
      v-if="!editMode && !loading && visibleSuspendedPinCount"
      class="shrink-0 border-b border-g-200 bg-g-100 px-3 py-2 text-xs leading-5 text-g-700"
      role="status"
    >
      {{ pinSuspensionMessage }}
    </div>
    <div
      v-if="!editMode && hasDuplicateColumns"
      class="shrink-0 border-b border-g-200 bg-g-100 px-3 py-2 text-xs leading-5 text-g-700"
      role="status"
    >
      结果包含重名字段，列设置暂不可用。请在 SELECT 中使用 AS 指定唯一字段名。
    </div>
    <div
      v-if="editMode"
      class="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-g-100 px-3 py-1.5 text-xs leading-5 text-g-700"
    >
      <span
        >按原始查询顺序显示。双击或 F2 打开类型编辑器 · Enter / Ctrl+Enter 保留 · Esc
        取消。编辑副本显示完整获准字段，已识别的主键与租户字段锁定；修改仅在本地。</span
      >
      <span v-if="validationMessage" class="text-danger" role="alert">{{ validationMessage }}</span>
      <span v-else-if="validationPassed" class="text-success" role="status"
        >基础校验通过，业务约束仍需在目标数据库确认</span
      >
    </div>
    <div class="min-h-0 flex-1">
      <ArtEmptyState
        v-if="noDisplayableColumns"
        title="当前没有可显示字段"
        description="当前结果的字段不在可展示范围内。请调整查询，或联系接口维护者返回可展示的业务字段。"
        class="h-full"
      />
      <ArtEmptyState
        v-else-if="allColumnsHidden"
        title="所有结果列已隐藏"
        description="当前结果仍保留，可通过列设置选择字段，或恢复全部结果列。统计、图表和导出仍使用全部已加载原始结果。"
        class="h-full"
      >
        <ElButton type="primary" :disabled="loading" @click="restoreResultColumns"
          >显示全部结果列</ElButton
        >
      </ArtEmptyState>
      <ArtTable
        v-else
        :key="columnViewRevision"
        ref="tableRef"
        table-layout="fixed"
        :loading="loading"
        :data="tableData"
        :row-key="resultRowKey"
        client-pagination
        scrollbar-always-on
        :virtual-scroll="resultVirtualScroll"
        :pagination="{
          current: currentPage,
          size: pageSize,
          total: onlyChanged ? records.updateRecords.length : tableData.length
        }"
        :pagination-options="{ pageSizes: [20, 50, 100, 200] }"
        :columns="tableColumns"
        :edit-config="
          editMode
            ? { enabled: true, trigger: 'dblclick', mode: 'cell', editor: 'external', onlyChanged }
            : undefined
        "
        :keep-source="editMode"
        :edit-rules="editMode ? editRules : undefined"
        :empty-text="
          onlyChanged
            ? '当前副本没有字段修改'
            : effectiveValueFilters.length
              ? '未找到匹配结果，请调整搜索或移除原值筛选条件'
              : activeSearch
                ? '未找到匹配结果，请更换关键字或清空搜索'
                : '暂无数据'
        "
        :cell-class-name="cellClassName"
        :show-table-header="false"
        border
        class="h-full"
        @cell-click="handleCellClick"
        @cell-contextmenu="handleCellContextMenu"
        @header-contextmenu="handleHeaderContextMenu"
        @column-layout="handleColumnLayout"
        @sort-change="handleResultSortChange"
        @edit-change="handleEditChange"
        @edit-activated="openCellEditor"
        @pagination:current-change="currentPage = $event"
        @pagination:size-change="changePageSize"
      />
    </div>

    <!-- Context Menu -->
    <ArtMenuRight
      ref="menuRef"
      :menu-items="menuItems"
      :menu-width="valueFilterReason ? Math.min(320, menuViewportWidth - 16) : 180"
      :submenu-width="140"
      scrollable
      @select="handleMenuSelect"
      @hide="pinMenuField = null"
    />

    <!-- Cell Content Drawer -->
    <CellContentView ref="cellContentViewRef" />
    <component
      v-if="profileComponent"
      :is="profileComponent"
      ref="profileRef"
      :rows="data"
      :columns="columns"
      :truncated="truncated"
    />
    <component
      v-if="chartComponent"
      :is="chartComponent"
      ref="chartRef"
      :rows="data"
      :columns="columns"
      :truncated="truncated"
    />
    <SqlCellEditor
      ref="cellEditorRef"
      :column="activeColumn"
      @save="saveCell"
      @cancel="tableRef?.clearEdit()"
    />
    <ResultChangeDrawer
      ref="changesRef"
      :source="editSource"
      :records="records"
      :sql="generated.sql"
      :reason="generated.reason"
      :validation-message="validationMessage"
      @locate="(row, field) => tableRef?.setEditCell(row, field)"
      @revert="(row, field) => tableRef?.revertData(row, field)"
    />
  </div>
</template>

<script setup lang="ts">
  import {
    ref,
    shallowRef,
    computed,
    nextTick,
    h,
    watch,
    watchEffect,
    onBeforeUnmount,
    withDirectives,
    type ObjectDirective
  } from 'vue'
  import { useEventListener, useWindowSize } from '@vueuse/core'
  import { ElMessage, type InputInstance } from 'element-plus'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { getOwnRecordValue } from '@/utils/record'
  import { isObject, isEqual, sortBy, uniqBy } from 'lodash-es'
  import { storeToRefs } from 'pinia'
  import { useTableStore } from '@/store/modules/table'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { useTableColumns } from '@/hooks/core/useTableColumns'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'
  import { TableSizeEnum } from '@/enums/form-enum'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtTableHeader from '@/components/core/tables/art-table-header/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtMenuRight, { MenuItemType } from '@/components/core/others/art-menu-right/index.vue'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import type {
    ColumnOption,
    TableEditRecordset,
    TableEditRules,
    TableEditContext,
    TableColumnValidationContext
  } from '@/types'
  import type { SqlDialect } from '@/types/sql-connections'
  import type { SqlColumnRef, SqlMetadataRef } from '@/utils/sql-workbench'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ResultChangeDrawer from './result-change-drawer.vue'
  import ResultColumnPins from './result-column-pins.vue'
  import ResultCopyControls from './result-copy-controls.vue'
  import ResultValueFilters from './result-value-filters.vue'
  import {
    areSqlResultValueFiltersEqual,
    filterSqlResultValueRows,
    readSqlResultFilterValue,
    type SqlResultValueFilter
  } from './result-value-filter'
  import { useSqlColumnPins } from './use-sql-column-pins'
  import { useSqlResultSort } from './use-sql-result-sort'
  import { getSqlResultSortKind } from './result-sort'
  import type { SqlColumnPinSide } from './result-column-pins'
  import type ResultChart from './result-chart.vue'
  import type ResultProfile from './result-profile.vue'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import { createSqlResultSnapshot, SqlResultCompareError } from './result-compare'
  import SqlCellEditor from './sql-cell-editor.vue'
  import {
    resolveSqlEditSource,
    sqlDraftColumn,
    validateSqlDraftValue,
    isSqlDraftJson,
    prepareSqlDraftRows,
    containsUnsafeSqlNumber,
    buildSqlDraftUpdate,
    type SqlEditSource
  } from './result-edit'

  type SqlResultRow = Record<string, unknown>

  interface SqlMetadataColumn {
    name: string
    property?: string
    type?: string | null
    fullType?: string | null
    nullable?: boolean | null
    enumValues?: string[]
  }

  interface TableCellColumn {
    property: string
  }

  interface MenuExpose {
    show: (event: MouseEvent) => void
    hide: () => void
  }

  interface Props {
    loading?: boolean
    data?: SqlResultRow[]
    columns?: SqlMetadataColumn[]
    query?: string
    metadata?: SqlMetadataRef | null
    ensureMetadata?: () => Promise<void>
    dialect?: SqlDialect
    defaultSchema?: string
    truncated?: boolean
    owner?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    loading: false,
    data: () => [],
    columns: () => [],
    query: '',
    dialect: 'postgres',
    defaultSchema: '',
    owner: ''
  })
  const emit = defineEmits<{ 'draft-state': [dirty: boolean] }>()
  const tableRef = ref<ArtTableExpose>()
  const sortDetailsOpen = ref(false)
  const sortSummaryRef = shallowRef<{ $el?: unknown }>()
  const closeSortDetails = (): void => {
    sortDetailsOpen.value = false
    void nextTick(() => {
      const button = sortSummaryRef.value?.$el
      if (button instanceof HTMLButtonElement && !button.disabled) button.focus()
    })
  }
  const tenant = useTenantScopeStore()
  const user = useUserStore()
  const { isPlatformScope } = storeToRefs(tenant)
  const rowKeys = new WeakMap<object, string>()
  let rowKeySequence = 0
  const resultRowKey = (row: SqlResultRow): string => {
    const known = rowKeys.get(row)
    if (known) return known
    const key = `sql-result-row-${++rowKeySequence}`
    rowKeys.set(row, key)
    return key
  }
  const tableSettings = useTableStore()
  // 摘要单元格为 28px，行和双行类型表头随共享表格密度一起变化。
  const resultVirtualScroll = computed(() => ({
    flatData: true,
    ...(tableSettings.tableSize === TableSizeEnum.SMALL
      ? { rowHeight: 37, headerHeight: 48 }
      : tableSettings.tableSize === TableSizeEnum.LARGE
        ? { rowHeight: 53, headerHeight: 68 }
        : { rowHeight: 45, headerHeight: 60 })
  }))
  const cellEditorRef = ref<InstanceType<typeof SqlCellEditor>>()
  const activeColumn = shallowRef<SqlColumnRef>()
  const changesRef = ref<InstanceType<typeof ResultChangeDrawer>>()
  const profileRef = ref<InstanceType<typeof ResultProfile>>()
  const profileLoading = ref(false)
  const { component: profileComponent, load: loadProfile } = useLazyComponent(
    () => import('./result-profile.vue')
  )
  const openProfile = async () => {
    if (profileLoading.value || props.loading || !props.data.length) return
    const rows = props.data
    const owner = generation
    profileLoading.value = true
    try {
      await loadProfile()
      if (owner === generation && rows === props.data && !props.loading && !editMode.value)
        await profileRef.value?.open()
    } catch {
      ElMessage.warning('字段统计组件加载失败，请重试')
    } finally {
      profileLoading.value = false
    }
  }
  const chartRef = ref<InstanceType<typeof ResultChart>>()
  const chartLoading = ref(false)
  const { component: chartComponent, load: loadChart } = useLazyComponent(
    () => import('./result-chart.vue')
  )
  const openChart = async () => {
    if (chartLoading.value || props.loading || !props.data.length) return
    const rows = props.data
    chartLoading.value = true
    try {
      await loadChart()
      if (rows === props.data) await chartRef.value?.open()
    } catch {
      ElMessage.warning('图表组件加载失败，请重试')
    } finally {
      chartLoading.value = false
    }
  }
  const editMode = ref(false)
  const hasDuplicateColumns = computed(
    () => uniqBy(props.columns, 'name').length !== props.columns.length
  )
  const onlyChanged = ref(false)
  const currentPage = ref(1)
  const pageSize = ref(50)
  const resultSearch = ref('')
  const resultSearchRef = ref<InputInstance>()
  const valueFilters = shallowRef<SqlResultValueFilter[]>([])
  const authorizedSearchColumns = computed(() =>
    filterTenantDimensionDescriptors(
      props.columns.map((column) => ({ column, prop: column.name, label: column.name })),
      isPlatformScope.value
    ).map(({ column }) => column)
  )
  const activeSearch = computed(() => resultSearch.value.trim().toLowerCase())
  // Index original values once per result; searching never formats or mutates numeric text.
  const searchableRows = computed(() =>
    props.data.map((row) => ({
      row,
      text: authorizedSearchColumns.value
        .map((column) =>
          getOwnRecordValue(row, column.name) === null ? 'NULL' : getCellContent(row, column.name)
        )
        .join('\u0000')
        .toLowerCase()
    }))
  )
  const searchRows = computed(() =>
    activeSearch.value
      ? searchableRows.value
          .filter(({ text }) => text.includes(activeSearch.value))
          .map(({ row }) => row)
      : props.data
  )
  const filteredRows = computed(() =>
    filterSqlResultValueRows(searchRows.value, effectiveValueFilters.value)
  )
  watch(activeSearch, () => {
    currentPage.value = 1
    selectedCell.value = null
  })
  const changePageSize = (size: number) => {
    pageSize.value = size
    currentPage.value = 1
  }
  watch(onlyChanged, () => {
    cellEditorRef.value?.flush()
    currentPage.value = 1
  })
  watch(currentPage, () => cellEditorRef.value?.flush())
  const analyzing = ref(false)
  const draftRows = shallowRef<SqlResultRow[]>([])
  const emptyRecords = (): TableEditRecordset => ({
    insertRecords: [],
    removeRecords: [],
    updateRecords: [],
    changes: []
  })
  const records = shallowRef<TableEditRecordset>(emptyRecords())
  const editSource = shallowRef<SqlEditSource>({ mapping: {}, keys: [], reason: '' })
  const validationMessage = ref('')
  const validationPassed = ref(false)
  const feedback = useArtFeedback()
  let generation = 0
  let pendingLeave: Promise<boolean> | undefined
  const changeCount = computed(() =>
    records.value.changes.reduce((total, change) => total + change.fields.length, 0)
  )
  const canUndo = computed(() => {
    void records.value
    return tableRef.value?.canUndo() || false
  })
  const canRedo = computed(() => {
    void records.value
    return tableRef.value?.canRedo() || false
  })
  const columnInfo = (field: string): SqlColumnRef => {
    const column = props.columns.find((column) => column.name === field)
    const exampleRow = props.data.find((row) => getOwnRecordValue(row, field) != null)
    const example = exampleRow ? getOwnRecordValue(exampleRow, field) : undefined
    const resolved = sqlDraftColumn(editSource.value, field)
    return {
      ...resolved,
      name: field,
      dataType:
        column?.fullType ||
        resolved?.dataType ||
        column?.type ||
        (typeof example === 'number'
          ? 'numeric'
          : typeof example === 'boolean'
            ? 'boolean'
            : example && typeof example === 'object'
              ? 'json'
              : 'text'),
      isNullable: column?.nullable ?? resolved?.isNullable ?? true,
      enumValues: column?.enumValues ?? resolved?.enumValues
    }
  }
  const sortMetadata = computed(
    () =>
      new Map(
        props.columns.map((column) => [
          column.name,
          column.fullType || column.type
            ? column
            : { ...column, type: columnInfo(column.name).dataType }
        ])
      )
  )
  const isProtected = (field: string) => {
    const mapped = getOwnRecordValue(editSource.value.mapping, field)
    return (
      editSource.value.keys.includes(field) ||
      field.toLowerCase() === 'tenant_id' ||
      (typeof mapped === 'string' && mapped.toLowerCase() === 'tenant_id')
    )
  }
  const editRules = computed<TableEditRules>(() =>
    Object.fromEntries(
      props.columns.map((column) => [
        column.name,
        {
          validator: ({ value, rowIndex }: TableColumnValidationContext) =>
            isEqual(value, draftRows.value[rowIndex]?.[column.name]) ||
            validateSqlDraftValue(value, columnInfo(column.name)) ||
            true
        }
      ])
    )
  )
  const generated = computed(() => {
    if (!editMode.value || !records.value.changes.length)
      return { sql: '', reason: '还没有已修改字段。' }
    void records.value
    return buildSqlDraftUpdate(
      editSource.value,
      records.value,
      tableRef.value?.getTableData() || [],
      props.dialect
    )
  })
  const startEditing = async () => {
    if (analyzing.value || props.loading || !props.data.length) return
    const owner = ++generation
    analyzing.value = true
    try {
      await props.ensureMetadata?.()
      if (owner !== generation) return
      const source = await resolveSqlEditSource({
        query: props.query,
        columns: props.columns.map((column) => column.name),
        metadata: props.metadata,
        dialect: props.dialect,
        defaultSchema: props.defaultSchema
      })
      if (owner !== generation) return
      const capture = new AbortController()
      const snapshot = await createSqlResultSnapshot(
        { rows: props.data, columns: props.columns },
        {
          signal: capture.signal,
          yieldControl: async () => {
            await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
            if (owner !== generation || props.loading) capture.abort()
          }
        }
      )
      if (owner !== generation || props.loading) return
      editSource.value = source
      if (containsUnsafeSqlNumber(snapshot.rows))
        editSource.value = {
          ...source,
          reason:
            '结果包含超出 JavaScript 安全精度的数字，请在 SELECT 中将该字段转换为文本后重新查询。'
        }
      draftRows.value = prepareSqlDraftRows(snapshot.rows, editSource.value, columnInfo)
      resultSearch.value = ''
      editMode.value = true
      onlyChanged.value = false
      records.value = emptyRecords()
      validationMessage.value = ''
      validationPassed.value = false
    } catch (cause) {
      if (owner === generation && !props.loading)
        ElMessage.warning(
          cause instanceof SqlResultCompareError
            ? cause.message
            : getFriendlySupabaseErrorMessage(cause, '结果结构加载失败，请重试编辑副本')
        )
    } finally {
      if (owner === generation) analyzing.value = false
    }
  }
  const handleEditChange = (value: TableEditRecordset) => {
    records.value = value
    validationMessage.value = ''
    validationPassed.value = false
    emit('draft-state', value.changes.length > 0)
  }
  const openCellEditor = async (context: TableEditContext) => {
    cellEditorRef.value?.flush()
    activeColumn.value = columnInfo(context.prop)
    await nextTick()
    void cellEditorRef.value?.open(context)
  }
  const saveCell = (context: TableEditContext, value: unknown) => {
    tableRef.value?.setCellValue(context.row, context.prop, value)
    const active = tableRef.value?.getEditRecord()
    if (active?.row === context.row && active.prop === context.prop) tableRef.value?.clearEdit()
    void tableRef.value?.validateField(context.prop, { focus: false })
    context.cell?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }
  const validateDraft = async (notify = false): Promise<boolean> => {
    const validation = await tableRef.value?.validate({ focus: notify })
    validationMessage.value = validation?.valid
      ? ''
      : validation?.firstError?.message || '校验未完成，请重试'
    validationPassed.value = Boolean(validation?.valid)
    if (notify && validation?.valid) ElMessage.success('基础字段校验通过')
    return Boolean(validation?.valid)
  }
  const reviewChanges = async () => {
    await validateDraft()
    void changesRef.value?.open()
  }
  const confirmLeave = (): Promise<boolean> => {
    if (!changeCount.value && !cellEditorRef.value?.isDirty()) return Promise.resolve(true)
    if (pendingLeave) return pendingLeave
    pendingLeave = feedback
      .confirm('当前结果副本还有未保留的修改。请先通过变更预览导出文件，或放弃修改继续。', {
        title: '离开结果编辑',
        confirmButtonText: '放弃修改并继续',
        cancelButtonText: '继续编辑',
        closeOnClickModal: false
      })
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        pendingLeave = undefined
      })
    return pendingLeave
  }
  const resetDraft = async () => {
    if (await confirmLeave()) {
      cellEditorRef.value?.cancel()
      tableRef.value?.revertData()
      validationMessage.value = ''
      validationPassed.value = false
    }
  }
  const exitEditing = async () => {
    if (!(await confirmLeave())) return
    cellEditorRef.value?.cancel()
    editMode.value = false
    onlyChanged.value = false
    records.value = emptyRecords()
    emit('draft-state', false)
  }
  const handleDraftKeydown = (event: KeyboardEvent) => {
    if (!editMode.value || !(event.ctrlKey || event.metaKey) || event.isComposing) return
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input,textarea,[contenteditable="true"],[role="combobox"]')
    )
      return
    if (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y') {
      event.preventDefault()
      event.stopPropagation()
      if (event.key.toLowerCase() === 'y' || event.shiftKey) tableRef.value?.redo()
      else tableRef.value?.undo()
    }
  }
  useEventListener(window, 'beforeunload', (event: BeforeUnloadEvent) => {
    if (changeCount.value) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  watch([() => props.data, () => props.columns], () => {
    cellEditorRef.value?.cancel()
    generation++
    analyzing.value = false
    editMode.value = false
    currentPage.value = 1
    resultSearch.value = ''
    onlyChanged.value = false
    records.value = emptyRecords()
    selectedCell.value = null
    emit('draft-state', false)
  })
  watch(
    () => props.loading,
    (loading) => {
      if (loading && analyzing.value) {
        generation++
        analyzing.value = false
      }
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    generation++
    emit('draft-state', false)
  })
  defineExpose({ confirmLeave, hasChanges: () => changeCount.value > 0 })

  const menuRef = ref<MenuExpose>()
  const cellContentViewRef = ref<CellContentViewExpose>()
  const { width: menuViewportWidth } = useWindowSize()
  let filterActionRevision = 0
  let menuRevision = 0

  // Selected cell info
  const selectedCell = shallowRef<{
    row: SqlResultRow
    column: TableCellColumn
    event: MouseEvent
  } | null>(null)

  // Compute table columns
  const resultColumnWidth = (field: string) => {
    const type = columnInfo(field).dataType
    const preferred = /json|text|clob/i.test(type)
      ? 300
      : /uuid/i.test(type)
        ? 300
        : /timestamp|datetime/i.test(type)
          ? 260
          : /^date/i.test(type)
            ? 160
            : /^time/i.test(type)
              ? 180
              : /bool|^bit/i.test(type)
                ? 112
                : 180
    return Math.max(preferred, Math.min(360, field.length * 8 + 32))
  }
  type HeaderSortOrder = 'ascending' | 'descending' | 'none'
  const applyHeaderSortAria = (
    button: HTMLButtonElement,
    binding: { value: HeaderSortOrder }
  ): void => {
    button.closest('[role="columnheader"]')?.setAttribute('aria-sort', binding.value)
  }
  // ElTableV2 currently defaults inactive sortable headers to ascending; keep SQL's ARIA exact.
  const headerSortAria: ObjectDirective<HTMLButtonElement, HeaderSortOrder> = {
    mounted: applyHeaderSortAria,
    updated: applyHeaderSortAria,
    beforeUnmount: (button) => {
      button.closest('[role="columnheader"]')?.removeAttribute('aria-sort')
    }
  }
  const baseTableColumns = computed<ColumnOption<SqlResultRow>[]>(() => {
    if (!props.columns || props.columns.length === 0) {
      return []
    }

    return props.columns.map((column) => ({
      prop: column.name,
      label: column.name,
      sortable:
        !editMode.value &&
        !hasDuplicateColumns.value &&
        getSqlResultSortKind(sortMetadata.value.get(column.name) ?? column) !== 'unsupported'
          ? ('custom' as const)
          : false,
      minWidth: resultColumnWidth(column.name),
      renderHeader: () => {
        const sortable =
          !editMode.value &&
          !hasDuplicateColumns.value &&
          getSqlResultSortKind(sortMetadata.value.get(column.name) ?? column) !== 'unsupported'
        const header = h(
          sortable ? 'button' : 'span',
          sortable
            ? {
                type: 'button',
                class:
                  'sql-result-column-header flex w-full min-w-0 flex-col gap-1 border-0 bg-transparent p-0 text-left text-inherit',
                title: `${column.name} · ${columnInfo(column.name).dataType} · ${sortHeaderLabel(column.name)}`,
                'aria-label': sortHeaderLabel(column.name),
                disabled: props.loading,
                onClick: (event: MouseEvent) => {
                  event.stopPropagation()
                  cycleResultSort(column.name)
                },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
                }
              }
            : {
                class: 'sql-result-column-header flex min-w-0 flex-col gap-1',
                title: `${column.name} · ${columnInfo(column.name).dataType}`
              },
          [
            h('span', { class: 'truncate' }, column.name),
            h(
              'span',
              { class: 'truncate font-mono text-[11px] font-normal text-g-700' },
              columnInfo(column.name).dataType
            )
          ]
        )
        const order: HeaderSortOrder =
          !props.loading && sortSelection.value?.field === column.name
            ? sortSelection.value.order
            : 'none'
        return sortable ? withDirectives(header, [[headerSortAria, order]]) : header
      },
      showOverflowTooltip: false,
      ...(editMode.value
        ? {
            editRender: {
              enabled: !isProtected(column.name),
              name: isSqlDraftJson(columnInfo(column.name))
                ? ('textarea' as const)
                : columnInfo(column.name).dataType === 'boolean'
                  ? ('select' as const)
                  : ('input' as const),
              nullable: columnInfo(column.name).isNullable,
              options: [
                { label: 'true', value: true },
                { label: 'false', value: false }
              ]
            }
          }
        : {}),
      formatter: (row) => {
        const value = getOwnRecordValue(row, column.name)
        if (value === null)
          return h(
            'span',
            { class: 'font-mono italic text-g-600', title: 'SQL NULL（无值）' },
            'NULL'
          )
        if (typeof value === 'boolean') return String(value)
        const content = isObject(value) ? JSON.stringify(value) : String(value ?? '')
        return h(
          'button',
          {
            type: 'button',
            class: 'sql-result-cell',
            title: '查看完整内容',
            'aria-label': `查看 ${column.name} 内容`,
            onClick: () => {
              void cellContentViewRef.value?.handleOpen({ content, columnName: column.name })
            }
          },
          [
            isObject(value)
              ? h('span', { class: 'sql-result-cell__type' }, Array.isArray(value) ? '[]' : '{}')
              : null,
            h('span', { class: 'sql-result-cell__text' }, content)
          ]
        )
      }
    }))
  })

  const {
    columns: visibleColumns,
    columnChecks,
    resetColumns
  } = useTableColumns<SqlResultRow>(() => baseTableColumns.value)
  const availableColumnCount = computed(
    () => filterTenantDimensionDescriptors(baseTableColumns.value, isPlatformScope.value).length
  )
  const allPinColumns = computed(() =>
    filterTenantDimensionDescriptors(baseTableColumns.value, isPlatformScope.value).map(
      (column) => ({
        key: String(column.prop ?? ''),
        label: column.label || String(column.prop ?? '')
      })
    )
  )
  const pinColumns = computed(() =>
    filterTenantDimensionDescriptors(visibleColumns.value, isPlatformScope.value).map((column) => ({
      key: String(column.prop ?? ''),
      label: column.label || String(column.prop ?? '')
    }))
  )
  const {
    desiredPins,
    rawLayout: pinRawLayout,
    resolve: pinLayout,
    ready: pinsReady,
    handleLayout: handleColumnLayout,
    setPin,
    clearPins,
    clearLayout: clearPinLayout,
    reset: resetPins
  } = useSqlColumnPins({
    columns: () => pinColumns.value,
    disabled: () => editMode.value || hasDuplicateColumns.value || props.loading
  })
  const tableColumns = computed(() =>
    editMode.value || hasDuplicateColumns.value
      ? baseTableColumns.value
      : visibleColumns.value.map((column) => ({
          ...column,
          fixed: pinLayout.value.appliedPins.get(String(column.prop ?? '')) || false
        }))
  )
  // Checks own the common picker state; data columns remain independent of pin application.
  watchEffect(() => {
    for (const column of columnChecks.value)
      column.fixed = pinLayout.value.appliedPins.get(String(column.prop ?? '')) || false
  })
  const visibleSuspendedPinCount = computed(
    () =>
      pinLayout.value.suspended.filter((pin) =>
        pinColumns.value.some((column) => column.key === pin.key)
      ).length
  )
  const pinSuspensionMessage = computed(() =>
    !pinsReady.value
      ? '固定设置已保留，正在更新表格布局。'
      : pinRawLayout.value.viewportWidth < 640
        ? '当前工作区较窄，固定列已暂停；扩大工作区后会自动恢复。'
        : '部分固定列已暂停，扩大工作区或取消其他固定列后会自动恢复。'
  )
  const applyColumnPin = (key: string, side: SqlColumnPinSide | null) => {
    const result = setPin(key, side)
    if (!result.accepted) ElMessage.warning(result.message || '固定列设置未完成，请稍后重试。')
  }
  const visibleColumnCount = computed(
    () => filterTenantDimensionDescriptors(tableColumns.value, isPlatformScope.value).length
  )
  const allColumnsHidden = computed(
    () => !editMode.value && availableColumnCount.value > 0 && visibleColumnCount.value === 0
  )
  const noDisplayableColumns = computed(
    () => props.columns.length > 0 && availableColumnCount.value === 0
  )
  const columnViewRevision = ref(0)
  const restoreResultColumns = () => {
    const allowed = new Set(allPinColumns.value.map((column) => column.key))
    for (const column of columnChecks.value)
      if (allowed.has(String(column.prop ?? '')))
        Object.assign(column, { visible: true, checked: true })
  }
  const resetResultColumnView = () => {
    resetPins()
    resetColumns()
    columnViewRevision.value++
    pinMenuField.value = null
    menuRef.value?.hide()
  }
  // Reset the V2 width cache together with the result-local view, without persisting fields.
  watch([() => props.data, () => props.columns], resetResultColumnView)
  watch(tableRef, (table) => {
    if (!table) clearPinLayout()
  })

  const valueFilterFields = computed(() => new Set(pinColumns.value.map((column) => column.key)))
  // Apply authorization/visibility immediately, before the synchronous pruning watcher runs.
  const effectiveValueFilters = computed(() =>
    valueFilters.value.filter((filter) => valueFilterFields.value.has(filter.field))
  )
  const invalidateCellMenu = (): void => {
    menuRevision++
    selectedCell.value = null
    pinMenuField.value = null
    menuRef.value?.hide()
  }
  const resetValueFilters = (): void => {
    filterActionRevision++
    valueFilters.value = []
    invalidateCellMenu()
    cellContentViewRef.value?.reset()
  }
  const focusResultSearch = (): void => {
    const revision = filterActionRevision
    void nextTick(() => {
      if (revision === filterActionRevision && !props.loading && !editMode.value)
        resultSearchRef.value?.focus()
    })
  }
  const clearValueFilters = (): void => {
    if (props.loading || editMode.value) return
    valueFilters.value = []
    focusResultSearch()
  }
  const removeValueFilter = (filter: SqlResultValueFilter): void => {
    if (props.loading || editMode.value || !valueFilters.value.includes(filter)) return
    valueFilters.value = valueFilters.value.filter((item) => item !== filter)
    focusResultSearch()
  }
  const viewValueFilter = (filter: SqlResultValueFilter): void => {
    if (props.loading || editMode.value || !effectiveValueFilters.value.includes(filter)) return
    const value = filter.value
    const content =
      value === null
        ? 'NULL'
        : typeof value === 'string'
          ? value
          : Object.is(value, -0)
            ? '-0'
            : `${String(value)}${typeof value === 'bigint' ? 'n' : ''}`
    void cellContentViewRef.value?.handleOpen({
      content,
      preserveRaw: true,
      columnName: `${filter.field} · 筛选原值（${value === null ? 'NULL' : typeof value}）`
    })
  }
  const readSelectedFilterValue = () => {
    const selected = selectedCell.value
    if (props.loading) return { supported: false as const, reason: '查询加载中，完成后再筛选。' }
    if (editMode.value) return { supported: false as const, reason: '退出编辑副本后可筛选。' }
    if (hasDuplicateColumns.value)
      return { supported: false as const, reason: '字段重名，请用 AS 指定唯一别名。' }
    if (
      !selected ||
      !valueFilterFields.value.has(selected.column.property) ||
      !props.data.includes(selected.row)
    )
      return { supported: false as const, reason: '当前单元格已失效，请重新选择。' }
    const result = readSqlResultFilterValue(selected.row, selected.column.property)
    return result.supported ? { ...result, field: selected.column.property } : result
  }
  const valueFilterReason = computed(() => {
    if (headerMenu.value || editMode.value || !selectedCell.value) return ''
    const result = readSelectedFilterValue()
    return !result.supported
      ? result.reason
      : valueFilters.value.length >= 8
        ? '最多 8 项，请先移除筛选条件。'
        : ''
  })
  const valueFilterMenuItems = computed<MenuItemType[]>(() => {
    if (editMode.value || !selectedCell.value) return []
    const result = readSelectedFilterValue()
    return (['include', 'exclude'] as const).map((operator) => ({
      key: `filter-${operator}`,
      label:
        result.supported && result.value === null
          ? operator === 'include'
            ? '仅保留 NULL'
            : '排除 NULL'
          : operator === 'include'
            ? '仅保留相同原值'
            : '排除此原值',
      icon: operator === 'include' ? 'ri:filter-2-line' : 'ri:filter-off-line',
      disabled:
        !result.supported ||
        valueFilters.value.length >= 8 ||
        valueFilters.value.some(
          (filter) =>
            result.supported &&
            areSqlResultValueFiltersEqual(filter, { ...result, id: '', operator })
        ),
      showLine: operator === 'include'
    }))
  })
  const addValueFilter = (operator: SqlResultValueFilter['operator']): void => {
    const result = readSelectedFilterValue()
    if (!result.supported || valueFilters.value.length >= 8) return
    const filter: SqlResultValueFilter = {
      id: crypto.randomUUID(),
      field: result.field,
      value: result.value,
      operator
    }
    if (valueFilters.value.some((existing) => areSqlResultValueFiltersEqual(existing, filter)))
      return
    valueFilters.value = [...valueFilters.value, filter]
    focusResultSearch()
  }
  watch(
    valueFilters,
    () => {
      filterActionRevision++
      currentPage.value = 1
      invalidateCellMenu()
    },
    { flush: 'sync' }
  )
  watch(
    valueFilterFields,
    (fields) => {
      const retained = valueFilters.value.filter((filter) => fields.has(filter.field))
      if (retained.length !== valueFilters.value.length) valueFilters.value = retained
      invalidateCellMenu()
    },
    { flush: 'sync' }
  )
  watch(
    [
      () => props.data,
      () => props.columns,
      () => props.owner,
      () => props.query,
      () => props.dialect,
      () => props.defaultSchema,
      () => user.getUserInfo.userId,
      () => user.isPlatformSuper,
      () => tenant.effectiveTenantId,
      editMode
    ],
    resetValueFilters,
    { flush: 'sync' }
  )
  watch(
    () => props.loading,
    (loading) => {
      if (loading) {
        filterActionRevision++
        invalidateCellMenu()
      }
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    resetValueFilters()
  })

  const sortColumns = computed(() => {
    const visible = new Set(
      filterTenantDimensionDescriptors(visibleColumns.value, isPlatformScope.value).map(
        (column) => column.prop
      )
    )
    return props.columns
      .filter((column) => visible.has(column.name))
      .map((column) => sortMetadata.value.get(column.name) ?? column)
  })
  const {
    selection: sortSelection,
    result: sortResult,
    rows: sortedRows,
    headerLabel: sortHeaderLabel,
    cycle: cycleResultSort,
    clear: clearResultSort,
    reset: resetResultSort,
    handleChange: handleResultSortChange
  } = useSqlResultSort({
    rows: () => filteredRows.value,
    columns: () => sortColumns.value,
    paused: () => editMode.value,
    disabled: () => props.loading || hasDuplicateColumns.value,
    table: () => tableRef.value,
    viewRevision: () => columnViewRevision.value,
    onChange: () => {
      currentPage.value = 1
      selectedCell.value = null
    }
  })
  watch(
    [sortSelection, () => props.loading, editMode],
    () => {
      sortDetailsOpen.value = false
    },
    { flush: 'sync' }
  )
  watch(
    [
      () => props.data,
      () => props.columns,
      () => user.getUserInfo.userId,
      () => user.isPlatformSuper,
      () => tenant.effectiveTenantId
    ],
    resetResultSort,
    { flush: 'sync' }
  )
  const tableData = computed(() => (editMode.value ? draftRows.value : sortedRows.value))
  const copyColumns = computed(() => {
    const metadata = new Map(props.columns.map((column) => [column.name, column]))
    const ordered = sortBy(
      filterTenantDimensionDescriptors(visibleColumns.value, isPlatformScope.value),
      (column) => {
        const side = pinLayout.value.appliedPins.get(String(column.prop ?? ''))
        return side === 'left' ? 0 : side === 'right' ? 2 : 1
      }
    )
    return ordered.flatMap((column) => {
      const field = metadata.get(String(column.prop ?? ''))
      return field
        ? [
            {
              name: field.name,
              property: field.property,
              type: field.type,
              fullType: field.fullType
            }
          ]
        : []
    })
  })
  const copyOwner = computed(() =>
    JSON.stringify([props.owner, props.query, props.dialect, props.defaultSchema])
  )
  const copyDisabledReason = computed(() =>
    props.loading
      ? '查询结果正在加载，完成后可复制。'
      : editMode.value
        ? '编辑副本期间暂不可复制；退出编辑后复制原始结果视图。'
        : hasDuplicateColumns.value
          ? '结果包含重名字段，请在 SELECT 中使用 AS 指定唯一字段名后重试。'
          : !availableColumnCount.value
            ? '当前没有可复制的授权字段。'
            : !copyColumns.value.length
              ? '当前没有可复制的显示列，请先在列设置中恢复已获准字段。'
              : ''
  )

  const getCellContent = (row: SqlResultRow, property: string) => {
    const value = getOwnRecordValue(row, property)
    return isObject(value) ? JSON.stringify(value) : String(value ?? '')
  }

  const pinMenuField = ref<string | null>(null)
  const headerMenu = ref(false)
  const pinMenuItems = computed<MenuItemType[]>(() => {
    const key = pinMenuField.value
    if (
      !key ||
      editMode.value ||
      hasDuplicateColumns.value ||
      !pinColumns.value.some((column) => column.key === key)
    )
      return []
    const cannotPin = !pinsReady.value || pinRawLayout.value.viewportWidth < 640 || props.loading
    return [
      {
        key: 'pin-left',
        label: '固定到左侧',
        icon: 'ri:pushpin-line',
        disabled: cannotPin,
        showLine: !headerMenu.value
      },
      { key: 'pin-right', label: '固定到右侧', icon: 'ri:pushpin-line', disabled: cannotPin },
      {
        key: 'pin-none',
        label: '取消此列固定',
        icon: 'ri:unpin-line',
        disabled: !desiredPins.value.some((pin) => pin.key === key)
      },
      {
        key: 'pin-clear',
        label: '取消全部固定',
        icon: 'ri:restart-line',
        disabled: !desiredPins.value.length
      }
    ]
  })
  // Menu Items
  const menuItems = computed((): MenuItemType[] =>
    headerMenu.value
      ? pinMenuItems.value
      : [
          ...(editMode.value &&
          selectedCell.value &&
          !isProtected(selectedCell.value.column.property)
            ? [
                { key: 'edit', label: '编辑此单元格', icon: 'ri:edit-line' },
                {
                  key: 'null',
                  label: '设为 NULL',
                  icon: 'ri:subtract-line',
                  disabled: !columnInfo(selectedCell.value.column.property).isNullable
                },
                {
                  key: 'revert',
                  label: '还原此单元格',
                  icon: 'ri:restart-line',
                  disabled: !tableRef.value?.isUpdateByRow(
                    selectedCell.value.row,
                    selectedCell.value.column.property
                  ),
                  showLine: true
                }
              ]
            : []),
          {
            key: 'copy',
            label: '复制',
            icon: 'ri-file-copy-line'
          },
          {
            key: 'view',
            label: '查看',
            icon: 'ri-eye-line'
          },
          ...valueFilterMenuItems.value,
          ...pinMenuItems.value,
          ...(valueFilterReason.value
            ? [{ key: 'filter-reason', label: valueFilterReason.value, disabled: true }]
            : [])
        ]
  )

  // Handle Cell Click (Left Click)
  const handleCellClick = (
    row: SqlResultRow,
    column: TableCellColumn,
    cell: HTMLTableCellElement,
    event: MouseEvent
  ) => {
    void cell
    invalidateCellMenu()
    selectedCell.value = { row, column, event }
  }

  // Handle Cell Context Menu (Right Click)
  const handleCellContextMenu = (
    row: SqlResultRow,
    column: TableCellColumn,
    cell: HTMLTableCellElement,
    event: MouseEvent
  ) => {
    void cell
    // Prevent default browser menu
    event.preventDefault()

    // Update selected cell info
    const revision = ++menuRevision
    const selection = { row, column, event }
    selectedCell.value = selection
    headerMenu.value = false
    pinMenuField.value = column.property

    // Show menu
    nextTick(() => {
      if (
        revision === menuRevision &&
        selectedCell.value === selection &&
        !props.loading &&
        (editMode.value
          ? authorizedSearchColumns.value.some((field) => field.name === column.property)
          : valueFilterFields.value.has(column.property))
      )
        menuRef.value?.show(event)
    })
  }

  const handleHeaderContextMenu = (column: TableCellColumn, event: MouseEvent) => {
    if (props.loading || editMode.value || hasDuplicateColumns.value) return
    if (!pinColumns.value.some((field) => field.key === column.property)) return
    event.preventDefault()
    headerMenu.value = true
    pinMenuField.value = column.property
    const revision = ++menuRevision
    void nextTick(() => {
      if (revision === menuRevision && headerMenu.value && pinMenuField.value === column.property)
        menuRef.value?.show(event)
    })
  }

  // Handle Menu Selection
  const handleMenuSelect = async (item: MenuItemType) => {
    if (item.key === 'filter-include' || item.key === 'filter-exclude') {
      addValueFilter(item.key === 'filter-include' ? 'include' : 'exclude')
      return
    }
    if (item.key === 'pin-clear') {
      clearPins()
      return
    }
    if (pinMenuField.value && ['pin-left', 'pin-right', 'pin-none'].includes(item.key)) {
      applyColumnPin(
        pinMenuField.value,
        item.key === 'pin-left' ? 'left' : item.key === 'pin-right' ? 'right' : null
      )
      return
    }
    if (!selectedCell.value) return

    if (item.key === 'edit') {
      void tableRef.value?.setEditCell(selectedCell.value.row, selectedCell.value.column.property)
      return
    }
    if (item.key === 'null') {
      tableRef.value?.setCellValue(selectedCell.value.row, selectedCell.value.column.property, null)
      return
    }
    if (item.key === 'revert') {
      tableRef.value?.revertData(selectedCell.value.row, selectedCell.value.column.property)
      return
    }

    if (item.key === 'copy') {
      try {
        await copyTextToClipboard(
          getCellContent(selectedCell.value.row, selectedCell.value.column.property)
        )
        ElMessage.success('复制成功')
      } catch {
        ElMessage.warning('复制失败，请打开查看内容后手动复制')
      }
    } else if (item.key === 'view') {
      void openDrawer()
    }
  }

  const openDrawer = async () => {
    if (!selectedCell.value) return

    await cellContentViewRef.value?.handleOpen({
      content: getCellContent(selectedCell.value.row, selectedCell.value.column.property),
      columnName: selectedCell.value.column.property
    })
  }

  const cellClassName = ({ row, column }: { row: SqlResultRow; column: TableCellColumn }) => {
    if (
      selectedCell.value &&
      selectedCell.value.row === row &&
      selectedCell.value.column.property === column.property
    ) {
      return 'selected-cell'
    }
    return ''
  }
</script>

<style scoped lang="scss">
  .result-table-container {
    .sql-result-column-tools {
      display: flex !important;

      :deep(.art-table-header__right) {
        margin-top: 0 !important;
      }

      :deep(.art-table-header__action) {
        margin: 0;
      }
    }

    :deep(.el-table) {
      height: 100%;

      .cell {
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.5;
        white-space: nowrap;
      }

      // Add selection style if needed
      .el-table__cell {
        // cursor: default;
      }

      .selected-cell {
        position: relative;
        z-index: 1;
        box-shadow: inset 0 0 0 2px var(--el-color-primary);
      }
    }

    :deep(.sql-result-cell) {
      display: flex;
      gap: 6px;
      align-items: center;
      width: 100%;
      min-width: 0;
      height: 28px;
      text-align: left;

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: -2px;
      }

      .sql-result-cell__type {
        flex-shrink: 0;
        font-family: monospace;
        color: var(--el-color-primary);
      }

      .sql-result-cell__text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    :deep(button.sql-result-column-header:focus-visible) {
      outline: 2px solid var(--el-color-primary);
      outline-offset: -2px;
    }
  }
</style>
