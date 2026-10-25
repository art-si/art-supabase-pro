<template>
  <ArtPermissionGuard :permission="permission.View" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <MasterDeleteProcessingNotice
        v-if="deleteContext.active"
        :location-ready="Boolean(locatedDocumentId && locatedDocumentId === matchedDocumentId)"
        action-hint="请核对关联采购单据，处理完成后返回原页面重新检查引用。"
      />
      <BusinessWorkspaceHeader
        class="wms-initialization-header"
        :eyebrow="isInitial ? 'OPENING PURCHASE DOCUMENT' : 'INBOUND INVENTORY DOCUMENT'"
        :title="title"
        :description="description"
        :icon="isReturn ? 'ri:inbox-unarchive-line' : 'ri:inbox-archive-line'"
        density="compact"
        :tags="[
          { label: isInitial ? '初始化单据' : businessTag, type: 'primary' },
          { label: '税价联动', type: 'success' },
          { label: '物料与项目', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        :model-value="search"
        @update:model-value="replaceReactiveModel(search, $event)"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :columns-context-key="displayMode"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 5, labelWidth: 76 }"
        :table-props="{
          rowKey: 'lineId',
          spanMethod: mergeDocumentCells,
          tableLayout: 'fixed',
          cellClassName: purchaseCellClassName,
          emptyText: deleteContext.active ? '未找到可查看的目标采购单据' : `当前范围暂无${title}`,
          emptyDescription: deleteContext.active
            ? '请核对单据类型、租户范围和查看权限，可重试或清除定位。'
            : '新建单据并选择物料，填写数量、价格与仓储信息。'
        }"
        focusable
        @selection-change="onSelectionChange"
      >
        <template #purchase-payable-push="{ selectedRows: rows }">
          <ElDropdown
            trigger="click"
            :disabled="pushingPayable || !rows.length"
            @command="(kind) => pushPayable(kind, rows)"
          >
            <ElButton
              v-auth="permission.Push"
              type="primary"
              plain
              :loading="pushingPayable"
              :disabled="!rows.length"
              ><ArtSvgIcon icon="ri:file-transfer-line" /> 下推
              <ArtSvgIcon icon="ri:arrow-down-s-line"
            /></ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="estimated"
                  ><ArtSvgIcon icon="ri:bill-line" />暂估应付单</ElDropdownItem
                ><ElDropdownItem command="financial"
                  ><ArtSvgIcon icon="ri:money-dollar-circle-line" />财务应付单</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
        <template #other-return-push="{ selectedRows: rows }">
          <ElDropdown
            trigger="click"
            :disabled="!canPrepareOtherReturn(rows)"
            @command="prepareOtherReturn(rows)"
          >
            <ElButton
              v-auth="permission.Push"
              type="primary"
              plain
              :disabled="!canPrepareOtherReturn(rows)"
            >
              <ArtSvgIcon icon="ri:file-transfer-line" /> 下推
              <ArtSvgIcon icon="ri:arrow-down-s-line" />
            </ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="return"
                  ><ArtSvgIcon icon="ri:inbox-unarchive-line" />其他入库退回</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
        <template #search-displayMode>
          <ElRadioGroup v-model="displayMode" aria-label="单据列表展示方式" @change="refresh">
            <ElRadioButton label="document" value="document">按单据</ElRadioButton>
            <ElRadioButton label="line" value="line">按明细</ElRadioButton>
          </ElRadioGroup>
        </template>
      </ArtTableQuery>
      <WmsPurchaseDocumentDrawer
        ref="drawerRef"
        :kind="kind"
        :permission-prefix="permission.View.split(':')[0]"
        :import-permission="permission.Import"
        @success="refresh"
      />
      <WmsPurchaseDocumentDrawer
        v-if="kind === 'other_inbound'"
        ref="returnDrawerRef"
        kind="other_return"
        :permission-prefix="permission.View.split(':')[0]"
        :import-permission="permission.Import"
        @success="refresh"
      />
      <WmsPurchaseDocumentDrawer
        v-if="isEntrustedProcessing"
        ref="entrustedTargetDrawerRef"
        :kind="entrustedTargetKind"
        :permission-prefix="permission.View.split(':')[0]"
        :import-permission="permission.Import"
        @success="refresh"
      />
      <ArtDialog ref="pushDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:file-transfer-line"
          eyebrow="DOCUMENT PUSH"
          :title="
            isInitial
              ? '下推期初暂估应付'
              : isEntrustedProcessing
                ? '下推受托加工后续业务'
                : isReturn
                  ? '下推采购退货业务'
                  : '下推采购入库业务'
          "
          :description="
            isInitial
              ? '登记上线前未结清暂估应付；退货冲减应付，不影响库存。可在结束初始化的对账表核对。'
              : isEntrustedProcessing
                ? '勾选一张已审核单据，生成对应的受托收料或退料草稿。'
                : '选择后续业务目标。目标模块接入后将按当前已审核单据生成关联草稿。'
          "
        />
        <div v-if="isInitial" class="mt-5">
          <ElButton
            type="primary"
            class="w-full!"
            :loading="pushingInitialObligation"
            @click="pushInitialObligation"
            >{{ isReturn ? '期初暂估应付冲减' : '期初暂估应付单' }}</ElButton
          >
        </div>
        <div v-else-if="isEntrustedProcessing" class="mt-5">
          <ElButton type="primary" class="w-full!" @click="pushEntrustedCounterpart">
            {{ kind === 'entrusted_processing_inbound' ? '受托退料' : '受托收料' }}
          </ElButton>
        </div>
        <div v-else class="mt-5 grid gap-3 sm:grid-cols-2">
          <ElButton disabled class="w-full!">{{
            isReturn ? '暂估应付冲销' : '暂估应付单'
          }}</ElButton>
          <ElButton disabled class="w-full!">{{ isReturn ? '其他出库单' : '到货确认单' }}</ElButton>
        </div>
      </ArtDialog>
      <MasterDataDeleteGuard ref="deleteGuardRef" />
      <PurchasePrintSheet ref="printSheetRef" />
      <ArtDialog ref="payableResultRef" size="md" :show-footer="false">
        <ArtEntitySummary
          icon="ri:bill-line"
          title="应付单已生成"
          description="所选入库明细已带入应付草稿，重复下推会由服务端阻止。"
        />
        <div class="mt-4 grid gap-3">
          <div
            v-for="record in generatedPayables"
            :key="record.id"
            class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--el-border-color)] p-4"
          >
            <div
              ><strong>{{ record.documentNo }}</strong
              ><p class="text-sm text-[var(--el-text-color-secondary)]"
                >{{ record.supplierName }} · {{ record.lines.length }} 行 ·
                {{ formatCurrencyValue(record.totalAmount) }}</p
              ></div
            >
            <ElButton
              v-if="
                hasAuth(
                  record.kind === 'estimated'
                    ? 'FinanceEstimatedPayable:View'
                    : 'FinancePurchasePayable:View'
                )
              "
              @click="
                router.push({
                  name:
                    record.kind === 'estimated'
                      ? 'FinanceEstimatedPayable'
                      : 'FinancePurchasePayable',
                  query: { recordId: record.id }
                })
              "
              >查看应付单</ElButton
            >
          </div>
        </div>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useAssistantPage } from '@/hooks/core/useAssistantPage'
  import { wmsDocumentClassificationColumns } from '@/utils/business/wms-document-columns'
  import { useWmsInitialObligationPush } from '@/hooks/business/useWmsInitialObligationPush'
  import PurchasePrintSheet from './modules/purchase-print-sheet.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElMessage, ElTag } from 'element-plus'
  import { useRoute, useRouter } from 'vue-router'
  import { useRouteDocumentDrawer } from '@/hooks/core/useRouteDocumentDrawer'
  import { chunk, uniq, groupBy } from 'lodash-es'
  import {
    pushPurchasePayables,
    type PurchasePayableDocument,
    type PurchasePayableKind
  } from '@/api/purchase-payable'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useDocumentBulkDelete } from '@/hooks/business/useDocumentBulkDelete'
  import { useRecordDeleteGuard } from '@/hooks/core/useRecordDeleteGuard'
  import { useMasterDataDeleteProcessingContext } from '@/hooks/core/useMasterDataDeleteProcessing'
  import MasterDeleteProcessingNotice from '@/components/business/master-delete-processing-notice/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction,
    type ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    documentGroupSpan,
    groupDocumentLines,
    loadAllLinePages
  } from '@/utils/business/document-detail-list'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import {
    changeWmsPurchaseStatus,
    fetchWmsPurchaseDocument,
    fetchWmsPurchasePage,
    fetchWmsPurchaseDocumentIdPage,
    type WmsPurchaseKind,
    type WmsPurchaseListRow
  } from '@/api/wms-purchase'
  import WmsPurchaseDocumentDrawer from './modules/wms-purchase-document-drawer.vue'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')

  type PurchaseAction =
    | 'View'
    | 'Add'
    | 'Copy'
    | 'Edit'
    | 'Delete'
    | 'Import'
    | 'Export'
    | 'Push'
    | 'Submit'
    | 'Approve'
    | 'Withdraw'

  const props = defineProps<{
    kind: WmsPurchaseKind
    permissions: Record<PurchaseAction, string> & { Print?: string }
  }>()
  const { confirmAction } = useArtFeedback()
  const deleteResourceLabel = ref('')
  const { deleteGuardRef, inspectDeleteReferences } = useRecordDeleteGuard(
    'wms_purchase_document',
    () => deleteResourceLabel.value || title.value
  )
  const { hasAuth } = useAuth()
  const route = useRoute()
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const deleteContext = useMasterDataDeleteProcessingContext()
  const locatedDocumentId = computed(() =>
    deleteContext.value.active && route.query.dependencyCode === 'wms_purchase_document'
      ? deleteContext.value.recordId
      : ''
  )
  const matchedDocumentId = ref('')
  let locationRequestSequence = 0
  watch(
    [locatedDocumentId, () => deleteContext.value.active, effectiveTenantId, () => props.kind],
    () => {
      locationRequestSequence += 1
      matchedDocumentId.value = ''
      void refresh()
    }
  )
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  const tableRef = ref<ArtTableQueryExpose>()
  const displayMode = ref<'document' | 'line'>('document')
  const visibleRows = ref<WmsPurchaseListRow[]>([])
  const lineProperties = new Set([
    'projectName',
    'materialCode',
    'materialDescription',
    'specificationModel',
    'inventoryUnitName',
    'quantity',
    'baseQuantity',
    'auxiliaryQuantity',
    'auxiliaryQuantity2',
    'discountAmount',
    'receivedQuantity',
    'unreceivedQuantity',
    'returnedQuantity',
    'unreturnedQuantity',
    'unitPrice',
    'taxInclusiveUnitPrice',
    'taxRate',
    'amount',
    'taxAmount',
    'totalAmount',
    'batchNo',
    'warehouseName',
    'binName',
    'stockType',
    'stockStatus',
    'gift'
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
  const drawerRef = ref<InstanceType<typeof WmsPurchaseDocumentDrawer>>()
  const printSheetRef = ref<InstanceType<typeof PurchasePrintSheet>>()
  const printing = ref(false)
  async function printSelection({
    selectedRows: rows
  }: ArtTableQueryHeaderActionContext): Promise<void> {
    if (!props.permissions.Print || !hasAuth(props.permissions.Print) || printing.value) return
    const ids = uniq(rows.map((row) => String(row.documentId)))
    if (!ids.length) {
      ElMessage.warning('请选择需要打印的单据或明细')
      return
    }
    printing.value = true
    try {
      await printSheetRef.value?.print(await Promise.all(ids.map(fetchWmsPurchaseDocument)))
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '打印数据加载失败，请重试'))
    } finally {
      printing.value = false
    }
  }
  const returnDrawerRef = ref<InstanceType<typeof WmsPurchaseDocumentDrawer>>()
  const entrustedTargetDrawerRef = ref<InstanceType<typeof WmsPurchaseDocumentDrawer>>()
  const pushDialogRef = ref<ArtDialogExpose>()
  const workingId = ref<string>()
  const selectedRows = ref<
    Array<{
      documentId: string
      documentNo?: string
      lineId: string | null
      kind: unknown
      status: unknown
    }>
  >([])
  const payableResultRef = ref<ArtDialogExpose>()
  const pushSourceRows = ref<typeof selectedRows.value>([])
  const pushingPayable = ref(false)
  const generatedPayables = ref<PurchasePayableDocument[]>([])
  async function pushPayable(kind: PurchasePayableKind, rows = selectedRows.value): Promise<void> {
    if (!hasAuth(permission.value.Push) || pushingPayable.value) return
    if (
      !rows.length ||
      rows.some((row) => row.kind !== 'purchase_inbound' || row.status !== 'approved')
    ) {
      ElMessage.warning('请选择已审核的采购入库单或明细')
      return
    }
    pushingPayable.value = true
    try {
      generatedPayables.value = await pushPurchasePayables(
        kind,
        Object.entries(groupBy(rows, 'documentId')).map(([documentId, rows]) => ({
          documentId,
          lineIds:
            displayMode.value === 'document'
              ? null
              : rows.flatMap((row) => (row.lineId ? [row.lineId] : []))
        }))
      )
      payableResultRef.value?.handleOpen(undefined, {
        title: kind === 'estimated' ? '暂估应付单' : '财务应付单',
        showFooter: false
      })
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '下推应付单失败，请刷新重试'))
    } finally {
      pushingPayable.value = false
    }
  }
  const { pushing: pushingInitialObligation, push: pushInitialObligation } =
    useWmsInitialObligationPush({
      area: 'purchase',
      getSelection: () => pushSourceRows.value,
      afterPush: async () => {
        await pushDialogRef.value?.handleClose()
      }
    })
  const returnKinds: WmsPurchaseKind[] = [
    'initial_return',
    'purchase_return',
    'other_return',
    'entrusted_processing_return'
  ]
  const isReturn = computed(() => returnKinds.includes(props.kind))
  const isInitial = computed(() => props.kind.startsWith('initial_'))
  const isEntrustedProcessing = computed(() => props.kind.startsWith('entrusted_processing_'))
  const entrustedTargetKind = computed<WmsPurchaseKind>(() =>
    props.kind === 'entrusted_processing_inbound'
      ? 'entrusted_processing_return'
      : 'entrusted_processing_inbound'
  )
  const businessTag = computed(() =>
    props.kind.startsWith('entrusted_processing_') ? '受托加工' : '入库业务'
  )
  const title = computed(
    () =>
      ({
        initial_inbound: '期初采购入库单',
        initial_return: '期初采购退料单',
        purchase_inbound: '采购入库单',
        purchase_return: '采购退货单',
        other_inbound: '其他入库单',
        other_return: '其他入库退回单',
        entrusted_processing_inbound: '受托加工材料入库单',
        entrusted_processing_return: '受托加工材料退料单'
      })[props.kind]
  )
  const description = computed(() =>
    isInitial.value
      ? '记录上线前未结清采购往来，只初始化暂估应付，不更新库存。退货表单录入正数，列表以红色负数呈现。'
      : isReturn.value
        ? `${isInitial.value ? '登记库存初始化前' : '登记入库业务过程'}的退料，数量以负数醒目标识，税价与折扣自动核算。`
        : `${isInitial.value ? '登记库存初始化前' : '登记日常'}的入库业务，支持供应商、项目与物料组合查询。`
  )
  const permission = computed(() => props.permissions)
  const search = reactive({
    status: '',
    supplier: '',
    projectName: '',
    materialDescription: '',
    materialCode: ''
  })
  useAssistantPage(() => ({
    label: title.value,
    dataSources: [
      'wms_purchase_document_list',
      'wms_purchase_document',
      'wms_purchase_document_line'
    ],
    filters: { ...search },
    selection: uniq(selectedRows.value.map((row) => row.documentNo || '已选单据')),
    filterFields: ['供应商', '客户', '项目', '物料描述', '物料编码'],
    viewSelection: async () => {
      if (!hasAuth(permission.value.View)) throw new Error('当前账号没有查看此页面的权限')
      const ids = uniq(selectedRows.value.map((row) => row.documentId))
      if (ids.length !== 1) throw new Error('请先在列表中勾选一张单据，再发送“查看选中记录”')
      const tenantId = effectiveTenantId.value
      const owner = userStore.getUserInfo.userId
      const path = route.path
      const document = await fetchPageDocument(ids[0])
      if (
        tenantId !== effectiveTenantId.value ||
        owner !== userStore.getUserInfo.userId ||
        path !== route.path
      )
        throw new Error('页面或账号范围已变化，请重新选择单据')
      await openPageDocument(document)
    },
    applyFilters: async (filters) => {
      if (!hasAuth(permission.value.View)) throw new Error('当前账号没有查看此页面的权限')
      const mapping: Record<string, keyof typeof search> = {
        供应商: 'supplier',
        客户: 'supplier',
        项目: 'projectName',
        物料描述: 'materialDescription',
        物料编码: 'materialCode'
      }
      for (const [key, value] of Object.entries(filters)) {
        const field = mapping[key]
        if (field) search[field] = value
      }
      await nextTick()
      await tableRef.value?.getData()
      if (tableRef.value?.dataState.error.value)
        throw new Error('筛选已填写，但列表查询失败，请在页面中重试')
    }
  }))
  const searchItems = computed<SearchFormItem[]>(() => [
    { label: '展示方式', key: 'displayMode', type: 'text', span: 6 },
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: commonDocumentReviewStatusOptions
      }
    },
    {
      label: isEntrustedProcessing.value ? '客户全称' : '供应商',
      key: 'supplier',
      type: 'input',
      props: {
        clearable: true,
        placeholder: isEntrustedProcessing.value ? '客户名称' : '供应商名称'
      }
    },
    {
      label: '项目名称',
      key: 'projectName',
      type: 'input',
      props: { clearable: true, placeholder: '项目名称' }
    },
    {
      label: '物料描述',
      key: 'materialDescription',
      type: 'input',
      props: { clearable: true, placeholder: '物料描述' }
    },
    {
      label: '物料编码',
      key: 'materialCode',
      type: 'input',
      props: { clearable: true, placeholder: '物料编码' }
    }
  ])
  async function fetchRows(query: {
    exportAll?: boolean
    documentIds?: string[]
    status?: string
    supplier?: string
    projectName?: string
    materialDescription?: string
    materialCode?: string
    current: number
    size: number
  }) {
    const exportAll = query.exportAll === true
    const documentId = locatedDocumentId.value
    const tenantId = effectiveTenantId.value
    const kind = props.kind
    const locating = deleteContext.value.active
    const assertReadContext = () => {
      if (
        documentId !== locatedDocumentId.value ||
        tenantId !== effectiveTenantId.value ||
        kind !== props.kind ||
        locating !== deleteContext.value.active
      ) {
        throw new Error('查询范围已变化，请在当前范围重新查询或导出')
      }
    }
    const requestSequence = exportAll ? locationRequestSequence : ++locationRequestSequence
    if (!exportAll) matchedDocumentId.value = ''
    if (deleteContext.value.active && !locatedDocumentId.value) {
      matchedDocumentId.value = ''
      return { data: [], total: 0 }
    }
    const fetchPage = async (page: typeof query) => {
      assertReadContext()
      const result = await fetchWmsPurchasePage({
        ...(documentId ? { current: page.current, size: page.size } : page),
        documentId: documentId || undefined,
        kind,
        tenantId: tenantId || undefined
      })
      assertReadContext()
      if (
        !exportAll &&
        requestSequence === locationRequestSequence &&
        documentId === locatedDocumentId.value &&
        tenantId === effectiveTenantId.value &&
        kind === props.kind
      ) {
        matchedDocumentId.value = result.data.some((row) => row.documentId === documentId)
          ? documentId
          : ''
      }
      return result
    }
    if (displayMode.value === 'line') {
      if (exportAll) {
        const data = await loadAllLinePages(fetchPage, query)
        return { data, total: data.length }
      }
      const result = await fetchPage(query)
      if (requestSequence === locationRequestSequence) visibleRows.value = result.data
      return result
    }
    if (!exportAll) visibleRows.value = []
    let documentTotal: number | undefined
    let expectedDocumentCount: number | undefined
    let matchingDocumentIds: Set<string> | null = null
    let lines: WmsPurchaseListRow[]
    if (!exportAll && !documentId) {
      assertReadContext()
      const documents = await fetchWmsPurchaseDocumentIdPage({
        ...query,
        kind,
        tenantId: tenantId || undefined
      })
      assertReadContext()
      documentTotal = documents.total
      if (!documents.data.length) return { data: [], total: documentTotal }
      expectedDocumentCount = documents.data.length
      matchingDocumentIds = new Set(documents.data.map((row) => row.id))
      lines = await loadAllLinePages(fetchPage, {
        ...query,
        documentIds: documents.data.map((row) => row.id),
        projectName: undefined,
        materialCode: undefined,
        materialDescription: undefined
      })
    } else {
      const hasLineFilter = Boolean(
        !documentId &&
        (query.materialCode?.trim() ||
          query.materialDescription?.trim() ||
          query.projectName?.trim())
      )
      matchingDocumentIds = hasLineFilter
        ? new Set((await loadAllLinePages(fetchPage, query)).map((line) => line.documentId))
        : null
      if (matchingDocumentIds?.size === 0) return { data: [], total: 0 }
      const completeLineQuery = {
        ...query,
        projectName: undefined,
        materialCode: undefined,
        materialDescription: undefined
      }
      if (matchingDocumentIds) {
        lines = []
        for (const documentIds of chunk(Array.from(matchingDocumentIds), 20)) {
          lines.push(...(await loadAllLinePages(fetchPage, { ...completeLineQuery, documentIds })))
        }
        expectedDocumentCount = matchingDocumentIds.size
      } else {
        lines = await loadAllLinePages(fetchPage, completeLineQuery)
      }
    }
    const documents = groupDocumentLines(
      matchingDocumentIds
        ? lines.filter((line) => matchingDocumentIds.has(line.documentId))
        : lines,
      (line) => line.documentId
    ).map(({ first, lines: group }) => ({
      ...first,
      lineNo: group.length,
      materialCode: '',
      materialDescription: `共 ${group.length} 项物料`,
      amount: group.reduce((sum, line) => sum + Number(line.amount || 0), 0),
      discountAmount: group.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0),
      taxAmount: group.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0),
      totalAmount: group.reduce((sum, line) => sum + Number(line.totalAmount || 0), 0)
    }))
    if (expectedDocumentCount !== undefined && documents.length !== expectedDocumentCount) {
      throw new Error('单据或明细已变化，请刷新列表后重试')
    }
    return {
      data: (exportAll || documentTotal !== undefined
        ? documents
        : documents.slice((query.current - 1) * query.size, query.current * query.size)
      ).map((row) => ({
        ...row,
        inventoryUnitName: formatUnitDisplayName(row.inventoryUnitName)
      })),
      total: documentTotal ?? documents.length
    }
  }
  async function refresh(): Promise<void> {
    tableRef.value?.clearSelection()
    await tableRef.value?.refreshUpdate()
  }
  function purchaseCellClassName({
    row,
    column
  }: {
    row: Record<string, unknown>
    column: { property?: string }
  }): string {
    if (
      (row.kind === 'initial_return' || row.kind === 'purchase_return') &&
      Number(row[column.property || '']) < 0 &&
      [
        'quantity',
        'baseQuantity',
        'auxiliaryQuantity',
        'auxiliaryQuantity2',
        'amount',
        'taxAmount',
        'discountAmount',
        'totalAmount'
      ].includes(column.property || '')
    )
      return 'opening-return-negative-cell'
    return column.property === 'quantity' &&
      Number(row.quantity) < 0 &&
      returnKinds.some((kind) => kind === row.kind)
      ? 'wms-purchase-negative-cell'
      : ''
  }
  function onSelectionChange(rows: Record<string, unknown>[]): void {
    selectedRows.value = rows.flatMap(({ documentId, documentNo, lineId, kind, status }) =>
      typeof documentId === 'string'
        ? [
            {
              documentId,
              documentNo: typeof documentNo === 'string' ? documentNo : undefined,
              lineId: typeof lineId === 'string' ? lineId : null,
              kind,
              status
            }
          ]
        : []
    )
  }
  async function openDocument(
    mode: 'view' | 'edit' | 'copy',
    row: WmsPurchaseListRow
  ): Promise<void> {
    try {
      const target =
        props.kind === 'other_inbound' && row.kind === 'other_return'
          ? returnDrawerRef.value
          : drawerRef.value
      await target?.handleOpen({ mode, documentId: row.documentId })
    } catch {
      ElMessage.error('单据加载失败，请重试')
    }
  }
  async function openOrderTarget(targetId: string): Promise<boolean> {
    try {
      await drawerRef.value?.handleOpen({ mode: 'create', orderTargetId: targetId })
      return true
    } catch {
      ElMessage.error('来源单据无法带入，请核对未入库数量、物料与单位配置')
      return false
    }
  }
  const canPrepareOtherReturn = (rows: WmsPurchaseListRow[]): boolean =>
    rows.length > 0 &&
    rows.every((row) => row.status === 'approved' && row.kind === 'other_inbound')

  async function prepareOtherReturn(rows: WmsPurchaseListRow[]): Promise<void> {
    pushSourceRows.value = rows.map((row) => ({
      documentId: row.documentId,
      lineId: row.lineId,
      kind: row.kind,
      status: row.status
    }))
    await pushOtherInboundReturn()
  }
  async function pushOtherInboundReturn(): Promise<void> {
    const documents = new Map(pushSourceRows.value.map((row) => [row.documentId, row]))
    if (documents.size !== 1) {
      ElMessage.warning('请先勾选一张已审核的其他入库单')
      return
    }
    const source = [...documents.values()][0]
    if (source.status !== 'approved' || source.kind !== 'other_inbound') {
      ElMessage.warning('仅支持下推已审核的其他入库单')
      return
    }
    try {
      await returnDrawerRef.value?.handleOpen({
        mode: 'create',
        documentId: source.documentId,
        sourceLineIds:
          displayMode.value === 'line'
            ? pushSourceRows.value.flatMap((row) => (row.lineId ? [row.lineId] : []))
            : undefined
      })
    } catch {
      ElMessage.error('入库退回草稿生成失败，请重试')
    }
  }
  async function pushEntrustedCounterpart(): Promise<void> {
    const documents = new Map(pushSourceRows.value.map((row) => [row.documentId, row]))
    if (documents.size !== 1) {
      ElMessage.warning(`请先勾选一张已审核的${title.value}`)
      return
    }
    const source = [...documents.values()][0]
    if (source.status !== 'approved' || source.kind !== props.kind) {
      ElMessage.warning(`仅支持下推已审核的${title.value}`)
      return
    }
    try {
      await pushDialogRef.value?.handleClose()
      await entrustedTargetDrawerRef.value?.handleOpen({
        mode: 'copy',
        documentId: source.documentId
      })
    } catch {
      ElMessage.error('受托加工后续业务草稿生成失败，请重试')
    }
  }
  async function fetchPageDocument(id: string) {
    const document = await fetchWmsPurchaseDocument(id)
    if (
      document.kind !== props.kind &&
      !(props.kind === 'other_inbound' && document.kind === 'other_return')
    )
      throw new Error('单据类型不匹配')
    return document
  }
  async function openPageDocument(
    document: Awaited<ReturnType<typeof fetchWmsPurchaseDocument>>
  ): Promise<void> {
    if (!hasAuth(permission.value.View)) throw new Error('当前账号没有查看此页面的权限')
    const target = document.kind === 'other_return' ? returnDrawerRef.value : drawerRef.value
    if (!target) throw new Error('详情尚未就绪，请稍后重试')
    await target.handleOpen({ mode: 'view', document })
  }
  useRouteDocumentDrawer({
    routeName: () => permission.value.View.split(':')[0],
    canOpen: () => hasAuth(permission.value.View),
    fetchDocument: fetchPageDocument,
    openDocument: openPageDocument,
    onError: () => ElMessage.error(`${title.value}加载失败，请刷新后重试`)
  })
  onMounted(async () => {
    if (typeof route.query.documentId === 'string' && props.kind.startsWith('initial_')) return
    const targetId = route.query.targetId
    if (
      !['purchase_inbound', 'other_inbound'].includes(props.kind) ||
      typeof targetId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) ||
      !hasAuth(permission.value.Add)
    )
      return
    if (await openOrderTarget(targetId)) {
      await router.replace({ path: route.path, query: { ...route.query, targetId: undefined } })
    }
  })
  async function transition(
    row: WmsPurchaseListRow,
    action: 'submit' | 'approve' | 'withdraw' | 'delete'
  ): Promise<void> {
    if (workingId.value || bulkDeleting.value) return
    const label = { submit: '提交', withdraw: '撤回提交', approve: '审核', delete: '删除' }[action]
    const resources = [{ id: row.documentId, label: row.documentNo }]
    deleteResourceLabel.value = row.kind === 'other_return' ? '其他入库退回单' : title.value
    workingId.value = row.documentId
    try {
      if (action === 'submit' && ['other_inbound', 'other_return'].includes(row.kind)) {
        const document = await fetchWmsPurchaseDocument(row.documentId)
        if (!document.supplierId && !document.businessDepartmentId) {
          await confirmAction('业务部门和供应商不能同时为空。', '无法提交', {
            type: 'error',
            showCancelButton: false,
            confirmButtonText: '我知道了'
          })
          return
        }
      }
      if (action === 'delete' && (await inspectDeleteReferences(resources))) return
      await confirmAction(
        `${action === 'withdraw' ? '撤回后恢复暂存，可修改或删除；关联审批待办将取消。' : ''}确定${label} ${row.documentNo}？`,
        `${label}${deleteResourceLabel.value}`,
        {
          type: action === 'delete' ? 'warning' : 'info',
          confirmButtonText: `确定${label}`
        }
      )
      await changeWmsPurchaseStatus(row.documentId, action)
      await refresh()
    } catch (error) {
      if (action === 'delete' && error !== 'cancel' && error !== 'close') {
        await inspectDeleteReferences(resources)
      }
      /* 取消和接口错误由组件处理。 */
    } finally {
      workingId.value = undefined
    }
  }
  const { bulkDeleteAction, bulkDeleting } = useDocumentBulkDelete({
    permission: () => permission.value.Delete,
    resourceLabel: () => title.value,
    idKey: 'documentId',
    busy: () => Boolean(workingId.value),
    inspect: inspectDeleteReferences,
    remove: (id) => changeWmsPurchaseStatus(id, 'delete'),
    refresh,
    clearSelection: () => tableRef.value?.clearSelection()
  })
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    bulkDeleteAction(),
    ...(props.permissions.Print
      ? [
          {
            key: 'batch-print',
            label: '批量打印',
            selectionRequired: true,
            icon: 'ri:printer-line',
            permission: props.permissions.Print,
            buttonProps: { loading: printing.value },
            onClick: printSelection
          }
        ]
      : []),
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permission.value.Add,
      buttonProps: { plain: false },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create' })
    },
    {
      key: 'import',
      label: '导入',
      icon: 'ri:file-upload-line',
      permission: permission.value.Import,
      buttonProps: { type: 'success', plain: true },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create', importIntent: true })
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: permission.value.Export,
      buttonProps: { type: 'warning', plain: true },
      exportFilename: title.value,
      exportData: async () =>
        (await fetchRows({ ...search, current: 1, size: 500, exportAll: true })).data.map(
          (row) => ({ ...row, status: statusLabel(row.status) })
        ),
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '业务日期', key: 'businessDate' },
        { title: '单据状态', key: 'status' },
        {
          title: isEntrustedProcessing.value ? '客户全称' : '供应商',
          key: isEntrustedProcessing.value ? 'customerName' : 'supplierName'
        },
        { title: '项目名称', key: 'projectName' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        { title: '规格型号', key: 'specificationModel' },
        { title: '库存单位', key: 'inventoryUnitName' },
        { title: '数量', key: 'quantity' },
        { title: '单价(元)', key: 'unitPrice' },
        { title: '含税单价(元)', key: 'taxInclusiveUnitPrice' },
        { title: '税率(%)', key: 'taxRate' },
        { title: '金额(元)', key: 'amount' },
        { title: '税额(元)', key: 'taxAmount' },
        { title: '价税合计(元)', key: 'totalAmount' },
        ...(isEntrustedProcessing.value
          ? [
              { title: '已收料数量', key: 'receivedQuantity' },
              { title: '未收料数量', key: 'unreceivedQuantity' },
              { title: '已退库数量', key: 'returnedQuantity' },
              { title: '未退库数量', key: 'unreturnedQuantity' }
            ]
          : [])
      ]
    },
    {
      key: 'push',
      selectionRequired: true,
      rowAction: isInitial.value || isEntrustedProcessing.value,
      disabled: (ctx) => ctx.selectedRows.some((row) => row.status !== 'approved'),
      ...(props.kind === 'purchase_inbound'
        ? { slot: 'purchase-payable-push' }
        : props.kind === 'other_inbound'
          ? { slot: 'other-return-push' }
          : {}),
      label: '下推',
      icon: 'ri:file-transfer-line',
      permission: permission.value.Push,
      buttonProps: { type: 'info', plain: true },
      onClick: (ctx) => {
        pushSourceRows.value = ctx.selectedRows.flatMap((row) =>
          typeof row.documentId === 'string'
            ? [
                {
                  documentId: row.documentId,
                  lineId: typeof row.lineId === 'string' ? row.lineId : null,
                  kind: row.kind,
                  status: row.status
                }
              ]
            : []
        )
        return props.kind === 'other_inbound'
          ? pushOtherInboundReturn()
          : pushDialogRef.value?.handleOpen(undefined, { title: '下推业务' })
      }
    }
  ])
  function statusLabel(value: WmsPurchaseListRow['status']): string {
    return { draft: '暂存', submitted: '已提交', approved: '已审核' }[value]
  }

  function moreActions(row: WmsPurchaseListRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: permission.value.Copy },
      ...(props.kind === 'other_inbound'
        ? [
            {
              key: 'push-other-return',
              label: '下推其他入库退回',
              icon: 'ri:inbox-unarchive-line',
              auth: permission.value.Push,
              disabled: row.status !== 'approved' || row.kind !== 'other_inbound'
            }
          ]
        : []),
      ...(props.kind === 'purchase_inbound'
        ? [
            {
              key: 'push-estimated',
              label: '下推暂估应付单',
              icon: 'ri:bill-line',
              auth: permission.value.Push,
              disabled: row.status !== 'approved' || pushingPayable.value
            },
            {
              key: 'push-financial',
              label: '下推财务应付单',
              icon: 'ri:money-dollar-circle-line',
              auth: permission.value.Push,
              disabled: row.status !== 'approved' || pushingPayable.value
            }
          ]
        : []),
      ...(row.status === 'draft'
        ? [
            { key: 'edit', label: '编辑单据', icon: 'ri:edit-line', auth: permission.value.Edit },
            {
              key: 'submit',
              label: '提交单据',
              icon: 'ri:send-plane-line',
              auth: permission.value.Submit
            },
            {
              key: 'delete',
              label: '删除单据',
              icon: 'ri:delete-bin-line',
              auth: permission.value.Delete,
              color: 'var(--el-color-danger)'
            }
          ]
        : []),
      ...(row.status === 'submitted'
        ? [
            {
              key: 'withdraw',
              label: '撤回提交',
              icon: 'ri:arrow-go-back-line',
              auth: permission.value.Withdraw
            },
            {
              key: 'approve',
              label: '审核单据',
              icon: 'ri:checkbox-circle-line',
              auth: permission.value.Approve
            }
          ]
        : [])
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsPurchaseListRow): void {
    if (item.key === 'push-other-return') {
      void prepareOtherReturn([row])
      return
    }
    if (item.key === 'push-estimated' || item.key === 'push-financial') {
      void pushPayable(item.key === 'push-estimated' ? 'estimated' : 'financial', [row])
      return
    }
    if (item.key === 'copy' || item.key === 'edit') {
      void openDocument(item.key, row)
    } else if (
      item.key === 'submit' ||
      item.key === 'approve' ||
      item.key === 'withdraw' ||
      item.key === 'delete'
    ) {
      void transition(row, item.key)
    }
  }
  function columnsFactory(): ColumnOption<WmsPurchaseListRow>[] {
    const columns: ColumnOption<WmsPurchaseListRow>[] = [
      { type: 'selection', width: 48, fixed: 'left' },
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 180,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`${displayMode.value === 'document' ? `共 ${row.lineNo} 项物料` : `第 ${row.lineNo} 行`} · ${isEntrustedProcessing.value ? row.customerName || '未关联客户' : row.supplierName || '未关联供应商'}`}
            icon={isReturn.value ? 'ri:inbox-unarchive-line' : 'ri:inbox-archive-line'}
          />
        )
      },
      ...wmsDocumentClassificationColumns<WmsPurchaseListRow>(),
      { prop: 'businessDate', label: '业务日期', minWidth: 118 },
      {
        prop: 'status',
        label: '单据状态',
        width: 98,
        formatter: (row) => (
          <ElTag
            size="small"
            type={
              row.status === 'approved'
                ? 'success'
                : row.status === 'submitted'
                  ? 'warning'
                  : 'info'
            }
          >
            {statusLabel(row.status)}
          </ElTag>
        )
      },
      {
        prop: isEntrustedProcessing.value ? 'customerName' : 'supplierName',
        label: isEntrustedProcessing.value ? '客户全称' : '供应商',
        minWidth: 190,
        showOverflowTooltip: true
      },
      { prop: 'projectName', label: '项目名称', minWidth: 165, showOverflowTooltip: true },
      ...(displayMode.value === 'line'
        ? [{ prop: 'materialCode', label: '物料编码', minWidth: 125 }]
        : []),
      { prop: 'materialDescription', label: '物料描述', minWidth: 175, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 130 },
      {
        prop: 'inventoryUnitName',
        label: '库存单位',
        width: 98,
        formatter: (row) => formatUnitDisplayName(row.inventoryUnitName)
      },
      {
        prop: 'quantity',
        label: '数量',
        fixed: 'right',
        minWidth: 115,
        align: 'right',
        formatter: (row) => (
          <span
            class={
              returnKinds.includes(row.kind)
                ? 'wms-purchase-negative'
                : 'font-semibold tabular-nums'
            }
          >
            {Number(row.quantity).toFixed(4)}
          </span>
        )
      },
      ...(displayMode.value === 'line' && ['initial_return', 'purchase_return'].includes(props.kind)
        ? ([
            {
              prop: 'baseQuantity',
              label: '基本数量',
              minWidth: 115,
              align: 'right',
              formatter: (row) =>
                props.kind === 'purchase_return'
                  ? `￥${Number(row.baseQuantity).toFixed(4)}`
                  : Number(row.baseQuantity).toFixed(4)
            },
            { prop: 'auxiliaryQuantity', label: '辅助数量', minWidth: 115, align: 'right' },
            { prop: 'auxiliaryQuantity2', label: '辅助数量2', minWidth: 125, align: 'right' }
          ] as ColumnOption<WmsPurchaseListRow>[])
        : []),
      ...(displayMode.value === 'line' && props.kind === 'purchase_return'
        ? [
            {
              prop: 'baseUnitName',
              label: '基本单位',
              width: 100,
              formatter: (row: WmsPurchaseListRow) => formatUnitDisplayName(row.baseUnitName)
            }
          ]
        : []),
      ...(isEntrustedProcessing.value
        ? [
            {
              prop: 'receivedQuantity',
              label: '已收料数量',
              minWidth: 116,
              align: 'right' as const
            },
            {
              prop: 'unreceivedQuantity',
              label: '未收料数量',
              minWidth: 116,
              align: 'right' as const
            },
            {
              prop: 'returnedQuantity',
              label: '已退库数量',
              minWidth: 116,
              align: 'right' as const
            },
            {
              prop: 'unreturnedQuantity',
              label: '未退库数量',
              minWidth: 116,
              align: 'right' as const
            }
          ]
        : []),
      { prop: 'unitPrice', label: '单价(元)', minWidth: 108, align: 'right' },
      { prop: 'taxInclusiveUnitPrice', label: '含税单价(元)', minWidth: 125, align: 'right' },
      { prop: 'taxRate', label: '税率(%)', minWidth: 100, align: 'right' },
      {
        prop: 'amount',
        label: '金额(元)',
        minWidth: 110,
        align: 'right',
        formatter: (row) => formatCurrencyValue(row.amount)
      },
      ...(props.kind === 'initial_return'
        ? ([
            {
              prop: 'discountAmount',
              label: '折扣额(元)',
              minWidth: 115,
              align: 'right',
              formatter: (row) => formatCurrencyValue(row.discountAmount)
            }
          ] as ColumnOption<WmsPurchaseListRow>[])
        : []),
      {
        prop: 'taxAmount',
        label: '税额(元)',
        minWidth: 110,
        align: 'right',
        formatter: (row) => formatCurrencyValue(row.taxAmount)
      },
      {
        prop: 'totalAmount',
        label: '价税合计(元)',
        minWidth: 130,
        align: 'right',
        formatter: (row) => formatCurrencyValue(row.totalAmount)
      },
      { prop: 'batchNo', label: '批号', minWidth: 120 },
      { prop: 'warehouseName', label: '仓库', minWidth: 140 },
      { prop: 'binName', label: '仓位', minWidth: 120 },
      {
        prop: 'stockType',
        label: '库存类型',
        minWidth: 100,
        formatter: (row) =>
          userStore.getDictItemByValue('wmsInitialStockType', row.stockType)?.label || row.stockType
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        minWidth: 100,
        formatter: (row) =>
          userStore.getDictItemByValue('wmsInitialStockCondition', row.stockStatus)?.label ||
          row.stockStatus
      },
      {
        prop: 'gift',
        label: '赠品',
        width: 78,
        align: 'center',
        formatter: (row) => (row.gift ? '✓' : '—')
      },
      {
        prop: 'operation',
        label: '操作',
        fixed: 'right',
        width: 112,
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看"
              icon="ri:eye-line"
              permission={permission.value.View}
              onClick={() => openDocument('view', row)}
            />
            <ArtButtonMore
              list={moreActions(row)}
              trigger="click"
              onClick={(item: ButtonMoreItem) => onMoreAction(item, row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
    if (displayMode.value === 'line') return columns
    const detailOnly = new Set([
      'quantity',
      'specificationModel',
      'inventoryUnitName',
      'unitPrice',
      'taxInclusiveUnitPrice',
      'taxRate',
      'batchNo',
      'warehouseName',
      'binName',
      'stockType',
      'stockStatus',
      'gift',
      'receivedQuantity',
      'unreceivedQuantity',
      'returnedQuantity',
      'unreturnedQuantity'
    ])
    return columns.filter((column) => !detailOnly.has(String(column.prop)))
  }
</script>

<style scoped>
  :deep(.wms-initialization-header .business-workspace-header__aside) {
    max-width: min(72%, 980px);
  }

  @media (width <= 1280px) {
    :deep(.wms-initialization-header .business-workspace-header__hero) {
      flex-wrap: wrap;
    }

    :deep(.wms-initialization-header .business-workspace-header__aside) {
      width: 100%;
      max-width: none;
      margin-left: 0;
    }
  }

  :deep(td.el-table__cell.wms-purchase-negative-cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(.wms-purchase-negative) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }

  :deep(td.el-table__cell.opening-return-negative-cell) {
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }
</style>
