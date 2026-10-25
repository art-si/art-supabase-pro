<template>
  <ArtPageShell>
    <div class="table-query-widget">
      <ArtSectionCard
        class="table-query-widget__section"
        title="ArtTableQuery 综合示例"
        subtitle="覆盖内管模式、受控模式、查询插槽、列插槽、headerActions、导入导出、缓存、分页字段映射、响应适配、行拖拽和 Expose API。"
      >
        <template #actions>
          <ElTag effect="plain">/widgets/table-query</ElTag>
        </template>

        <div class="table-query-widget__toolbar">
          <ElSpace wrap>
            <ElButton @click="callExpose('getData')">getData</ElButton>
            <ElButton @click="callExpose('refreshData')">refreshData</ElButton>
            <ElButton @click="callExpose('refreshCreate')">refreshCreate</ElButton>
            <ElButton @click="callExpose('refreshUpdate')">refreshUpdate</ElButton>
            <ElButton @click="callExpose('refreshRemove')">refreshRemove</ElButton>
            <ElButton @click="callExpose('resetSearchParams')">resetSearchParams</ElButton>
          </ElSpace>
          <ElSwitch v-model="showSearchBar" active-text="显示搜索区" inactive-text="隐藏搜索区" />
        </div>

        <ArtTableQuery
          ref="managedTableRef"
          v-model="managedSearch"
          v-model:show-search-bar="showSearchBar"
          :search-items="managedSearchItems"
          :api-fn="fetchManagedRows"
          :api-params="managedApiParams"
          :pagination-key="{ current: 'page', size: 'pageSize' }"
          :exclude-params="['clientOnly']"
          :enable-cache="true"
          :cache-time="60000"
          :max-cache-size="12"
          :debounce-time="120"
          :response-adapter="managedResponseAdapter"
          :data-transformer="managedDataTransformer"
          :on-success="handleManagedSuccess"
          :on-cache-hit="handleManagedCacheHit"
          :on-error="handleManagedError"
          :columns-factory="managedColumnsFactory"
          :header-actions="managedHeaderActions"
          :search-bar-props="managedSearchBarProps"
          :table-header-props="managedTableHeaderProps"
          :table-props="managedTableProps"
          @search="handleManagedSearch"
          @reset="logEvent('managed reset')"
          @refresh="logEvent('managed refresh')"
          @header-search="logEvent('managed toggle search')"
          @selection-change="handleManagedSelectionChange"
          @header-action-click="handleHeaderActionClick"
          @row-drag-start="handleRowDragStart"
          @row-drag-update="handleRowDragUpdate"
          @row-drag-end="handleRowDragEnd"
          @pagination:size-change="(size: number) => logEvent(`managed page size -> ${size}`)"
          @pagination:current-change="(page: number) => logEvent(`managed current page -> ${page}`)"
        >
          <template #custom-action="{ selectedCount, api }">
            <ElButton :disabled="!selectedCount" @click="markSelected(api)">
              标记已选 {{ selectedCount }}
            </ElButton>
          </template>

          <template #header-left="{ selectedCount }">
            <ElTag type="info" effect="plain">已选 {{ selectedCount }} 行</ElTag>
          </template>

          <template #header-right>
            <ArtTooltip content="header-right 插槽：业务侧可追加轻量工具">
              <ElTag effect="plain" type="success">header-right slot</ElTag>
            </ArtTooltip>
          </template>

          <template #status="{ row }">
            <ElTag :type="getStatusMeta(toDemoOrder(row).status).type" effect="light">
              {{ getStatusMeta(toDemoOrder(row).status).label }}
            </ElTag>
          </template>

          <template #priority="{ row }">
            <ElTag :type="getPriorityMeta(toDemoOrder(row).priority).type" effect="plain">
              {{ getPriorityMeta(toDemoOrder(row).priority).label }}
            </ElTag>
          </template>

          <template #operation="{ row }">
            <ElSpace>
              <ElButton link type="primary" @click="simulateUpdate(toDemoOrder(row))"
                >编辑</ElButton
              >
              <ElButton link type="danger" @click="simulateRemove(toDemoOrder(row))">删除</ElButton>
            </ElSpace>
          </template>
        </ArtTableQuery>
      </ArtSectionCard>

      <div class="table-query-widget__grid">
        <ArtSectionCard
          class="table-query-widget__section"
          title="受控模式"
          subtitle="不传 apiFn，由页面维护 loading、data、columns、pagination，并响应 ArtTableQuery 事件。"
        >
          <template #actions>
            <ElTag effect="plain" type="warning">controlled</ElTag>
          </template>

          <ArtTableQuery
            v-model="controlledSearch"
            v-model:columns="controlledColumnChecks"
            v-model:show-search-bar="controlledShowSearchBar"
            :loading="controlledLoading"
            :data="controlledData"
            :table-columns="controlledColumns"
            :pagination="controlledPagination"
            :search-items="controlledSearchItems"
            :table-props="controlledTableProps"
            :table-header-props="{ layout: 'search,refresh,size,columns,settings' }"
            @search="handleControlledSearch"
            @reset="handleControlledReset"
            @refresh="loadControlledData"
            @selection-change="(rows: unknown[]) => logEvent(`controlled selection -> ${rows.length}`)"
            @pagination:size-change="handleControlledSizeChange"
            @pagination:current-change="handleControlledCurrentChange"
          >
            <template #status="{ row }">
              <ElTag :type="getStatusMeta(toDemoOrder(row).status).type" effect="light">
                {{ getStatusMeta(toDemoOrder(row).status).label }}
              </ElTag>
            </template>
          </ArtTableQuery>
        </ArtSectionCard>

        <ArtSectionCard
          :show-scrollbar="false"
          class="table-query-widget__section table-query-widget__log"
          title="事件日志"
          subtitle="展示 search、reset、refresh、分页、header action、缓存命中和行拖拽等回调。"
          :empty="!eventLogs.length"
          empty-title="暂无事件"
          empty-description="操作上方表格后，相关事件会显示在这里。"
          min-height="420px"
        >
          <template #actions>
            <ElButton text type="primary" @click="eventLogs = []">
              <template #icon><ArtSvgIcon icon="ri:delete-bin-line" /></template>
              清空
            </ElButton>
          </template>

          <ElScrollbar height="420px">
            <div v-for="item in eventLogs" :key="item.id" class="table-query-widget__log-item">
              <span>{{ item.time }}</span>
              <strong>{{ item.text }}</strong>
            </div>
          </ElScrollbar>
        </ArtSectionCard>
      </div>
    </div>
  </ArtPageShell>
</template>

<script setup lang="tsx">
  import { formatSensitiveCountValue } from '@/utils/ui/format'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ElMessage, ElTag } from 'element-plus'
  import type { TagProps } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryExcelColumn,
    ArtTableQueryHeaderAction,
    ArtTableQueryHeaderActionContext,
    ArtTableQueryResponseAdapter,
    ArtTableQuerySearchBarProps,
    ArtTableQueryTableHeaderProps,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import type { ApiResponse } from '@/utils/table/table-cache'

  defineOptions({ name: 'TableQueryWidget' })

  type DemoStatus = 'draft' | 'processing' | 'done' | 'blocked'
  type DemoPriority = 'all' | 'low' | 'medium' | 'high'

  interface DemoOrder {
    id: number
    code: string
    customer: string
    status: DemoStatus
    priority: Exclude<DemoPriority, 'all'>
    owner: string
    city: string
    amount: number
    enabled: boolean
    createdAt: string
  }

  interface ManagedSearchModel {
    keyword?: string
    status?: DemoStatus
    priority?: DemoPriority
    city?: string
    amountMin?: number
    dateRange?: [string, string]
    enabled?: boolean
    clientOnly?: string
  }

  interface ManagedApiParams extends ManagedSearchModel {
    page?: number
    pageSize?: number
    tenantId?: string
  }

  interface MockApiResponse {
    payload: {
      items: DemoOrder[]
      page: number
      pageSize: number
      total: number
    }
    meta: {
      source: 'mock'
      requestedAt: string
    }
  }

  interface EventLogItem {
    id: number
    time: string
    text: string
  }

  const statusOptions = [
    { label: '草稿', value: 'draft' },
    { label: '处理中', value: 'processing' },
    { label: '已完成', value: 'done' },
    { label: '阻塞', value: 'blocked' }
  ]

  const priorityOptions = [
    { label: '全部', value: 'all' },
    { label: '低', value: 'low' },
    { label: '中', value: 'medium' },
    { label: '高', value: 'high' }
  ]

  const cityOptions = ['上海', '杭州', '深圳', '成都', '苏州'].map((city) => ({
    label: city,
    value: city
  }))

  const ownerOptions = ['北区团队', '华东团队', '华南团队', '西南团队']
  const customers = ['星河制造', '云杉供应链', '澄海科技', '青禾材料', '辰光零售', '远山能源']
  const statusList: DemoStatus[] = ['draft', 'processing', 'done', 'blocked']
  const priorityList: Array<Exclude<DemoPriority, 'all'>> = ['low', 'medium', 'high']

  const createDemoRows = (): DemoOrder[] => {
    return Array.from({ length: 57 }, (_, index) => {
      const id = index + 1
      return {
        id,
        code: `ORD-${String(id).padStart(4, '0')}`,
        customer: customers[index % customers.length],
        status: statusList[index % statusList.length],
        priority: priorityList[index % priorityList.length],
        owner: ownerOptions[index % ownerOptions.length],
        city: cityOptions[index % cityOptions.length].value,
        amount: 1200 + index * 137,
        enabled: index % 5 !== 0,
        createdAt: `2026-06-${String((index % 18) + 1).padStart(2, '0')}`
      }
    })
  }

  const toDemoOrder = (row: unknown): DemoOrder => row as DemoOrder

  const allRows = ref<DemoOrder[]>(createDemoRows())
  const managedTableRef = ref<ArtTableQueryExpose>()
  const showSearchBar = ref(true)
  const managedSearch = ref<ManagedSearchModel>({
    priority: 'all',
    clientOnly: '仅前端字段，excludeParams 会移除'
  })
  const managedApiParams = {
    tenantId: 'demo-tenant'
  }

  const eventLogs = ref<EventLogItem[]>([])
  const selectedRows = shallowRef<DemoOrder[]>([])

  const managedSearchItems = computed<SearchFormItem[]>(() => [
    {
      label: '关键词',
      key: 'keyword',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '订单号 / 客户 / 负责人'
      }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '请选择状态',
        options: statusOptions
      }
    },
    {
      label: '优先级',
      key: 'priority',
      type: 'segment',
      help: '通过 SearchFormItem 配置分段选项。',
      props: {
        options: priorityOptions,
        block: true,
        class: '[&_.el-segmented\\_\\_item]:px-0.5!'
      }
    },
    {
      label: '城市',
      key: 'city',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '请选择城市',
        options: cityOptions
      }
    },
    {
      label: '最低金额',
      key: 'amountMin',
      type: 'number',
      props: {
        min: 0,
        controlsPosition: 'right',
        placeholder: '保留 0'
      }
    },
    {
      label: '创建日期',
      key: 'dateRange',
      type: 'date',
      props: {
        type: 'daterange',
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
      }
    },
    {
      label: '启用',
      key: 'enabled',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '请选择',
        options: [
          { label: '启用', value: true },
          { label: '停用', value: false }
        ]
      }
    }
  ])

  const managedSearchBarProps: ArtTableQuerySearchBarProps = {
    span: 6,
    labelWidth: 86,
    defaultExpanded: false,
    showExpand: true,
    buttonLeftLimit: 2,
    sanitizeOutput: {
      removeEmptyString: true,
      removeEmptyArray: true,
      removeEmptyObject: true,
      keepZero: true,
      keepFalse: true
    }
  }

  const managedTableHeaderProps: ArtTableQueryTableHeaderProps = {
    layout: 'search,refresh,size,fullscreen,columns,settings',
    fullClass: 'table-query-widget'
  }

  const managedTableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    height: 420,
    showOverflowTooltip: true,
    highlightCurrentRow: true,
    rowClassName: ({ row }) => (toDemoOrder(row).priority === 'high' ? 'is-high' : ''),
    paginationOptions: {
      pageSizes: [5, 10, 20, 50],
      align: 'right',
      layout: 'total, sizes, prev, pager, next, jumper',
      pagerCount: 5
    }
  }

  const excelColumns: ArtTableQueryExcelColumn[] = [
    { key: 'code', title: '订单号', required: true, width: 18 },
    { key: 'customer', title: '客户', required: true, width: 18 },
    { key: 'status', title: '状态', width: 12 },
    { key: 'priority', title: '优先级', width: 12 },
    {
      key: 'amount',
      title: '金额',
      width: 14,
      formatter: (row) =>
        `￥${formatSensitiveCountValue(Number((row as Record<string, unknown>).amount ?? 0))}`
    },
    { key: 'owner', title: '负责人', width: 16 },
    { key: 'city', title: '城市', width: 12 },
    { key: 'createdAt', title: '创建日期', width: 14 }
  ]

  const managedHeaderActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: '模拟新增',
      onClick: async ({ api }) => {
        const nextId = Math.max(...allRows.value.map((row) => row.id)) + 1
        allRows.value.unshift({
          ...allRows.value[0],
          id: nextId,
          code: `ORD-${String(nextId).padStart(4, '0')}`,
          customer: '新建客户',
          status: 'draft',
          priority: 'medium'
        })
        logEvent('headerActions.add -> refreshCreate')
        await api.refreshCreate()
      }
    },
    {
      type: 'delete',
      content: ({ selectedCount }: ArtTableQueryHeaderActionContext) =>
        `确认删除选中的 ${selectedCount} 条模拟数据吗？`,
      onClick: async ({ selectedRows: rows, api }) => {
        const ids = new Set(rows.map((row) => row.id))
        allRows.value = allRows.value.filter((row) => !ids.has(row.id))
        logEvent(`headerActions.delete -> ${rows.length} rows`)
        await api.refreshRemove()
      }
    },
    {
      type: 'import',
      importColumns: excelColumns,
      importRecordTransformer: (rows) =>
        rows.map((row, index) => ({
          ...row,
          id: Date.now() + index,
          status: row.status || 'draft',
          priority: row.priority || 'medium',
          enabled: true
        })),
      importApi: async (rows) => {
        allRows.value = [...(rows as DemoOrder[]), ...allRows.value]
        logEvent(`headerActions.import -> ${rows.length} rows`)
      },
      onImportSuccess: (rows) => {
        ElMessage.success(`导入成功：${rows.length} 行`)
      },
      onImportError: (error) => {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '导入失败，请检查文件后重试'))
      }
    },
    {
      type: 'export',
      exportFilename: ({ selectedCount }) =>
        selectedCount ? `ArtTableQuery-已选${selectedCount}行` : 'ArtTableQuery-全部数据',
      exportSheetName: '订单示例',
      exportColumns: excelColumns,
      exportMaxRows: 200,
      exportApi: ({ searchParams, maxRows }) => {
        const records = filterRows(searchParams as ManagedSearchModel).slice(0, maxRows)
        logEvent(`headerActions.exportApi -> ${records.length} rows`)
        return Promise.resolve({
          records,
          total: records.length,
          current: 1,
          size: records.length
        })
      }
    },
    {
      key: 'custom-slot-action',
      slot: 'custom-action',
      selectionRequired: true
    },
    {
      key: 'hidden-when-empty',
      label: '有选中才显示',
      icon: 'ri:eye-line',
      hidden: ({ selectedCount }) => selectedCount === 0,
      onClick: ({ selectedCount }) => logEvent(`dynamic hidden action -> ${selectedCount}`)
    },
    {
      key: 'disabled-demo',
      label: '最多选 2 行',
      icon: 'ri:lock-line',
      disabled: ({ selectedCount }) => selectedCount > 2,
      buttonProps: { type: 'info', plain: true },
      onClick: ({ selectedCount }) => logEvent(`dynamic disabled action -> ${selectedCount}`)
    }
  ])

  const managedColumnsFactory = (): ColumnOption<DemoOrder>[] => [
    { type: 'selection', width: 52, reserveSelection: true },
    { type: 'globalIndex', label: '序号', width: 72 },
    {
      prop: 'code',
      label: '订单号',
      width: 150,
      fixed: 'left',
      draggable: true,
      dragDisabled: (row) => row.status === 'done',
      dragIcon: 'ri:drag-move-2-fill'
    },
    { prop: 'customer', label: '客户', minWidth: 160, sortable: 'custom' },
    { prop: 'status', label: '状态', width: 110, useSlot: true, slotName: 'status' },
    { prop: 'priority', label: '优先级', width: 110, useSlot: true, slotName: 'priority' },
    {
      prop: 'amount',
      label: '金额',
      minWidth: 120,
      align: 'right',
      formatter: (row) => `￥${formatSensitiveCountValue(toDemoOrder(row).amount)}`
    },
    { prop: 'owner', label: '负责人', minWidth: 130 },
    { prop: 'city', label: '城市', width: 100 },
    { prop: 'createdAt', label: '创建日期', width: 120 },
    {
      prop: 'enabled',
      label: '启用',
      width: 90,
      formatter: (row) => (
        <ElTag type={toDemoOrder(row).enabled ? 'success' : 'info'} effect="plain">
          {toDemoOrder(row).enabled ? '启用' : '停用'}
        </ElTag>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 140,
      fixed: 'right',
      useSlot: true,
      slotName: 'operation',
      exportable: false
    }
  ]

  const managedResponseAdapter: ArtTableQueryResponseAdapter<DemoOrder, MockApiResponse> = (
    response
  ): ApiResponse<DemoOrder> => ({
    records: response.payload.items,
    total: response.payload.total,
    current: response.payload.page,
    size: response.payload.pageSize,
    source: response.meta.source
  })

  const managedDataTransformer = (rows: DemoOrder[]): DemoOrder[] => {
    return rows.map((row) => ({
      ...row,
      customer: row.enabled ? row.customer : `${row.customer}（停用）`
    }))
  }

  const fetchManagedRows = async (params: ManagedApiParams): Promise<MockApiResponse> => {
    await wait(180)
    const page = Number(params.page ?? 1)
    const pageSize = Number(params.pageSize ?? 20)
    const records = filterRows(params)
    return {
      payload: {
        items: records.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        total: records.length
      },
      meta: {
        source: 'mock',
        requestedAt: new Date().toISOString()
      }
    }
  }

  const filterRows = (params: ManagedSearchModel = {}): DemoOrder[] => {
    const keyword = params.keyword?.trim().toLowerCase()
    return allRows.value.filter((row) => {
      const matchKeyword =
        !keyword ||
        [row.code, row.customer, row.owner, row.city].some((value) =>
          value.toLowerCase().includes(keyword)
        )
      const matchStatus = !params.status || row.status === params.status
      const matchPriority =
        !params.priority || params.priority === 'all' || row.priority === params.priority
      const matchCity = !params.city || row.city === params.city
      const matchAmount = params.amountMin === undefined || row.amount >= params.amountMin
      const matchEnabled = params.enabled === undefined || row.enabled === params.enabled
      const [start, end] = params.dateRange ?? []
      const matchDate = (!start || row.createdAt >= start) && (!end || row.createdAt <= end)
      return (
        matchKeyword &&
        matchStatus &&
        matchPriority &&
        matchCity &&
        matchAmount &&
        matchEnabled &&
        matchDate
      )
    })
  }

  type ArtTableQueryMethod = {
    [Key in keyof ArtTableQueryExpose]: ArtTableQueryExpose[Key] extends () => unknown ? Key : never
  }[keyof ArtTableQueryExpose]

  const callExpose = async (method: ArtTableQueryMethod): Promise<void> => {
    logEvent(`expose.${method}()`)
    await managedTableRef.value?.[method]()
  }

  const markSelected = async (api: ArtTableQueryHeaderActionContext['api']): Promise<void> => {
    ElMessage.success(`已标记 ${selectedRows.value.length} 行`)
    await api.refreshUpdate()
  }

  const simulateUpdate = async (row: DemoOrder): Promise<void> => {
    row.status = row.status === 'done' ? 'processing' : 'done'
    logEvent(`row operation update -> ${row.code}`)
    await managedTableRef.value?.refreshUpdate()
  }

  const { confirmDelete } = useArtFeedback()

  const simulateRemove = async (row: DemoOrder): Promise<void> => {
    await confirmDelete(`确认删除 ${row.code} 吗？`, { title: '删除模拟数据' })
    allRows.value = allRows.value.filter((item) => item.id !== row.id)
    logEvent(`row operation remove -> ${row.code}`)
    await managedTableRef.value?.refreshRemove()
  }

  const handleManagedSearch = (params: Record<string, unknown>): void => {
    logEvent(`managed search -> ${JSON.stringify(params)}`)
  }

  const handleManagedSelectionChange = (rows: Record<string, unknown>[]): void => {
    selectedRows.value = rows.map(toDemoOrder)
    logEvent(`managed selection -> ${rows.length}`)
  }

  const handleHeaderActionClick = (action: ArtTableQueryHeaderAction): void => {
    logEvent(`header action click -> ${action.key ?? action.type ?? 'unknown'}`)
  }

  const handleManagedSuccess = (rows: Record<string, unknown>[]): void => {
    logEvent(`managed success -> ${rows.length} rows`)
  }

  const handleManagedCacheHit = (rows: Record<string, unknown>[]): void => {
    logEvent(`managed cache hit -> ${rows.length} rows`)
  }

  const handleManagedError = (error: { message: string }): void => {
    logEvent(`managed error -> ${error.message}`)
  }

  const handleRowDragStart = (): void => {
    logEvent('row drag start')
  }

  const handleRowDragUpdate = (): void => {
    logEvent('row drag update')
  }

  const handleRowDragEnd = async (payload: {
    row?: Record<string, unknown>
    oldIndex?: number
    newIndex?: number
  }): Promise<void> => {
    logEvent(`row drag end -> ${payload.oldIndex ?? '-'} to ${payload.newIndex ?? '-'}`)
    await managedTableRef.value?.refreshUpdate()
  }

  const getStatusMeta = (
    status: DemoStatus
  ): {
    label: string
    type: TagProps['type']
  } => {
    const map: Record<DemoStatus, { label: string; type: TagProps['type'] }> = {
      draft: { label: '草稿', type: 'info' },
      processing: { label: '处理中', type: 'warning' },
      done: { label: '已完成', type: 'success' },
      blocked: { label: '阻塞', type: 'danger' }
    }
    return map[status]
  }

  const getPriorityMeta = (
    priority: DemoOrder['priority']
  ): {
    label: string
    type: TagProps['type']
  } => {
    const map: Record<DemoOrder['priority'], { label: string; type: TagProps['type'] }> = {
      low: { label: '低', type: 'info' },
      medium: { label: '中', type: 'warning' },
      high: { label: '高', type: 'danger' }
    }
    return map[priority]
  }

  const wait = (duration: number): Promise<void> => {
    return new Promise((resolve) => window.setTimeout(resolve, duration))
  }

  let logId = 0
  const logEvent = (text: string): void => {
    eventLogs.value.unshift({
      id: ++logId,
      time: new Date().toLocaleTimeString(),
      text
    })
    eventLogs.value = eventLogs.value.slice(0, 60)
  }

  const controlledSearch = ref<ManagedSearchModel>({ priority: 'all' })
  const controlledShowSearchBar = ref(true)
  const controlledLoading = ref(false)
  const controlledData = ref<DemoOrder[]>([])
  const controlledColumnChecks = ref<ColumnOption<DemoOrder>[]>([])
  const controlledPagination = reactive({
    current: 1,
    size: 5,
    total: 0
  })

  const controlledSearchItems = computed<SearchFormItem[]>(() => [
    {
      label: '关键词',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '客户 / 订单号' }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      options: statusOptions,
      props: { clearable: true, placeholder: '请选择状态' }
    }
  ])

  const controlledColumns: ColumnOption<DemoOrder>[] = [
    { type: 'selection', width: 52 },
    { prop: 'code', label: '订单号', minWidth: 130 },
    { prop: 'customer', label: '客户', minWidth: 150 },
    { prop: 'status', label: '状态', width: 110, useSlot: true, slotName: 'status' },
    {
      prop: 'amount',
      label: '金额',
      width: 120,
      formatter: (row) => `￥${toDemoOrder(row).amount}`
    }
  ]

  const controlledTableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    height: 320,
    paginationOptions: {
      pageSizes: [5, 10, 20],
      align: 'right'
    }
  }

  const loadControlledData = async (): Promise<void> => {
    controlledLoading.value = true
    try {
      await wait(120)
      const records = filterRows(controlledSearch.value)
      controlledPagination.total = records.length
      controlledData.value = records.slice(
        (controlledPagination.current - 1) * controlledPagination.size,
        controlledPagination.current * controlledPagination.size
      )
      logEvent(`controlled load -> ${controlledData.value.length} rows`)
    } finally {
      controlledLoading.value = false
    }
  }

  const handleControlledSearch = (params: Record<string, unknown>): void => {
    controlledSearch.value = params as ManagedSearchModel
    controlledPagination.current = 1
    void loadControlledData()
  }

  const handleControlledReset = (): void => {
    controlledSearch.value = { priority: 'all' }
    controlledPagination.current = 1
    void loadControlledData()
  }

  const handleControlledSizeChange = (size: number): void => {
    controlledPagination.size = size
    controlledPagination.current = 1
    void loadControlledData()
  }

  const handleControlledCurrentChange = (page: number): void => {
    controlledPagination.current = page
    void loadControlledData()
  }

  onMounted(() => {
    void loadControlledData()
  })
</script>

<style scoped lang="scss">
  .table-query-widget {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 100%;

    &__toolbar {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    &__grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 16px;
      align-items: start;
    }

    &__log {
      min-width: 0;
    }

    &__log-item {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 0;
      border-bottom: 1px solid var(--el-border-color-lighter);

      span {
        flex: none;
        color: var(--el-text-color-secondary);
      }

      strong {
        min-width: 0;
        font-weight: 500;
        line-height: 20px;
        word-break: break-all;
      }
    }

    :deep(.el-table .is-high) {
      --el-table-tr-bg-color: var(--el-color-danger-light-9);
    }

    @media (width <= 1200px) {
      &__grid {
        grid-template-columns: 1fr;
      }
    }

    @media (width <= 768px) {
      &__toolbar {
        flex-direction: column;
        align-items: stretch;
      }
    }
  }
</style>
