<template>
  <ArtPermissionGuard :permission="permissions.View" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        :title="title"
        :description="
          kind === 'estimated'
            ? '统一采购与运输暂估，按来源跟踪关联、到票冲回及剩余暂估。'
            : '到票立账、红字冲减与同源冲回，跟踪余额及付款计划。'
        "
        icon="ri:bill-line"
        density="compact"
      >
        <template #actions>
          <ElButton
            v-if="kind === 'estimated'"
            v-auth="'FinanceEstimatedPayable:Accrual'"
            @click="accrualRef?.handleOpen()"
            >自动暂估参数</ElButton
          >
          <BusinessTableWorkspaceActions :table="tableRef" />
        </template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :columns-context-key="search.viewMode"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        refresh-feedback="icon"
        :table-props="{
          rowKey: 'recordKey',
          emptyText: '暂无应付单',
          emptyDescription: '新建应付单，或从已审核采购入库单下推、导入已确认的TMS承运结算。'
        }"
        focusable
      >
        <template #payable-push="{ selectedRows }">
          <ElDropdown
            trigger="click"
            :disabled="pushDisabled(selectedRows)"
            @command="(command) => push(selectedRows[0]?.id, command)"
          >
            <ElButton
              :disabled="pushDisabled(selectedRows)"
              :title="
                kind === 'estimated' && selectedRows[0]?.standardPurchase
                  ? '标准采购请从同源采购入库单生成财务应付'
                  : undefined
              "
              :loading="busy"
              plain
              ><ArtSvgIcon icon="ri:file-transfer-line" />下推<ArtSvgIcon
                icon="ri:arrow-down-s-line"
            /></ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem v-if="canPushTarget('financial')" command="financial"
                  ><ArtSvgIcon icon="ri:bill-line" />财务应付</ElDropdownItem
                >
                <ElDropdownItem v-if="canPushTarget('application')" command="application"
                  ><ArtSvgIcon icon="ri:file-list-3-line" />付款申请</ElDropdownItem
                >
                <ElDropdownItem v-if="canPushTarget('payment')" command="payment"
                  ><ArtSvgIcon icon="ri:bank-card-line" />付款单</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
        <template #payable-voucher="{ selectedRows }">
          <ElDropdown
            trigger="click"
            :disabled="busy || selectedRows.length !== 1"
            @command="(command) => voucher(selectedRows[0]?.id, command)"
          >
            <ElButton :disabled="busy || selectedRows.length !== 1" :loading="busy" plain
              ><ArtSvgIcon icon="ri:file-list-3-line" />生成凭证<ArtSvgIcon
                icon="ri:arrow-down-s-line"
            /></ElButton>
            <template #dropdown
              ><ElDropdownMenu
                ><ElDropdownItem command="preview"
                  ><ArtSvgIcon icon="ri:file-search-line" />预览凭证</ElDropdownItem
                ><ElDropdownItem
                  command="generate"
                  :disabled="
                    busy || selectedRows.length !== 1 || selectedRows[0]?.status !== 'approved'
                  "
                  ><ArtSvgIcon icon="ri:file-add-line" />生成凭证</ElDropdownItem
                ></ElDropdownMenu
              ></template
            >
          </ElDropdown>
        </template>
      </ArtTableQuery>
      <PayableDocumentDrawer ref="drawerRef" :kind="kind" @success="tableRef?.refreshData()" />
      <MasterDataDeleteGuard ref="deleteGuardRef" />
      <ArtTableSingleSelect
        ref="carrierPickerRef"
        :show-trigger="false"
        :api-fn="carrierOptions"
        :columns="[
          { prop: 'name', label: '结算单号', minWidth: 180 },
          { prop: 'description', label: '承运商', minWidth: 200 }
        ]"
        row-key="id"
        label-key="name"
        title="导入TMS承运结算"
        subtitle="同一结算单每类应付只允许导入一次，保留既有付款与核销记录。"
        @confirm="(_key, rows) => importCarrier(rows)"
      />
      <ArtDialog ref="freezeDialogRef" size="sm" confirm-text="保存冻结状态">
        <ArtForm
          v-model="freezeForm"
          :items="freezeItems"
          :show-submit="false"
          :show-reset="false"
          label-position="top"
        />
      </ArtDialog>
      <FinanceVoucherPreview ref="voucherDialogRef" :result="voucherPreview" />
      <PayableAccrualManager v-if="kind === 'estimated'" ref="accrualRef" />
    </div>
  </ArtPermissionGuard>
</template>
<script setup lang="tsx">
  import { fetchOrganizationOptionsTree } from '@/api/system-manage'
  import FinanceVoucherPreview from '@/components/business/finance-voucher-preview/index.vue'
  import PayableAccrualManager from '@/components/business/payable-accrual-manager/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { formatTenantLabel } from '@/utils/tenant-display'
  import { pushPayableSettlement } from '@/api/payable-settlement'
  import { ElMessage, ElTag } from 'element-plus'
  import { uniq, escape } from 'lodash-es'
  import {
    fetchPurchasePayables,
    actPurchasePayable,
    fetchPayableDeleteDependencies,
    pushEstimatedPayable,
    fetchPayableOptions,
    importCarrierPayable,
    generatePayableVoucher,
    previewPayableVoucher,
    type PurchasePayableDocument,
    type PurchasePayableKind,
    type PayableSearch,
    type PayableAction,
    type PayableOption,
    type PayableVoucherPreview,
    type PayablePermissions
  } from '@/api/purchase-payable'
  import ArtTableQuery, {
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type { ArtDataSelectExpose } from '@/components/core/forms/art-data-select/types'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import PayableDocumentDrawer from './modules/payable-document-drawer.vue'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { payableStatusLabels } from '@/utils/finance/payable'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useRouteTableContext, useRouteOperationGuard } from '@/hooks/core/useRouteTableContext'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { printHtmlDocument } from '@/utils/file/print-document'
  import { financePaths } from '@/router/business-paths'
  import type { ColumnOption } from '@/types'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'

  const props = defineProps<{ kind: PurchasePayableKind; permissions: PayablePermissions }>()
  const accrualRef = ref<InstanceType<typeof PayableAccrualManager>>()
  const route = useRoute()
  const tenantScope = useTenantScopeStore()
  const router = useRouter()
  const captureRouteOperation = useRouteOperationGuard()
  const { hasAuth } = useAuth()
  const { confirmDelete } = useArtFeedback()
  const title = computed(() => (props.kind === 'estimated' ? '暂估应付单' : '财务应付单'))
  const permission = (action: keyof PayablePermissions) => props.permissions[action] || ''
  const captureImportOperation = useTenantOperationGuard(permission('View'))
  let carrierImportContext: { kind: PurchasePayableKind; isCurrent: () => boolean } | undefined
  const tableRef = ref<InstanceType<typeof ArtTableQuery>>()
  const drawerRef = ref<InstanceType<typeof PayableDocumentDrawer>>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const carrierPickerRef = ref<ArtDataSelectExpose>()
  const freezeDialogRef = ref<ArtDialogExpose>()
  const voucherDialogRef = ref<InstanceType<typeof FinanceVoucherPreview>>()
  const voucherPreview = ref<PayableVoucherPreview>()
  const busy = ref(false)
  useRouteTableContext(
    () =>
      props.kind === 'estimated' ? financePaths.estimatedPayable : financePaths.financialPayable,
    tableRef
  )
  const search = reactive({
    keyword: '',
    status: '',
    organizationId: '',
    documentTypeId: '',
    businessDateRange: [],
    viewMode: 'document',
    freezeStatus: '',
    matchingStatus: '',
    writeoffStatus: ''
  })
  const selectItems = (labels: string[], values: string[]) =>
    labels.map((label, index) => ({ label, value: values[index] }))
  const partialValues = ['none', 'partial', 'full']
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      key: 'keyword',
      label: '组合查询',
      type: 'input',
      props: { placeholder: '单据编号、来源单号', clearable: true }
    },
    {
      key: 'status',
      label: '单据状态',
      type: 'select',
      props: {
        clearable: true,
        options: selectItems(['暂存', '已提交', '已审核'], ['draft', 'submitted', 'approved'])
      }
    },
    {
      key: 'businessDateRange',
      label: '业务日期',
      type: 'daterange',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    {
      key: 'viewMode',
      label: '查询范围',
      type: 'select',
      props: {
        options: [
          { label: '按单据', value: 'document' },
          { label: '按明细', value: 'line' }
        ]
      }
    },
    {
      key: 'organizationId',
      label: '结算组织',
      type: 'treeSelect',
      api: () => fetchOrganizationOptionsTree(),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      childrenField: 'children',
      props: { clearable: true, filterable: true, checkStrictly: true }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      api: async () =>
        (await fetchPayableOptions(`${props.kind}_type`)).map((item) => ({
          label: item.name,
          value: item.id
        })),
      props: { clearable: true }
    },
    ...(props.kind === 'financial'
      ? [
          {
            key: 'matchingStatus',
            label: '勾稽状态',
            type: 'select',
            props: {
              clearable: true,
              options: selectItems(['未勾稽', '部分勾稽', '全部勾稽'], partialValues)
            }
          },
          {
            key: 'writeoffStatus',
            label: '核销状态',
            type: 'select',
            props: {
              clearable: true,
              options: selectItems(['未核销', '部分核销', '全部核销'], partialValues)
            }
          },
          {
            key: 'freezeStatus',
            label: '冻结状态',
            type: 'select',
            props: {
              clearable: true,
              options: selectItems(['未冻结', '部分冻结', '已冻结'], partialValues)
            }
          }
        ]
      : [])
  ])
  type ListRow = PurchasePayableDocument & { recordKey: string }
  function selectionDisabled(rows: Record<string, unknown>[], status: string): boolean {
    return (
      busy.value || !rows.length || rows.some((row) => row.status !== status || !!row.isReversal)
    )
  }
  function pushDisabled(rows: Record<string, unknown>[]): boolean {
    return (
      rows.length !== 1 ||
      !!rows[0]?.isCredit ||
      selectionDisabled(rows, 'approved') ||
      (props.kind === 'estimated'
        ? !canPushTarget('financial')
        : !canPushTarget('application') && !canPushTarget('payment')) ||
      (props.kind === 'estimated' && !!rows[0]?.standardPurchase)
    )
  }
  function canPushTarget(command: string): boolean {
    const target =
      props.kind === 'estimated'
        ? command === 'financial'
          ? 'FinancePurchasePayable'
          : ''
        : command === 'application'
          ? 'FinancePayableApplication'
          : command === 'payment'
            ? 'FinancePayablePayment'
            : ''
    return !!target && hasAuth(`${target}:Add`) && hasAuth(`${target}:View`)
  }
  async function fetchRows(query: PayableSearch) {
    const result = await fetchPurchasePayables(props.kind, {
      ...query,
      id: typeof route.query.recordId === 'string' ? route.query.recordId : undefined
    })
    return {
      ...result,
      data: result.data.map((row) => ({
        ...row,
        recordKey: query.viewMode === 'line' ? `${row.id}:${row.lines[0]?.id}` : row.id
      }))
    }
  }
  async function reloadDocument(id: string): Promise<PurchasePayableDocument> {
    const result = await fetchPurchasePayables(props.kind, { current: 1, size: 1, id })
    if (!result.data[0]) throw new Error('单据已变更或不可查看，请刷新列表')
    return result.data[0]
  }
  async function run(operation: () => Promise<void>): Promise<void> {
    if (busy.value) return
    busy.value = true
    try {
      await operation()
    } catch (error) {
      notifyFriendlyError(error, '操作未完成，请刷新核对单据状态后重试')
    } finally {
      busy.value = false
    }
  }
  function canEditDocument(row: PurchasePayableDocument): boolean {
    return row.status === 'draft' && !row.isReversal && row.sourceType !== 'carrier_statement'
  }
  async function open(row: PurchasePayableDocument, edit = false): Promise<void> {
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const document = await reloadDocument(row.id)
      if (!isCurrentRoute()) return
      if (edit && !canEditDocument(document)) {
        ElMessage.warning('单据状态已变化，请重新核对列表后操作')
        await tableRef.value?.refreshData()
        return
      }
      await drawerRef.value?.open(document, edit)
    })
  }
  async function act(ids: string[], action: PayableAction): Promise<void> {
    await run(async () => {
      await actPurchasePayable(uniq(ids), action)
      ElMessage.success('操作成功')
      await tableRef.value?.refreshData()
    })
  }
  async function remove(ids: string[]): Promise<void> {
    await run(async () => {
      const documents = await Promise.all(uniq(ids).map(reloadDocument))
      const guard = deleteGuardRef.value
      if (!guard) throw new Error('关联检查尚未就绪，请刷新后重试')
      const inspect = () =>
        guard.inspect({
          resourceLabel: title.value,
          resources: documents.map((row) => ({ id: row.id, label: row.documentNo })),
          fetchDependencies: fetchPayableDeleteDependencies,
          dependencyMeta: {
            payable: {
              label: '单据状态限制',
              unit: '张',
              description: '已提交、已审核及冲回单不能删除。',
              actionLabel: '查看单据',
              order: 1
            },
            estimated_payable: {
              label: '关联暂估冲回',
              unit: '张',
              description: '系统冲回单保留原暂估和财务应付的业务关系。',
              actionLabel: '查看暂估冲回',
              order: 3,
              routePath: financePaths.estimatedPayable,
              routeQuery: (record) => ({ recordId: record.targetId }),
              canNavigate: () => hasAuth('FinanceEstimatedPayable:View')
            },
            financial_payable: {
              label: '关联财务应付',
              unit: '张',
              description: '请先核对关联单据，不可删除经营历史。',
              actionLabel: '查看关联应付',
              order: 2,
              routePath: financePaths.financialPayable,
              routeQuery: (record) => ({ recordId: record.targetId }),
              canNavigate: () => hasAuth('FinancePurchasePayable:View')
            },
            payment_application: {
              label: '关联付款申请',
              unit: '张',
              description: '请核对已下推付款申请及其额度占用。',
              actionLabel: '查看申请',
              order: 4,
              routePath: financePaths.payableApplication,
              routeQuery: (record) => ({ recordId: record.targetId }),
              canNavigate: () => hasAuth('FinancePayableApplication:View')
            },
            payment: {
              label: '关联付款单',
              unit: '张',
              description: '已下推付款单保留来源关系，不能删除源应付。',
              actionLabel: '查看付款',
              order: 5,
              routePath: financePaths.payablePayment,
              routeQuery: (record) => ({ recordId: record.targetId }),
              canNavigate: () => hasAuth('FinancePayablePayment:View')
            }
          }
        })
      if (await inspect()) return
      try {
        await confirmDelete(`确认删除 ${documents.length} 张无关联的暂存应付单？`)
      } catch {
        return
      }
      try {
        await actPurchasePayable(
          documents.map((row) => row.id),
          'delete'
        )
      } catch (error) {
        if (await inspect()) return
        throw error
      }
      ElMessage.success('应付单已删除')
      tableRef.value?.clearSelection()
      await tableRef.value?.refreshData()
    })
  }
  async function push(id: string, command: string): Promise<void> {
    if (!hasAuth(permission('Push')) || !canPushTarget(command)) return
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      if (props.kind === 'financial') {
        if (command !== 'application' && command !== 'payment') return
        const source = await reloadDocument(id)
        if (source.isCredit) {
          ElMessage.warning('红字用于冲减应付，不能直接下推付款申请或付款单')
          return
        }
        if (
          (source.currencyCode || 'CNY') !== 'CNY' ||
          (source.baseCurrencyCode || 'CNY') !== 'CNY'
        ) {
          ElMessage.warning('外币付款与核销链路仍在接通中，不能按人民币金额下推付款')
          return
        }
        const created = await pushPayableSettlement(id, command)
        ElMessage.success(`已生成 ${created.documentNo}`)
        if (!isCurrentRoute()) return
        await tableRef.value?.refreshData()
        if (!isCurrentRoute()) return
        await router.push({
          path:
            command === 'application'
              ? financePaths.payableApplication
              : financePaths.payablePayment,
          query: { recordId: created.id }
        })
        return
      }
      const source = await reloadDocument(id)
      if (source.standardPurchase) {
        ElMessage.warning('标准采购请从同源采购入库单生成财务应付，不能从暂估直接下推')
        return
      }
      const created = await pushEstimatedPayable(id)
      ElMessage.success(`已生成 ${created.documentNo}`)
      if (!isCurrentRoute()) return
      await tableRef.value?.refreshData()
      if (!isCurrentRoute()) return
      await router.push({ path: financePaths.financialPayable, query: { recordId: created.id } })
    })
  }
  async function carrierOptions(): Promise<PayableOption[]> {
    return fetchPayableOptions('carrier_statement')
  }
  function openCarrierPicker(): void {
    const scopeCurrent = captureImportOperation()
    const requiredPermission = permission('Import')
    const canImport = () =>
      hasAuth(requiredPermission) &&
      hasAuth(permission('Add')) &&
      hasAuth('FinanceCarrierSettlement:View')
    if (busy.value || !scopeCurrent() || !canImport()) return
    const kind = props.kind
    carrierImportContext = {
      kind,
      isCurrent: () => scopeCurrent() && props.kind === kind && canImport()
    }
    void carrierPickerRef.value?.open()
  }
  async function importCarrier(rows: PayableOption[]): Promise<void> {
    if (!rows[0] || busy.value) return
    const context = carrierImportContext
    carrierImportContext = undefined
    if (!context?.isCurrent()) {
      ElMessage.warning('操作范围或权限已变化，请重新选择承运结算')
      return
    }
    busy.value = true
    try {
      await importCarrierPayable(context.kind, rows[0].id)
      if (!context.isCurrent()) return
      ElMessage.success('已导入TMS应付')
      await tableRef.value?.refreshData()
    } catch (error) {
      if (context.isCurrent()) notifyFriendlyError(error, '承运结算未导入，请重新选择后重试')
    } finally {
      busy.value = false
    }
  }
  const freezeForm = reactive({ amount: 0, reason: '' })
  const freezeUnfreezing = ref(false)
  const freezeItems = computed<FormItem[]>(() => [
    {
      key: 'amount',
      label: '冻结金额(原币)',
      type: 'number',
      span: 24,
      props: { min: 0, precision: 2, disabled: freezeUnfreezing.value }
    },
    {
      key: 'reason',
      label: '冻结/解冻原因',
      type: 'textarea',
      span: 24,
      props: { maxlength: 500, rows: 3 }
    }
  ])
  function canFreezeDocument(row: PurchasePayableDocument): boolean {
    const available = Math.abs(row.unpaidAmount ?? row.totalAmount)
    return (
      row.status === 'approved' &&
      (!!row.frozenAmount || (Number.isFinite(available) && available > 0))
    )
  }
  async function freeze(id: string, unfreeze: boolean): Promise<void> {
    if (props.kind !== 'financial' || !hasAuth(permission('Freeze'))) return
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const row = await reloadDocument(id)
      if (!isCurrentRoute()) return
      if (!canFreezeDocument(row) || Boolean(row.frozenAmount) !== unfreeze) {
        ElMessage.warning('冻结状态已变化，请重新核对列表后操作')
        await tableRef.value?.refreshData()
        return
      }
      const available = Math.abs(row.unpaidAmount ?? row.totalAmount)
      freezeUnfreezing.value = unfreeze
      freezeForm.amount = unfreeze ? 0 : available
      freezeForm.reason = ''
      await freezeDialogRef.value?.handleOpen(undefined, {
        title: `${unfreeze ? '解冻财务应付' : '冻结财务应付'} · ${row.currencyCode || 'CNY'}`,
        onConfirm: async () => {
          if (!freezeForm.reason.trim()) {
            ElMessage.warning('请填写原因')
            return false
          }
          if (
            !unfreeze &&
            (!Number.isFinite(freezeForm.amount) ||
              freezeForm.amount <= 0 ||
              freezeForm.amount > available)
          ) {
            ElMessage.warning('冻结金额应大于零且不超过未付余额')
            return false
          }
          try {
            await actPurchasePayable(
              [id],
              unfreeze ? 'unfreeze' : 'freeze',
              freezeForm.reason,
              freezeForm.amount
            )
            ElMessage.success('冻结状态已更新')
            await tableRef.value?.refreshData()
            return true
          } catch (error) {
            notifyFriendlyError(error, '冻结状态未更新，请重试')
            return false
          }
        }
      })
    })
  }
  async function voucher(id: string, command: string): Promise<void> {
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      if (command === 'preview') {
        const result = await previewPayableVoucher(id)
        if (!isCurrentRoute()) return
        voucherPreview.value = result
        await voucherDialogRef.value?.handleOpen()
        return
      }
      const result = await generatePayableVoucher(id)
      if (result.voucherId) {
        ElMessage.success('记账凭证已生成')
        if (!isCurrentRoute()) return
        if (hasAuth('FinanceVoucherCenter:View'))
          await router.push({
            path: financePaths.voucherCenter,
            query: { recordId: result.voucherId }
          })
      } else ElMessage.warning(result.message)
      if (isCurrentRoute()) await tableRef.value?.refreshData()
    })
  }
  async function print(ids: string[]): Promise<void> {
    await run(async () => {
      const isCurrentRoute = captureRouteOperation()
      const records = await Promise.all(uniq(ids).map(reloadDocument))
      if (!isCurrentRoute()) return
      const body = records
        .map(
          (record) =>
            `<section><h1>${escape(title.value)} ${escape(record.documentNo)}</h1><p>${escape(record.supplierName || '')} · ${escape(record.businessDate)} · ${escape(record.currencyCode || 'CNY')} · 记账汇率 ${record.exchangeRate ?? 1}</p><table><thead><tr><th>行号</th><th>物料描述</th><th>数量</th><th>金额</th><th>税额</th><th>价税合计</th></tr></thead><tbody>${record.lines.map((line) => `<tr><td>${line.lineNo}</td><td>${escape(line.materialDescription || '')}</td><td>${line.quantity}</td><td>${formatCurrencyValue(line.amount, record.currencyCode || 'CNY')}</td><td>${formatCurrencyValue(line.taxAmount, record.currencyCode || 'CNY')}</td><td>${formatCurrencyValue(line.totalAmount, record.currencyCode || 'CNY')}</td></tr>`).join('')}</tbody></table><p>合计 ${formatCurrencyValue(record.totalAmount, record.currencyCode || 'CNY')}</p></section>`
        )
        .join('')
      printHtmlDocument(
        `<html><head><title>${escape(title.value)}</title><style>body{font:14px sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:8px;text-align:left}section{break-after:page}</style></head><body>${body}</body></html>`
      )
    })
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      permission: permission('Add'),
      onClick: () => drawerRef.value?.open(undefined, true)
    },
    {
      key: 'import-tms',
      label: '导入TMS',
      icon: 'ri:download-cloud-2-line',
      permission: permission('Import'),
      disabled:
        busy.value || !hasAuth(permission('Add')) || !hasAuth('FinanceCarrierSettlement:View'),
      onClick: openCarrierPicker
    },
    {
      key: 'submit',
      label: '提交',
      icon: 'ri:send-plane-line',
      permission: permission('Submit'),
      selectionRequired: true,
      disabled: ({ selectedRows }) => selectionDisabled(selectedRows, 'draft'),
      onClick: ({ selectedRows }) =>
        act(
          selectedRows.map((row) => String(row.id)),
          'submit'
        )
    },
    {
      key: 'approve',
      label: '审核',
      icon: 'ri:checkbox-circle-line',
      permission: permission('Approve'),
      selectionRequired: true,
      disabled: ({ selectedRows }) => selectionDisabled(selectedRows, 'submitted'),
      onClick: ({ selectedRows }) =>
        act(
          selectedRows.map((row) => String(row.id)),
          'approve'
        )
    },
    {
      key: 'remove',
      label: '删除',
      icon: 'ri:delete-bin-line',
      permission: permission('Delete'),
      selectionRequired: true,
      disabled: ({ selectedRows }) => selectionDisabled(selectedRows, 'draft'),
      onClick: ({ selectedRows }) => remove(selectedRows.map((row) => String(row.id)))
    },
    ...[
      {
        key: 'push',
        slot: 'payable-push',
        permission: permission('Push'),
        selectionRequired: true
      }
    ],
    {
      key: 'voucher',
      slot: 'payable-voucher',
      permission: permission('Voucher'),
      selectionRequired: true
    },
    {
      key: 'print',
      label: '打印',
      icon: 'ri:printer-line',
      permission: permission('Print'),
      selectionRequired: true,
      onClick: ({ selectedRows }) => print(selectedRows.map((row) => String(row.id)))
    },
    {
      type: 'export',
      permission: permission('Export'),
      exportFilename: title.value,
      exportColumns: [
        { key: 'documentNo', title: '单据编号' },
        { key: 'currencyCode', title: '结算币种' },
        { key: 'exchangeRate', title: '记账汇率' },
        { key: 'baseCurrencyCode', title: '本位币' },
        { key: 'baseTotalAmount', title: '价税合计(本位币)' },
        { key: 'supplierName', title: '往来单位' },
        { key: 'businessDate', title: '业务日期' },
        { key: 'amount', title: '金额(原币)' },
        { key: 'taxAmount', title: '税额(原币)' },
        { key: 'totalAmount', title: '价税合计(原币)' }
      ],
      exportApi: async ({ searchParams, maxRows }) =>
        fetchRows({ ...searchParams, current: 1, size: maxRows })
    }
  ])
  const moneyColumn = (
    prop: keyof PurchasePayableDocument,
    label: string
  ): ColumnOption<ListRow> => ({
    prop,
    label,
    minWidth: 155,
    align: 'right',
    formatter: (row) => formatCurrencyValue(Number(row[prop] || 0), row.currencyCode || 'CNY')
  })
  const columnsFactory = (): ColumnOption<ListRow>[] => [
    { type: 'selection', width: 46 },
    ...(tenantScope.isAllTenants
      ? [
          {
            prop: 'tenant',
            label: '所属租户',
            minWidth: 190,
            formatter: (row: ListRow) => formatTenantLabel(row)
          }
        ]
      : []),
    {
      prop: 'documentNo',
      label: '单据编号',
      minWidth: 245,
      fixed: 'left',
      formatter: (row) => (
        <BusinessTableIdentityCell
          primary={row.documentNo}
          secondary={
            row.isCredit
              ? '红字冲减'
              : row.isReversal
                ? '暂估冲回'
                : row.documentTypeName || (props.kind === 'estimated' ? '暂估应付' : '蓝字应付')
          }
          icon="ri:bill-line"
          iconTone={row.isCredit ? 'danger' : 'primary'}
        />
      )
    },
    { prop: 'supplierName', label: '往来单位', minWidth: 180 },
    {
      prop: 'baseTotalAmount',
      label: '价税合计(本位币)',
      minWidth: 175,
      align: 'right',
      formatter: (row) =>
        formatCurrencyValue(row.baseTotalAmount ?? row.totalAmount, row.baseCurrencyCode || 'CNY')
    },
    {
      prop: 'status',
      label: '单据状态',
      width: 110,
      formatter: (row) => (
        <ElTag type={row.status === 'approved' ? 'success' : 'info'}>
          {payableStatusLabels[row.status]}
        </ElTag>
      )
    },
    { prop: 'documentTypeName', label: '单据类型', minWidth: 155 },
    ...(props.kind === 'financial'
      ? [
          {
            prop: 'isCredit',
            label: '应付方向',
            width: 110,
            formatter: (row: ListRow) =>
              row.isCredit ? (
                <ElTag type="danger" effect="plain">
                  红字冲减
                </ElTag>
              ) : (
                '蓝字应付'
              )
          }
        ]
      : []),
    { prop: 'businessDate', label: '业务日期', width: 120 },
    {
      prop: 'currencyCode',
      label: '结算币种',
      width: 100,
      formatter: (row) => row.currencyCode || 'CNY'
    },
    {
      prop: 'exchangeRate',
      label: '记账汇率',
      width: 130,
      formatter: (row) => row.exchangeRate ?? 1
    },
    ...(search.viewMode === 'line'
      ? [
          {
            prop: 'materialDescription',
            label: '物料描述',
            minWidth: 180,
            formatter: (row: ListRow) => row.lines[0]?.materialDescription
          },
          {
            prop: 'lineNo',
            label: '源行号',
            width: 90,
            formatter: (row: ListRow) => row.lines[0]?.sourceLineNo || row.lines[0]?.lineNo
          }
        ]
      : []),
    {
      prop: 'taxExcludedFromCost',
      label: '税额不计入成本',
      width: 145,
      formatter: (row) => (row.taxExcludedFromCost === false ? '否' : '是')
    },
    moneyColumn('amount', '金额(原币)'),
    moneyColumn('taxAmount', '税额(原币)'),
    moneyColumn('totalAmount', '价税合计(原币)'),
    ...(props.kind === 'estimated'
      ? [
          moneyColumn('unreversedAmount', '未冲回价税合计(原币)'),
          moneyColumn('linkedAmount', '已关联财务应付金额(原币)'),
          moneyColumn('unlinkedAmount', '未关联财务应付金额(原币)'),
          {
            prop: 'isReversal',
            label: '冲回单',
            width: 90,
            formatter: (row: ListRow) => (row.isReversal ? '是' : '否')
          }
        ]
      : [
          moneyColumn('writtenOffAmount', '已核销金额(原币)'),
          moneyColumn('unpaidAmount', '未核销金额(原币)'),
          moneyColumn('matchedAmount', '已勾稽金额(原币)'),
          moneyColumn('unmatchedAmount', '未勾稽金额(原币)'),
          {
            prop: 'matchingStatus',
            label: '勾稽状态',
            width: 115,
            formatter: (row: ListRow) =>
              row.matchingStatus === 'full'
                ? '全部勾稽'
                : row.matchingStatus === 'partial'
                  ? '部分勾稽'
                  : '未勾稽'
          },
          {
            prop: 'writeoffStatus',
            label: '核销状态',
            width: 115,
            formatter: (row: ListRow) =>
              row.writeoffStatus === 'full'
                ? '全部核销'
                : row.writeoffStatus === 'partial'
                  ? '部分核销'
                  : '未核销'
          },
          moneyColumn('frozenAmount', '冻结金额(原币)'),
          {
            prop: 'freezeStatus',
            label: '冻结状态',
            width: 115,
            formatter: (row: ListRow) =>
              row.freezeStatus === 'full'
                ? '已冻结'
                : row.freezeStatus === 'partial'
                  ? '部分冻结'
                  : '未冻结'
          }
        ]),
    { prop: 'organizationName', label: '结算组织', minWidth: 160 },
    {
      prop: 'sourceType',
      label: '源单类型',
      minWidth: 150,
      formatter: (row) =>
        row.sourceType === 'carrier_statement'
          ? '承运商对账单'
          : row.sourceType === 'purchase_inbound'
            ? '采购入库单'
            : '手工录入'
    },
    { prop: 'sourceDocumentNo', label: '源单据号', minWidth: 190 },
    { prop: 'invoiceNo', label: '发票号码', minWidth: 160 },
    { prop: 'remark', label: '备注', minWidth: 180 },
    { prop: 'voucherNo', label: '凭证号', minWidth: 150 },
    {
      prop: 'voucherGenerated',
      label: '已生成凭证',
      width: 120,
      formatter: (row) => (row.voucherId ? '是' : '否')
    },
    { prop: 'createdBy', label: '创建人', minWidth: 140 },
    {
      prop: 'operation',
      label: '操作',
      width: props.kind === 'financial' ? 150 : 100,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="view"
            permission={props.permissions.View}
            label="查看"
            onClick={() => open(row)}
          />
          {canEditDocument(row) && (
            <ArtButtonTable
              type="edit"
              permission={permission('Edit')}
              label="编辑"
              onClick={() => open(row, true)}
            />
          )}
          {props.kind === 'financial' && canFreezeDocument(row) && (
            <ArtButtonTable
              icon={row.frozenAmount ? 'ri:lock-unlock-line' : 'ri:lock-line'}
              permission={permission('Freeze')}
              label={row.frozenAmount ? '解冻' : '冻结'}
              onClick={() => freeze(row.id, Boolean(row.frozenAmount))}
            />
          )}
        </BusinessTableRowActions>
      )
    }
  ]
</script>
