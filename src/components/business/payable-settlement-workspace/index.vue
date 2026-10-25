<template>
  <ArtPermissionGuard :permission="permissions.View" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        :title="title"
        :description="
          kind === 'application'
            ? '统一采购与运输请款，按明细管理核准额度、付款进度和冻结关闭。'
            : kind === 'refund'
              ? '按原付款退回未核销现金本金，沿用原账套，到账与核销记录分别保留。'
              : '按已审核申请或应付登记实际付款，资金流水与核销记录分别保留。'
        "
        icon="ri:secure-payment-line"
        density="compact"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="query"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :columns-context-key="query.viewMode"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        refresh-feedback="icon"
        :table-props="{
          rowKey: 'recordKey',
          emptyText: `暂无${title}`,
          emptyDescription:
            kind === 'refund'
              ? '从已确认付款下推，或新增并选择原付款明细。'
              : '新增单据，或从财务应付单下推。付款申请审核后可继续下推付款。'
        }"
        focusable
      >
        <template #payment-push="{ selectedRows }">
          <ElDropdown
            trigger="click"
            :disabled="selectedRows.length !== 1 || actionDisabled('push', selectedRows)"
            @command="() => push(selectedRows[0]?.id)"
          >
            <ElButton
              plain
              :disabled="selectedRows.length !== 1 || actionDisabled('push', selectedRows)"
              ><ArtSvgIcon icon="ri:file-transfer-line" />下推<ArtSvgIcon
                icon="ri:arrow-down-s-line"
            /></ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="payment"
                  ><ArtSvgIcon icon="ri:bank-card-line" />{{
                    kind === 'payment' ? '付款退款单' : '付款单'
                  }}</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
        <template #payment-confirm="{ selectedRows }">
          <ElDropdown
            trigger="click"
            :disabled="
              actionDisabled('confirm', selectedRows) &&
              actionDisabled('cancel_payment', selectedRows)
            "
            @command="
              (command) =>
                act(
                  selectedRows.map((row: { id: string }) => String(row.id)),
                  command
                )
            "
          >
            <ElButton
              plain
              :disabled="
                actionDisabled('confirm', selectedRows) &&
                actionDisabled('cancel_payment', selectedRows)
              "
              ><ArtSvgIcon icon="ri:bank-card-line" />{{
                kind === 'refund' ? '确认到账' : '确认付款'
              }}<ArtSvgIcon icon="ri:arrow-down-s-line"
            /></ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem
                  command="confirm"
                  :disabled="actionDisabled('confirm', selectedRows)"
                  ><ArtSvgIcon icon="ri:checkbox-circle-line" />{{
                    kind === 'refund' ? '确认到账' : '确认付款'
                  }}</ElDropdownItem
                ><ElDropdownItem
                  command="cancel_payment"
                  :disabled="actionDisabled('cancel_payment', selectedRows)"
                  ><ArtSvgIcon icon="ri:arrow-go-back-line" />{{
                    kind === 'refund' ? '取消到账' : '取消付款'
                  }}</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
        <template #payment-voucher="{ selectedRows }">
          <ElDropdown
            trigger="click"
            :disabled="busy || selectedRows.length !== 1"
            @command="(command) => voucher(selectedRows[0]?.id, command === 'preview')"
          >
            <ElButton plain :disabled="busy || selectedRows.length !== 1"
              ><ArtSvgIcon icon="ri:file-list-3-line" />生成凭证<ArtSvgIcon
                icon="ri:arrow-down-s-line"
            /></ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="preview"
                  ><ArtSvgIcon icon="ri:file-search-line" />预览凭证</ElDropdownItem
                ><ElDropdownItem command="generate"
                  ><ArtSvgIcon icon="ri:file-add-line" />生成凭证</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
      </ArtTableQuery>
      <SettlementDocumentDrawer ref="drawerRef" :kind="kind" @success="tableRef?.refreshData()" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
      <FinanceVoucherPreview ref="voucherRef" :result="voucherResult" />
    </div>
  </ArtPermissionGuard>
</template>
<script setup lang="tsx">
  import { ElMessage, ElTag } from 'element-plus'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { formatTenantLabel } from '@/utils/tenant-display'
  import FinanceVoucherPreview from '@/components/business/finance-voucher-preview/index.vue'
  import { payableSettlementVoucher, type PayableVoucherResult } from '@/api/payable-writeoff'
  import { escape, uniq } from 'lodash-es'
  import {
    fetchPayableSettlements,
    fetchPayableSettlementTypeOptions,
    actPayableSettlement,
    pushPayableSettlement,
    fetchSettlementDeleteDependencies,
    type PayableSettlementAction,
    type PayableSettlementDocument,
    type PayableSettlementKind,
    type PayableSettlementPermissions,
    type PayableSettlementQuery
  } from '@/api/payable-settlement'
  import ArtTableQuery, {
    type ArtTableQueryHeaderAction,
    type ArtTableQueryHeaderActionContext
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import SettlementDocumentDrawer from './modules/settlement-document-drawer.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRouteTableContext, useRouteOperationGuard } from '@/hooks/core/useRouteTableContext'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    settlementStatusLabels,
    settlementPaymentLabels,
    settlementTitles,
    settlementStatusLabel,
    settlementPaymentLabel
  } from '@/utils/finance/payable-settlement'
  import { printHtmlDocument } from '@/utils/file/print-document'
  import { financePaths } from '@/router/business-paths'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'

  const props = defineProps<{
    kind: PayableSettlementKind
    permissions: PayableSettlementPermissions
  }>()
  const tableRef = ref<InstanceType<typeof ArtTableQuery>>()
  const drawerRef = ref<InstanceType<typeof SettlementDocumentDrawer>>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const busy = ref(false)
  const settlementPath = computed(
    () =>
      ({
        application: financePaths.payableApplication,
        payment: financePaths.payablePayment,
        refund: financePaths.payableRefund
      })[props.kind]
  )
  useRouteTableContext(() => settlementPath.value, tableRef)
  const tenantScope = useTenantScopeStore()
  const voucherRef = ref<InstanceType<typeof FinanceVoucherPreview>>()
  const voucherResult = ref<PayableVoucherResult>()
  const route = useRoute()
  const router = useRouter()
  const captureRouteOperation = useRouteOperationGuard()
  const { hasAuth } = useAuth()
  const canPushToTarget = computed(() => {
    const target = props.kind === 'payment' ? 'FinancePayableRefund' : 'FinancePayablePayment'
    return hasAuth(`${target}:Add`) && hasAuth(`${target}:View`)
  })
  const { confirm, confirmDelete, promptReason } = useArtFeedback()
  const title = computed(() => settlementTitles[props.kind])
  const query = reactive<PayableSettlementQuery>({ current: 1, size: 20, viewMode: 'document' })
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      key: 'keyword',
      label: '组合查询',
      type: 'input',
      props: { placeholder: '单号、往来单位、请款事由', clearable: true }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      api: async () =>
        (await fetchPayableSettlementTypeOptions(props.kind)).map((item) => ({
          value: item.id,
          label: `${item.name}${item.enabled ? '' : '（已停用）'}${tenantScope.isAllTenants ? ` · ${formatTenantLabel(item)}` : ''}`
        })),
      props: { clearable: true }
    },
    {
      key: 'status',
      label: '单据状态',
      type: 'select',
      props: {
        clearable: true,
        options: Object.entries(settlementStatusLabels)
          .filter(
            ([value]) =>
              value !== 'processing' && (props.kind !== 'application' || value !== 'confirmed')
          )
          .map(([value]) => ({ value, label: settlementStatusLabel(props.kind, value) }))
      }
    },
    {
      key: 'paymentStatus',
      label: props.kind === 'refund' ? '到账状态' : '付款状态',
      type: 'select',
      props: {
        clearable: true,
        options: Object.keys(settlementPaymentLabels).map((value) => ({
          value,
          label: settlementPaymentLabel(props.kind, value)
        }))
      }
    },
    {
      key: 'businessDateRange',
      label: '业务日期',
      type: 'date',
      props: { type: 'daterange', valueFormat: 'YYYY-MM-DD' }
    },
    {
      key: 'viewMode',
      label: '查询方式',
      type: 'select',
      props: {
        options: [
          { value: 'document', label: '按单据' },
          { value: 'line', label: '按明细' }
        ]
      }
    }
  ])
  function fetchRows(params: PayableSettlementQuery) {
    return fetchPayableSettlements(props.kind, {
      ...params,
      id: typeof route.query.recordId === 'string' ? route.query.recordId : undefined
    })
  }
  function actionDisabled(
    action: PayableSettlementAction | 'push',
    rows: Record<string, unknown>[]
  ): boolean {
    if (busy.value || !rows.length) return true
    return rows.some((row) => {
      const activeApplication =
        props.kind === 'application' &&
        ['submitted', 'approved'].includes(String(row.status)) &&
        row.paymentStatus !== 'full'
      switch (action) {
        case 'submit':
        case 'delete':
          return row.status !== 'draft' || !!row.frozen
        case 'approve':
          return row.status !== 'submitted' || !!row.frozen
        case 'freeze':
          return !activeApplication || !!row.frozen
        case 'unfreeze':
          return !activeApplication || !row.frozen
        case 'close':
          return !activeApplication
        case 'confirm':
          return row.status !== 'approved' || !!row.frozen
        case 'cancel_payment':
          return row.status !== 'confirmed' || !!row.frozen
        case 'void':
          return !['draft', 'submitted', 'approved'].includes(String(row.status))
        case 'push':
          return (
            !canPushToTarget.value ||
            !!row.frozen ||
            (props.kind === 'application'
              ? row.status !== 'approved' || row.paymentStatus === 'full'
              : row.status !== 'confirmed')
          )
      }
    })
  }
  async function reload(id: string): Promise<PayableSettlementDocument> {
    const response = await fetchPayableSettlements(props.kind, { id, current: 1, size: 1 })
    if (!response.data[0]) throw new Error('付款单据已变更或不可查看，请刷新列表')
    return response.data[0]
  }
  async function run(operation: () => Promise<void>): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      await operation()
    } catch (error) {
      notifyFriendlyError(error, '操作未完成，请刷新核对状态后重试')
    } finally {
      busy.value = false
    }
  }
  async function open(row: PayableSettlementDocument, edit = false): Promise<void> {
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const document = await reload(row.id)
      if (!isCurrentRoute()) return
      if (edit && (document.status !== 'draft' || document.frozen)) {
        ElMessage.warning('单据状态已变化，列表已刷新，请重新核对后操作')
        await tableRef.value?.refreshData()
        return
      }
      await drawerRef.value?.open(document, edit)
    })
  }
  async function act(ids: string[], action: PayableSettlementAction): Promise<void> {
    await run(async () => {
      let reason = ''
      try {
        if (['cancel_payment', 'freeze', 'unfreeze', 'close', 'void'].includes(action))
          reason = await promptReason(
            action === 'cancel_payment'
              ? props.kind === 'refund'
                ? '此操作冲回退款到账及未制证核销，保留历史；退款占用直到作废后才释放。请先核实实际银行状态。'
                : '此操作冲回账面资金与未制证核销，保留历史记录；请先核实实际银行状态。'
              : '请填写本次业务处理原因。',
            '处理原因'
          )
        else if (action === 'confirm')
          await confirm(
            props.kind === 'refund'
              ? '请核实退款已实际到账。确认后按明细登记收款资金流水，不会发起银行转账。'
              : '确认登记实际付款？系统按明细生成资金流水，并按已启用的同源方案核销。',
            {
              title: props.kind === 'refund' ? '确认退款到账' : '确认付款',
              confirmButtonText: '确认登记'
            }
          )
      } catch {
        return
      }
      await actPayableSettlement(uniq(ids), action, reason)
      tableRef.value?.clearSelection()
      ElMessage.success('操作成功')
      await tableRef.value?.refreshData()
    })
  }
  async function remove(ids: string[]): Promise<void> {
    await run(async () => {
      const rows = await Promise.all(uniq(ids).map(reload))
      const guard = deleteGuardRef.value
      if (!guard) throw new Error('关联检查尚未就绪，请刷新后重试')
      const inspect = () =>
        guard.inspect({
          resourceLabel: title.value,
          resources: rows.map((row) => ({ id: row.id, label: row.documentNo })),
          fetchDependencies: fetchSettlementDeleteDependencies,
          dependencyMeta: {
            state: {
              label: '状态限制',
              unit: '张',
              description: '仅无引用的暂存单可以删除，经营历史保留。',
              actionLabel: '查看单据',
              routePath: settlementPath.value,
              canNavigate: () => hasAuth(props.permissions.View),
              order: 1
            },
            payment: {
              label: '已下推付款',
              unit: '张',
              description: '请先核对关联付款，不可直接删除申请。',
              actionLabel: '查看付款',
              order: 2,
              routePath: financePaths.payablePayment,
              routeQuery: (record) => ({ recordId: record.targetId }),
              canNavigate: () => hasAuth('FinancePayablePayment:View')
            },
            refund: {
              label: '付款退款',
              unit: '张',
              description: '原付款已有退款引用，保留经营历史。',
              actionLabel: '查看退款',
              order: 3,
              routePath: financePaths.payableRefund,
              routeQuery: (record) => ({ recordId: record.targetId }),
              canNavigate: () => hasAuth('FinancePayableRefund:View')
            }
          }
        })
      if (await inspect()) return
      try {
        await confirmDelete(`确认删除 ${rows.length} 张无关联的暂存${title.value}？`)
      } catch {
        return
      }
      try {
        await actPayableSettlement(
          rows.map((row) => row.id),
          'delete'
        )
      } catch (error) {
        if (await inspect()) return
        throw error
      }
      ElMessage.success('暂存单已删除')
      tableRef.value?.clearSelection()
      await tableRef.value?.refreshData()
    })
  }
  async function push(id: string): Promise<void> {
    if (!props.permissions.Push || !hasAuth(props.permissions.Push) || !canPushToTarget.value)
      return
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const targetPath =
        props.kind === 'payment' ? financePaths.payableRefund : financePaths.payablePayment
      const created = await pushPayableSettlement(
        id,
        props.kind === 'payment' ? 'refund' : 'payment',
        props.kind === 'payment' ? 'payment' : 'application'
      )
      ElMessage.success(`已生成 ${created.documentNo}`)
      if (!isCurrentRoute()) return
      await router.push({
        path: targetPath,
        query: { recordId: created.id }
      })
    })
  }
  async function voucher(id: string, preview: boolean): Promise<void> {
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const result = await payableSettlementVoucher(
        id,
        props.kind === 'refund' ? 'refund' : 'payment',
        preview
      )
      if (preview) {
        if (!isCurrentRoute()) return
        voucherResult.value = result
        await voucherRef.value?.handleOpen()
      } else {
        if (result.status === 'generated') ElMessage.success(result.message)
        else ElMessage.warning(result.message)
        if (isCurrentRoute()) await tableRef.value?.refreshData()
      }
    })
  }
  async function print(ids: string[]): Promise<void> {
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const rows = await Promise.all(uniq(ids).map(reload))
      if (!isCurrentRoute()) return
      const body = rows
        .map(
          (row) =>
            `<section><h1>${escape(title.value)} ${escape(row.documentNo)}</h1><p>${escape(row.businessDate)} · ${escape(row.currencyCode)} · ${escape(row.reason)}</p><table><tr><th>行号</th><th>往来单位</th><th>收款单位</th><th>金额</th><th>来源单据</th></tr>${row.lines.map((line) => `<tr><td>${line.lineNo}</td><td>${escape(line.supplierName || '')}</td><td>${escape(line.payeeSupplierName || '')}</td><td>${formatCurrencyValue(line.amount)}</td><td>${escape(line.sourceDocumentNo || '')}</td></tr>`).join('')}</table><p>合计 ${formatCurrencyValue(row.amount)}</p></section>`
        )
        .join('')
      printHtmlDocument(
        `<html><head><title>${escape(title.value)}</title><style>body{font:14px sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #888;padding:8px;text-align:left}section{break-after:page}</style></head><body>${body}</body></html>`
      )
    })
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      permission: props.permissions.Add,
      onClick: () => drawerRef.value?.open(undefined, true)
    },
    ...(['submit', 'approve'] as const).map((action) => ({
      key: action,
      label: action === 'submit' ? '提交' : '审核',
      icon: action === 'submit' ? 'ri:send-plane-line' : 'ri:checkbox-circle-line',
      permission: action === 'submit' ? props.permissions.Submit : props.permissions.Approve,
      selectionRequired: true,
      disabled: ({ selectedRows }: ArtTableQueryHeaderActionContext) =>
        actionDisabled(action, selectedRows),
      onClick: ({ selectedRows }: { selectedRows: Record<string, unknown>[] }) =>
        act(
          selectedRows.map((row) => String(row.id)),
          action
        )
    })),
    {
      key: 'delete',
      icon: 'ri:delete-bin-line',
      label: '删除',
      permission: props.permissions.Delete,
      selectionRequired: true,
      disabled: ({ selectedRows }) => actionDisabled('delete', selectedRows),
      onClick: ({ selectedRows }) => remove(selectedRows.map((row) => String(row.id)))
    },
    ...(props.kind !== 'refund'
      ? [
          {
            key: 'push',
            slot: 'payment-push',
            permission: props.permissions.Push,
            selectionRequired: true
          }
        ]
      : []),
    ...(props.kind === 'application'
      ? [
          ...(['freeze', 'unfreeze', 'close'] as const).map((action) => ({
            key: action,
            label: action === 'freeze' ? '冻结' : action === 'unfreeze' ? '解冻' : '关闭',
            icon:
              action === 'freeze'
                ? 'ri:lock-line'
                : action === 'unfreeze'
                  ? 'ri:lock-unlock-line'
                  : 'ri:close-circle-line',
            permission: action === 'close' ? props.permissions.Close : props.permissions.Freeze,
            selectionRequired: true,
            disabled: ({ selectedRows }: ArtTableQueryHeaderActionContext) =>
              actionDisabled(action, selectedRows),
            onClick: ({ selectedRows }: { selectedRows: Record<string, unknown>[] }) =>
              act(
                selectedRows.map((row) => String(row.id)),
                action
              )
          }))
        ]
      : [
          {
            key: 'confirm',
            slot: 'payment-confirm',
            permission: props.permissions.Confirm,
            selectionRequired: true
          },
          {
            key: 'voucher',
            slot: 'payment-voucher',
            permission: props.permissions.Voucher,
            selectionRequired: true
          },
          {
            key: 'void',
            label: props.kind === 'refund' ? '作废未到账单' : '作废未付款单',
            icon: 'ri:prohibited-line',
            permission: props.permissions.Void,
            selectionRequired: true,
            disabled: ({ selectedRows }: ArtTableQueryHeaderActionContext) =>
              actionDisabled('void', selectedRows),
            onClick: ({ selectedRows }: { selectedRows: Record<string, unknown>[] }) =>
              act(
                selectedRows.map((row) => String(row.id)),
                'void'
              )
          }
        ]),
    {
      key: 'print',
      label: '打印',
      icon: 'ri:printer-line',
      permission: props.permissions.Print,
      selectionRequired: true,
      onClick: ({ selectedRows }) => print(selectedRows.map((row) => String(row.id)))
    },
    {
      type: 'export',
      permission: props.permissions.Export,
      exportFilename: title.value,
      exportColumns: [
        { key: 'documentNo', title: '单据编号' },
        { key: 'documentTypeName', title: '单据类型' },
        { key: 'businessDate', title: '业务日期' },
        { key: 'counterpartyName', title: '往来单位' },
        { key: 'amount', title: '金额' },
        { key: 'currencyCode', title: '币种' }
      ],
      exportApi: ({ searchParams, maxRows }) =>
        fetchRows({ ...searchParams, current: 1, size: maxRows })
    }
  ])
  const columnsFactory = (): ColumnOption<PayableSettlementDocument>[] => [
    { type: 'selection', width: 46 },
    ...(tenantScope.isAllTenants
      ? [
          {
            prop: 'tenant',
            label: '所属租户',
            minWidth: 190,
            formatter: (row: PayableSettlementDocument) => formatTenantLabel(row)
          }
        ]
      : []),
    {
      prop: 'documentNo',
      label: `${title.value}号`,
      minWidth: 215,
      fixed: 'left'
    },
    { prop: 'counterpartyName', label: '往来单位', minWidth: 220 },
    {
      prop: 'amount',
      label:
        props.kind === 'application'
          ? '申请金额(元)'
          : props.kind === 'refund'
            ? '退款本金(元)'
            : '实付金额(元)',
      width: 160,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.amount)
    },
    {
      prop: 'status',
      label: '单据状态',
      width: 135,
      formatter: (row) => (
        <ElTag type={row.status === 'confirmed' ? 'success' : 'info'}>
          {settlementStatusLabel(props.kind, row.status)}
          {row.frozen ? ' · 冻结' : ''}
        </ElTag>
      )
    },
    {
      prop: 'businessDate',
      label: props.kind === 'application' ? '申请日期' : '业务日期',
      width: 130
    },
    {
      prop: 'paymentStatus',
      label: props.kind === 'refund' ? '到账状态' : '付款状态',
      width: 130,
      formatter: (row) => settlementPaymentLabel(props.kind, row.paymentStatus || 'none')
    },
    { prop: 'documentTypeName', label: '单据类型', minWidth: 155 },
    { prop: 'reason', label: props.kind === 'application' ? '请款事由' : '摘要', minWidth: 220 },
    { prop: 'currencyCode', label: '结算币种', width: 110 },
    { prop: 'applicantName', label: '申请人', minWidth: 130 },
    {
      prop: 'organizationName',
      label: props.kind === 'refund' ? '退款组织' : '付款组织',
      minWidth: 180
    },
    {
      prop: 'operation',
      label: '操作',
      width: 100,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable type="view" label="查看" onClick={() => open(row)} />
          {row.status === 'draft' && !row.frozen && (
            <ArtButtonTable
              type="edit"
              label="编辑"
              permission={props.permissions.Edit}
              onClick={() => open(row, true)}
            />
          )}
        </BusinessTableRowActions>
      )
    }
  ]
</script>
