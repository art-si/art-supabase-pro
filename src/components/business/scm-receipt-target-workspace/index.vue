<template>
  <ArtPermissionGuard :permission="viewPermission" :resource-name="title">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        density="compact"
        :eyebrow="kind === 'inbound' ? 'WAREHOUSE RECEIPTS' : 'ASSET PAYABLES'"
        :title="title"
        :description="description"
        :icon="kind === 'inbound' ? 'ri:inbox-archive-line' : 'ri:bill-line'"
        :tags="[
          { label: kind === 'inbound' ? '仓储管理' : '财务管理', type: 'primary' },
          { label: '收料通知单下推', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :search-items="searchItems"
        :api-fn="fetchPage"
        :columns-factory="columnsFactory"
        :columns-context-key="displayMode"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{
          span: 8,
          labelWidth: 82,
          defaultExpanded: kind === 'inbound',
          showExpand: kind === 'inbound'
        }"
        :table-props="{
          rowKey: getDocumentDetailRowKey,
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          emptyText: `暂无${title}`,
          emptyDescription: '从已确认的收料通知单选择明细下推后，会在这里生成草稿。'
        }"
        focusable
      >
        <template #search-displayMode>
          <ElRadioGroup
            v-model="displayMode"
            aria-label="单据列表展示方式"
            @change="tableRef?.refreshContext()"
          >
            <ElRadioButton label="document" value="document">按单据</ElRadioButton>
            <ElRadioButton label="line" value="line">按明细</ElRadioButton>
          </ElRadioGroup>
        </template>
        <template v-if="kind === 'asset_payable'" #empty>
          <ArtEmptyState
            title="暂无资产应付"
            description="从已确认的收料通知单选择明细下推后，会在这里生成草稿。"
          >
            <ElButton
              v-if="router.hasRoute('ScmReceiptNotice') && hasAuth('ScmReceiptNotice:View')"
              v-auth="'ScmReceiptNotice:View'"
              type="primary"
              plain
              @click="router.push({ name: 'ScmReceiptNotice' })"
            >
              <ArtSvgIcon icon="ri:inbox-archive-line" aria-hidden="true" />
              去收料通知单
            </ElButton>
          </ArtEmptyState>
        </template>
      </ArtTableQuery>
      <ArtDrawer ref="detailRef" size="lg" :show-footer="false" @close="closeDetail">
        <ArtAsyncState :error="detailError" error-title="单据明细加载失败" @retry="loadDetail">
          <div v-if="activeDocument" class="receipt-target-detail grid-cols-1">
            <ArtSectionCard v-if="kind === 'asset_payable'" title="应付概览">
              <ArtDescriptions
                :data="activeDocument"
                :items="payableDescriptionItems"
                :columns="2"
                :label-width="96"
              />
            </ArtSectionCard>
            <div v-else class="receipt-target-detail__summary">
              <div>
                <span>{{ title }}单号</span>
                <strong>{{ activeDocument.documentNo }}</strong>
                <small>来源通知单：{{ activeDocument.source?.documentNo || '—' }}</small>
                <small>项目：{{ activeDocument.project?.projectName || '—' }}</small>
                <small v-if="kind === 'inbound'"
                  >施工号：{{ activeDocument.constructionNo || '待指定' }}</small
                >
                <small>供应商：{{ activeDocument.supplier?.supplierName || '—' }}</small>
              </div>
              <ElTag :type="activeDocument.status === 'draft' ? 'warning' : 'success'">
                {{ statusLabel(activeDocument.status) }}
              </ElTag>
            </div>
            <div
              v-if="
                kind === 'inbound' && activeDocument.projectId && activeDocument.status === 'draft'
              "
              class="flex min-w-0 flex-wrap items-end gap-3 rounded-lg bg-[var(--el-fill-color-light)] p-3"
            >
              <label class="grid min-w-[220px] flex-1 gap-1 text-sm">
                <span class="text-[var(--el-text-color-secondary)]">项目施工号</span>
                <ElSelect
                  v-model="selectedConstructionNo"
                  filterable
                  :disabled="!canAssignScope || savingScope"
                  placeholder="选择本项目施工号"
                >
                  <ElOption
                    v-for="section in projectSections"
                    :key="section.constructionNo"
                    :label="`${section.constructionNo} · ${section.sectionName}`"
                    :value="section.constructionNo"
                    :disabled="section.status !== 'active'"
                  />
                </ElSelect>
              </label>
              <ElButton
                v-if="scopePermission"
                v-auth="scopePermission"
                :disabled="
                  !selectedConstructionNo ||
                  selectedConstructionNo === activeDocument.constructionNo
                "
                :loading="savingScope"
                @click="saveScope"
                >保存施工号</ElButton
              >
              <span v-if="!canAssignScope" class="text-xs text-[var(--el-text-color-secondary)]">
                当前账号仅可查看施工号
              </span>
            </div>
            <ArtTable
              class="min-w-0 max-w-full"
              :border="false"
              :data="activeLines"
              :columns="lineColumns"
              :pagination="false"
              row-key="id"
              table-layout="fixed"
              height="auto"
              empty-text="暂无明细"
            />
            <div v-if="kind === 'asset_payable'" class="receipt-target-detail__total">
              应付金额 <strong>{{ formatCurrencyValue(activeDocument.totalAmount) }}</strong>
            </div>
          </div>
        </ArtAsyncState>
      </ArtDrawer>
      <ReceiptSerialDialog ref="serialDialogRef" @success="reloadActiveLines" />
      <ReceiptBinDialog v-if="kind === 'inbound'" ref="binDialogRef" @success="reloadActiveLines" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
  import { storeToRefs } from 'pinia'
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import { formatCurrencyValue, formatDateTimeValue } from '@/utils/ui/format'
  import { buildSupabasePageRange } from '@/utils/supabase/pagination'
  import {
    getDocumentDetailRowKey,
    documentGroupSpan,
    expandDocumentLines,
    loadAllDocumentPages,
    paginateDetailRows
  } from '@/utils/business/document-detail-list'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import {
    fetchScmReceiptTargets,
    fetchScmReceiptTargetLines,
    fetchScmReceiptTargetLinesForDocuments,
    fetchScmReceiptProjectOptions,
    fetchScmReceiptProjectSections,
    setScmReceiptScope,
    transitionScmReceiptTarget,
    type ScmReceiptTargetDocument,
    type ScmReceiptTargetKind,
    type ScmReceiptTargetLine,
    type ScmReceiptTargetListLine,
    type ScmReceiptProjectOption,
    type ScmReceiptTargetQuery,
    type ScmReceiptTargetStatus
  } from '@/api/scm-receipt-target'
  import ReceiptSerialDialog from './modules/receipt-serial-dialog.vue'
  import ReceiptBinDialog from './modules/receipt-bin-dialog.vue'

  defineOptions({ name: 'ScmReceiptTargetWorkspace' })
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  const props = defineProps<{
    kind: ScmReceiptTargetKind
    viewPermission: string
    actionPermission: string
    scopePermission?: string
    serialPermission?: string
    binPermission?: string
  }>()
  const title = computed(() => (props.kind === 'inbound' ? '收料入库' : '资产应付'))
  const inboundStatusOptions = useDictionaryOptions('scmReceiptInboundStatus')
  const payableStatusOptions = useDictionaryOptions('scmAssetPayableStatus')
  const statusOptions = computed(() =>
    props.kind === 'inbound' ? inboundStatusOptions : payableStatusOptions
  )
  const description = computed(() =>
    props.kind === 'inbound'
      ? '核对收料明细的仓库、批号与库存数量，确认后写入库存台账和流水。'
      : '核对收料明细与应付金额，审核后形成资产应付记录。'
  )
  const viewPermission = computed(() => props.viewPermission)
  const actionPermission = computed(() => props.actionPermission)
  const scopePermission = computed(() => props.scopePermission)
  const serialPermission = computed(() => props.serialPermission)
  const binPermission = computed(() => props.binPermission)
  const { hasAuth } = useAuth()
  const canAssignScope = computed(() =>
    Boolean(props.scopePermission && hasAuth(props.scopePermission))
  )
  const route = useRoute()
  const router = useRouter()
  const { confirmAction } = useArtFeedback()
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const { effectiveTenantId, tenantOptions } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  type ReceiptTargetListRow = ScmReceiptTargetDocument & {
    detailRowId?: string
    detailLine?: ScmReceiptTargetListLine
    detailGroupStart?: boolean
  }
  const visibleRows = ref<ReceiptTargetListRow[]>([])
  const lineProperties = new Set([
    'detailLineNo',
    'detailMaterialCode',
    'detailMaterialDescription',
    'detailQuantity',
    'detailStockQuantity',
    'detailStockUnit',
    'detailWarehouse',
    'detailBatchNo',
    'detailAmount'
  ])
  function mergeDocumentCells({
    rowIndex,
    column
  }: {
    rowIndex: number
    column: { property?: string }
  }) {
    return displayMode.value === 'line'
      ? documentGroupSpan(visibleRows.value, rowIndex, column.property, lineProperties)
      : ([1, 1] as [number, number])
  }
  const detailRef = ref<ArtDrawerExpose<ScmReceiptTargetDocument>>()
  const serialDialogRef = ref<InstanceType<typeof ReceiptSerialDialog>>()
  const binDialogRef = ref<InstanceType<typeof ReceiptBinDialog>>()
  const activeDocument = ref<ScmReceiptTargetDocument>()
  const payableDescriptionItems: ArtDescriptionItem<ScmReceiptTargetDocument>[] = [
    { key: 'documentNo', field: 'documentNo', label: '应付单号', copyable: true },
    {
      key: 'status',
      label: '状态',
      render: (_, row) => (
        <ElTag type={row.status === 'draft' ? 'warning' : 'success'}>
          {statusLabel(row.status)}
        </ElTag>
      )
    },
    {
      key: 'sourceNo',
      label: '来源通知单',
      value: (row: ScmReceiptTargetDocument) => row.source?.documentNo
    },
    {
      key: 'projectName',
      label: '项目',
      value: (row: ScmReceiptTargetDocument) => row.project?.projectName
    },
    {
      key: 'supplierName',
      label: '供应商',
      value: (row: ScmReceiptTargetDocument) => row.supplier?.supplierName,
      span: 2
    },
    {
      key: 'totalAmount',
      label: '应付金额',
      value: (row: ScmReceiptTargetDocument) => formatCurrencyValue(row.totalAmount)
    },
    {
      key: 'createdAt',
      label: '创建时间',
      value: (row: ScmReceiptTargetDocument) => formatDateTimeValue(row.createdAt)
    }
  ]
  const activeLines = ref<ScmReceiptTargetLine[]>([])
  const detailError = ref('')
  const projectSections = ref<
    Array<{ constructionNo: string; sectionName: string; status: 'active' | 'closed' }>
  >([])
  const selectedConstructionNo = ref('')
  const projectOptions = ref<ScmReceiptProjectOption[]>([])
  const filterSections = ref<
    Array<{ constructionNo: string; sectionName: string; status: 'active' | 'closed' }>
  >([])
  const sectionsLoading = ref(false)
  const savingScope = ref(false)
  const search = ref<ScmReceiptTargetQuery>({ keyword: '' })
  const searchItems = computed<SearchFormItem[]>(() => [
    { label: '展示方式', key: 'displayMode', type: 'text' },
    ...(isPlatformSuper.value && !effectiveTenantId.value
      ? [
          {
            label: '所属租户',
            key: 'tenantId',
            type: 'select' as const,
            props: {
              clearable: true,
              filterable: true,
              onChange: () => {
                search.value.projectId = undefined
                search.value.constructionNo = undefined
              },
              options: tenantOptions.value.map((item) => ({
                label: `${item.tenantName}（${item.tenantCode}）`,
                value: item.id
              }))
            }
          }
        ]
      : []),
    {
      label: '单据编号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: `搜索${title.value}单号` }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        options: statusOptions.value
      }
    },
    ...(props.kind === 'inbound'
      ? [
          {
            label: '项目名称',
            key: 'projectId',
            type: 'select' as const,
            props: {
              clearable: true,
              filterable: true,
              placeholder: '全部项目',
              onChange: () => (search.value.constructionNo = undefined),
              options: projectOptions.value
                .filter(
                  (row) => !effectiveTenantId.value || row.tenantId === effectiveTenantId.value
                )
                .filter((row) => !search.value.tenantId || row.tenantId === search.value.tenantId)
                .map((row) => {
                  const tenantName =
                    isPlatformSuper.value && !effectiveTenantId.value && !search.value.tenantId
                      ? tenantOptions.value.find((tenant) => tenant.id === row.tenantId)?.tenantName
                      : undefined
                  return {
                    label: `${row.projectName} · ${row.projectCode}${tenantName ? ` · ${tenantName}` : ''}`,
                    value: row.id
                  }
                })
            }
          },
          {
            label: '施工号',
            key: 'constructionNo',
            type: 'select' as const,
            props: {
              clearable: true,
              filterable: true,
              loading: sectionsLoading.value,
              disabled: !search.value.projectId,
              placeholder: search.value.projectId ? '全部施工号' : '请先选项目',
              options: filterSections.value.map((row) => ({
                label: `${row.constructionNo} · ${row.sectionName}`,
                value: row.constructionNo
              }))
            }
          }
        ]
      : [])
  ])
  let sectionRequest = 0
  watch(
    () => search.value.projectId,
    async (projectId) => {
      const request = ++sectionRequest
      filterSections.value = []
      if (!projectId || props.kind !== 'inbound') return
      sectionsLoading.value = true
      try {
        const sections = await fetchScmReceiptProjectSections(projectId)
        if (request === sectionRequest) filterSections.value = sections
      } catch {
        // API 层已显示错误；保持空选项，允许重新选择项目后重试。
      } finally {
        if (request === sectionRequest) sectionsLoading.value = false
      }
    }
  )
  let projectRequest = 0
  async function loadProjectOptions(): Promise<void> {
    if (props.kind !== 'inbound') return
    const request = ++projectRequest
    try {
      const options = await fetchScmReceiptProjectOptions()
      if (request === projectRequest) projectOptions.value = options
    } catch {
      // API 层已提示加载失败，单号和状态查询仍可使用。
    }
  }
  watch(effectiveTenantId, () => {
    search.value.projectId = undefined
    search.value.constructionNo = undefined
    projectOptions.value = []
    void loadProjectOptions()
  })
  onMounted(() => void loadProjectOptions())
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      permission: viewPermission.value,
      type: 'export',
      exportFilename: title.value,
      exportSheetName: title.value,
      exportColumns: [
        { key: 'documentNo', title: `${title.value}单号` },
        { key: 'sourceNo', title: '来源通知单' },
        { key: 'projectName', title: '项目名称' },
        { key: 'constructionNo', title: '施工号' },
        { key: 'supplierName', title: '供应商全称' },
        { key: 'statusName', title: '状态' },
        { key: 'totalAmount', title: '金额' },
        { key: 'createdAt', title: '创建时间' }
      ],
      exportData: async () => {
        const documents = await loadAllDocumentPages(
          (page) => fetchScmReceiptTargets(props.kind, page),
          {
            ...search.value,
            tenantId: effectiveTenantId.value || search.value.tenantId
          }
        )
        return documents.map((row) => ({
          ...row,
          sourceNo: row.source?.documentNo || '',
          projectName: row.project?.projectName || '',
          supplierName: row.supplier?.supplierName || '',
          statusName: statusLabel(row.status)
        }))
      }
    }
  ])
  function statusLabel(status: ScmReceiptTargetStatus) {
    return (
      statusOptions.value.find((item) => item.value === status)?.label ??
      (status === 'draft' ? '草稿' : status === 'confirmed' ? '已入库' : '已审核')
    )
  }
  async function fetchPage(query: ScmReceiptTargetQuery & { current: number; size: number }) {
    const pageQuery = { ...query, ...buildSupabasePageRange(query) }
    const fetchDocuments = async (page: ScmReceiptTargetQuery) => {
      const result = await fetchScmReceiptTargets(props.kind, {
        ...page,
        tenantId: effectiveTenantId.value || page.tenantId
      })
      if (result.error) throw result.error
      return result
    }
    if (displayMode.value === 'document') {
      visibleRows.value = []
      return fetchDocuments(pageQuery)
    }
    const documents = await loadAllDocumentPages(fetchDocuments, pageQuery)
    await loadUnitDisplayNames(documents.map((document) => document.tenantId))
    const lines = await fetchScmReceiptTargetLinesForDocuments(
      documents.map((document) => document.id)
    )
    const linesByDocument = new Map<string, ScmReceiptTargetListLine[]>()
    for (const line of lines) {
      const group = linesByDocument.get(line.targetDocumentId) || []
      group.push(line)
      linesByDocument.set(line.targetDocumentId, group)
    }
    const rows = expandDocumentLines(
      documents,
      (document) => linesByDocument.get(document.id) || [],
      (line) => line.id
    )
    const result = { ...paginateDetailRows(rows, pageQuery.from, pageQuery.to), error: null }
    visibleRows.value = result.data
    return result
  }
  let detailGeneration = 0
  let scopeSaveGeneration = 0
  function closeDetail(): void {
    detailGeneration++
    scopeSaveGeneration++
    activeDocument.value = undefined
    activeLines.value = []
    projectSections.value = []
    detailError.value = ''
    savingScope.value = false
  }
  async function loadDetail(): Promise<void> {
    const row = activeDocument.value
    if (!row) return
    const generation = ++detailGeneration
    detailRef.value?.setLoading(true)
    detailError.value = ''
    activeLines.value = []
    projectSections.value = []
    try {
      const [{ data }, sections] = await Promise.all([
        fetchScmReceiptTargetLines(row.id),
        props.kind === 'inbound' && row.projectId
          ? fetchScmReceiptProjectSections(row.projectId)
          : Promise.resolve([])
      ])
      if (generation !== detailGeneration || activeDocument.value?.id !== row.id) return
      activeLines.value = data ?? []
      projectSections.value = sections
    } catch (error) {
      if (generation === detailGeneration && activeDocument.value?.id === row.id)
        detailError.value = getFriendlySupabaseErrorMessage(error, '单据明细加载失败，请重试')
    } finally {
      if (generation === detailGeneration) detailRef.value?.setLoading(false)
    }
  }
  async function openDetail(row: ScmReceiptTargetDocument) {
    const generation = ++detailGeneration
    scopeSaveGeneration++
    savingScope.value = false
    await loadUnitDisplayNames([row.tenantId])
    if (generation !== detailGeneration) return
    activeDocument.value = row
    activeLines.value = []
    projectSections.value = []
    detailError.value = ''
    selectedConstructionNo.value = row.constructionNo ?? ''
    await detailRef.value?.handleOpen(row, {
      title: props.kind === 'asset_payable' ? '资产应付详情' : row.documentNo,
      ...(props.kind === 'asset_payable'
        ? { headerIcon: 'ri:bill-line', subtitle: row.documentNo }
        : {}),
      loading: true,
      loadingText: '正在加载单据明细…',
      onOpen: loadDetail
    })
  }
  onMounted(async () => {
    const targetId = route.query.targetId
    if (
      typeof targetId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) ||
      !hasAuth(viewPermission.value)
    )
      return
    try {
      const { data } = await fetchScmReceiptTargets(props.kind, {
        id: targetId,
        tenantId: effectiveTenantId.value || undefined,
        from: 0,
        to: 0
      })
      const document = data?.[0]
      if (!document) return
      await openDetail(document)
      await router.replace({ path: route.path, query: { ...route.query, targetId: undefined } })
    } catch {
      // API provider 已提示加载错误；保留目标 ID 以便刷新后重试。
    }
  })
  function openSerialDialog(line: ScmReceiptTargetLine): void {
    if (
      !serialPermission.value ||
      !hasAuth(serialPermission.value) ||
      !activeDocument.value ||
      activeDocument.value.status !== 'draft'
    )
      return
    void serialDialogRef.value?.handleOpen({ documentNo: activeDocument.value.documentNo, line })
  }
  function openBinDialog(line: ScmReceiptTargetLine): void {
    if (!activeDocument.value || activeDocument.value.status !== 'draft') return
    void binDialogRef.value?.handleOpen({
      tenantId: activeDocument.value.tenantId,
      documentNo: activeDocument.value.documentNo,
      line
    })
  }
  async function reloadActiveLines(): Promise<void> {
    await loadDetail()
  }
  async function saveScope() {
    const document = activeDocument.value
    if (!canAssignScope.value || !document || !selectedConstructionNo.value || savingScope.value)
      return
    const constructionNo = selectedConstructionNo.value
    const generation = ++scopeSaveGeneration
    savingScope.value = true
    try {
      await setScmReceiptScope(document.id, constructionNo)
      if (generation !== scopeSaveGeneration || activeDocument.value?.id !== document.id) return
      document.constructionNo = constructionNo
      await tableRef.value?.refreshUpdate()
    } catch {
      /* API 边界已展示中文业务错误，保留抽屉便于修改重试。 */
    } finally {
      if (generation === scopeSaveGeneration) savingScope.value = false
    }
  }
  async function complete(row: ScmReceiptTargetDocument) {
    try {
      const action = props.kind === 'inbound' ? '确认入库' : '审核应付'
      await confirmAction(`确定对“${row.documentNo}”执行${action}吗？`, action, {
        type: 'warning',
        confirmButtonText: action,
        cancelButtonText: '取消'
      })
      await transitionScmReceiptTarget(row.id, props.kind)
      await tableRef.value?.refreshUpdate()
    } catch {
      /* 用户取消或 API 已提示错误。 */
    }
  }
  function columnsFactory(): ColumnOption<ReceiptTargetListRow>[] {
    return [
      {
        prop: 'documentNo',
        label: `${title.value}单号`,
        minWidth: 205,
        fixed: 'left',
        formatter: (row) => (
          <button
            type="button"
            class="font-semibold text-[var(--el-color-primary)] hover:underline focus-visible:outline-2"
            onClick={() => void openDetail(row)}
          >
            {row.documentNo}
          </button>
        )
      },
      {
        prop: 'source',
        label: '来源通知单',
        minWidth: 190,
        formatter: (row) => row.source?.documentNo || '—'
      },
      {
        prop: 'project',
        label: '项目名称',
        minWidth: 170,
        formatter: (row) => row.project?.projectName || '—'
      },
      ...(props.kind === 'inbound'
        ? [
            {
              prop: 'constructionNo',
              label: '施工号',
              minWidth: 150,
              formatter: (row: ScmReceiptTargetDocument) => row.constructionNo || '待指定'
            } as ColumnOption<ScmReceiptTargetDocument>
          ]
        : []),
      {
        prop: 'supplier',
        label: '供应商全称',
        minWidth: 185,
        formatter: (row) => row.supplier?.supplierName || '—'
      },
      {
        prop: 'status',
        label: '状态',
        width: 110,
        formatter: (row) => (
          <ElTag size="small" type={row.status === 'draft' ? 'warning' : 'success'}>
            {statusLabel(row.status)}
          </ElTag>
        )
      },
      {
        prop: 'totalAmount',
        label: '金额',
        minWidth: 140,
        align: 'right',
        formatter: (row) => formatCurrencyValue(row.totalAmount)
      },
      {
        prop: 'createdAt',
        label: '创建时间',
        minWidth: 180,
        formatter: (row) => formatDateTimeValue(row.createdAt)
      },
      ...(displayMode.value === 'line'
        ? [
            {
              prop: 'detailLineNo',
              label: '明细行号',
              width: 90,
              formatter: (row: ReceiptTargetListRow) => row.detailLine?.lineSnapshot.lineNo ?? '—'
            },
            {
              prop: 'detailMaterialCode',
              label: '物料编码',
              minWidth: 145,
              formatter: (row: ReceiptTargetListRow) =>
                row.detailLine?.lineSnapshot.materialCode || '—'
            },
            {
              prop: 'detailMaterialDescription',
              label: '物料描述',
              minWidth: 190,
              formatter: (row: ReceiptTargetListRow) =>
                row.detailLine?.lineSnapshot.materialDescription || '—'
            },
            {
              prop: 'detailQuantity',
              label: '数量',
              width: 105,
              align: 'right' as const,
              formatter: (row: ReceiptTargetListRow) => row.detailLine?.lineSnapshot.quantity ?? 0
            },
            {
              prop: 'detailStockQuantity',
              label: '库存数量',
              width: 110,
              align: 'right' as const,
              formatter: (row: ReceiptTargetListRow) =>
                row.detailLine?.lineSnapshot.stockQuantity ?? 0
            },
            {
              prop: 'detailStockUnit',
              label: '库存单位',
              width: 100,
              formatter: (row: ReceiptTargetListRow) =>
                unitDisplayName(row.tenantId, row.detailLine?.lineSnapshot.stockUnit)
            },
            {
              prop: 'detailWarehouse',
              label: '仓库 / 仓位',
              minWidth: 160,
              formatter: (row: ReceiptTargetListRow) =>
                [row.detailLine?.lineSnapshot.warehouse, row.detailLine?.lineSnapshot.location]
                  .filter(Boolean)
                  .join(' / ') || '—'
            },
            {
              prop: 'detailBatchNo',
              label: '批号',
              minWidth: 125,
              formatter: (row: ReceiptTargetListRow) => row.detailLine?.lineSnapshot.batchNo || '—'
            },
            {
              prop: 'detailAmount',
              label: '明细金额',
              width: 140,
              align: 'right' as const,
              formatter: (row: ReceiptTargetListRow) =>
                formatCurrencyValue(row.detailLine?.amount ?? 0)
            }
          ]
        : []),
      {
        prop: 'actions',
        label: '操作',
        width: 170,
        fixed: 'right',
        formatter: (row) => (
          <div class="flex items-center gap-2">
            <ArtButtonTable
              type="view"
              label="查看"
              permission={viewPermission.value}
              onClick={() => void openDetail(row)}
            />
            {row.status === 'draft' && hasAuth(actionPermission.value) ? (
              <ArtButtonTable
                type="sign"
                icon="ri:check-line"
                label={props.kind === 'inbound' ? '确认入库' : '审核应付'}
                permission={actionPermission.value}
                showLabel
                onClick={() => void complete(row)}
              />
            ) : null}
          </div>
        )
      }
    ]
  }
  const lineColumns = computed<ColumnOption<ScmReceiptTargetLine>[]>(() => [
    ...(props.kind === 'inbound'
      ? [
          {
            prop: 'location',
            label: '入库库位',
            minWidth: 190,
            fixed: 'left',
            formatter: (row: ScmReceiptTargetLine) => (
              <div class="flex min-w-0 items-center gap-2">
                <span class="min-w-0 truncate" title={row.lineSnapshot.location || '待核对'}>
                  {row.lineSnapshot.location || '待核对'}
                </span>
                {activeDocument.value?.status === 'draft' &&
                binPermission.value &&
                hasAuth(binPermission.value) ? (
                  <ArtButtonTable
                    type="edit"
                    icon="ri:map-pin-2-line"
                    label="指定入库库位"
                    permission={binPermission.value}
                    onClick={() => openBinDialog(row)}
                  />
                ) : null}
              </div>
            )
          } as ColumnOption<ScmReceiptTargetLine>
        ]
      : []),
    {
      prop: 'lineNo',
      label: '行号',
      width: 80,
      formatter: (row) => row.lineSnapshot.lineNo || '—'
    },
    {
      prop: 'materialCode',
      label: '物料编码',
      minWidth: 130,
      formatter: (row) => row.lineSnapshot.materialCode || '—'
    },
    {
      prop: 'materialDescription',
      label: '物料名称',
      minWidth: 190,
      formatter: (row) => row.lineSnapshot.materialDescription || '—'
    },
    {
      prop: 'quantity',
      label: '收料数量',
      minWidth: 105,
      formatter: (row) => row.lineSnapshot.quantity || 0
    },
    {
      prop: 'stockQuantity',
      label: '库存数量',
      minWidth: 105,
      formatter: (row) => row.lineSnapshot.stockQuantity || 0
    },
    {
      prop: 'stockUnit',
      label: '库存单位',
      minWidth: 95,
      formatter: (row) =>
        unitDisplayName(activeDocument.value?.tenantId || '', row.lineSnapshot.stockUnit)
    },
    {
      prop: 'warehouse',
      label: '仓库',
      minWidth: 125,
      formatter: (row) => row.lineSnapshot.warehouse || '—'
    },
    {
      prop: 'batchNo',
      label: '批号',
      minWidth: 155,
      formatter: (row) => row.lineSnapshot.batchNo || '—'
    },
    ...(props.kind === 'inbound'
      ? [
          {
            prop: 'serialNos',
            label: '序列号',
            minWidth: 154,
            formatter: (row: ScmReceiptTargetLine) =>
              row.serialManagementEnabled ? (
                activeDocument.value?.status === 'draft' &&
                serialPermission.value &&
                hasAuth(serialPermission.value) ? (
                  <ArtButtonTable
                    type="edit"
                    icon="ri:qr-scan-2-line"
                    label={`录入 SN (${row.serialNos?.length || 0})`}
                    showLabel
                    permission={serialPermission.value}
                    onClick={() => openSerialDialog(row)}
                  />
                ) : (
                  `${row.serialNos?.length || 0} 件 SN`
                )
              ) : (
                '—'
              )
          } as ColumnOption<ScmReceiptTargetLine>
        ]
      : []),
    {
      prop: 'amount',
      label: '价税合计',
      minWidth: 135,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.amount)
    }
  ])
</script>

<style scoped lang="scss">
  .receipt-target-detail {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .receipt-target-detail__summary {
    display: flex;
    gap: 16px;
    align-items: start;
    justify-content: space-between;
    padding: 16px;
    background: var(--el-fill-color-light);
    border-radius: 8px;

    > div {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    span,
    small {
      color: var(--el-text-color-secondary);
    }

    strong {
      overflow-wrap: anywhere;
    }
  }

  .receipt-target-detail__total {
    justify-self: end;
    color: var(--el-text-color-secondary);

    strong {
      margin-left: 12px;
      color: var(--el-text-color-primary);
    }
  }
</style>
