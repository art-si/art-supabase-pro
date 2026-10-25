<template>
  <ArtDrawer ref="drawerRef" size="88%">
    <div v-if="document" class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        icon="ri:secure-payment-line"
        :title="document.documentNo || `新增${title}`"
        :description="`${document.reason || '按明细登记往来单位与资金用途'} · 记账日期 ${document.businessDate}`"
      >
        <template #aside
          ><ElTag :type="document.status === 'confirmed' ? 'success' : 'info'"
            >{{ settlementStatusLabel(kind, document.status)
            }}{{ document.frozen ? ' · 已冻结' : '' }}</ElTag
          ></template
        >
      </ArtEntitySummary>
      <ArtSectionCard
        title="基本信息"
        subtitle="编号由系统按月生成；记账日期与业务日期一致。"
        :loading="loading"
        :error="error"
        @retry="loadOptions"
      >
        <ArtForm
          v-if="editable"
          ref="formRef"
          v-model="document"
          root-class="art-form--mobile-stack"
          :items="headerItems"
          :rules="{
            documentTypeId: [{ required: true, message: '请选择单据类型' }],
            businessDate: [{ required: true, message: '请选择日期' }]
          }"
          :span="6"
          label-position="top"
          :show-submit="false"
          :show-reset="false"
        />
        <ArtDescriptions v-else :data="document" :items="readOnlyItems" />
      </ArtSectionCard>
      <ArtSectionCard
        :title="
          kind === 'refund' ? '退款收款明细' : kind === 'application' ? '付款申请明细' : '付款明细'
        "
        :subtitle="`共 ${document.lines.length} 行 · ${kind === 'refund' ? '退款本金' : kind === 'application' ? '申请金额' : '实付金额'} ${formatCurrencyValue(total)}`"
      >
        <template #actions>
          <ElButton v-if="editable" :disabled="loading || !!error" @click="addLine"
            ><ArtSvgIcon icon="ri:add-line" />新增明细</ElButton
          >
        </template>
        <ElAlert
          v-if="editable"
          class="mb-4"
          :closable="false"
          type="info"
          :title="
            kind === 'application'
              ? '核准与预计付款金额不得超过申请金额；关联应付后将占用可用余额。'
              : kind === 'refund'
                ? '仅退原付款未核销现金本金，不含手续费或虚拟结算。同源可拆行收至同账套账户；退完全部本金时剩余未兑现折扣自动失效，不作现金退款或已实现损益。'
                : '确认付款登记实际资金流；核销由所选方案另行匹配。取消付款保留冲回与操作记录，不代表银行已退款。'
          "
        />
        <ArtTable
          :data="document.lines"
          :columns="columns"
          :pagination="false"
          row-key="clientKey"
          :max-height="390"
        >
          <template v-for="field in referenceFields" :key="field" #[field]="{ row }">
            <ElTreeSelect
              v-if="editable && kind !== 'refund' && field === 'departmentId'"
              v-model="row.departmentId"
              aria-label="费用承担部门"
              :data="organizationTree"
              :props="{ label: 'organizationName', children: 'children' }"
              node-key="id"
              :disabled="referenceDisabled(row, field)"
              :cache-data="
                row.departmentId
                  ? [{ id: row.departmentId, organizationName: referenceLabel(row, field) }]
                  : []
              "
              check-strictly
              filterable
              clearable
              class="w-full!"
              @change="referenceChanged(row, field)"
            />
            <ElSelect
              v-else-if="
                editable &&
                !(
                  kind === 'refund' &&
                  [
                    'supplierId',
                    'payeeSupplierId',
                    'projectId',
                    'contractId',
                    'departmentId'
                  ].includes(field)
                )
              "
              v-model="row[field]"
              :aria-label="referenceLabels[field]"
              :disabled="referenceDisabled(row, field)"
              filterable
              clearable
              class="w-full!"
              @change="referenceChanged(row, field)"
            >
              <ElOption
                v-if="
                  row[field] && !fieldOptions(field, row).some((option) => option.id === row[field])
                "
                :value="row[field]"
                :label="referenceLabel(row, field)"
                disabled
              />
              <ElOption
                v-for="option in fieldOptions(field, row)"
                :key="option.id"
                :value="option.id"
                :label="referenceOptionLabel(field, option)"
              />
            </ElSelect>
            <span v-else>{{ referenceLabel(row, field) }}</span>
          </template>
          <template v-for="field in numericFields" :key="field" #[field]="{ row }">
            <ElInputNumber
              v-if="editable"
              v-model="row[field]"
              :aria-label="
                field === 'amount' && kind === 'payment' ? '实付金额' : numericLabels[field]
              "
              :min="0"
              :max="field === 'taxRate' ? 100 : undefined"
              :precision="2"
              :controls="false"
              class="w-full!"
              @change="(value, previous) => amountChanged(row, field, value, previous)"
            />
            <span v-else>{{
              field === 'taxRate' ? `${row[field]}%` : formatCurrencyValue(row[field])
            }}</span>
          </template>
          <template v-for="field in textFields" :key="field" #[field]="{ row }">
            <ElSelect
              v-if="editable && field === 'bankAccount'"
              v-model="row.bankAccount"
              aria-label="对方银行账号"
              filterable
              allow-create
              default-first-option
              class="w-full!"
              @change="bankChanged(row)"
            >
              <ElOption
                v-for="bank in supplierBanks(row)"
                :key="bank.id"
                :value="bank.bankAccount"
                :label="`${bank.bankName} · ${bank.bankAccount}`"
              />
            </ElSelect>
            <ElInput
              v-else-if="editable"
              v-model="row[field]"
              :aria-label="textLabels[field]"
              maxlength="200"
            /><span v-else>{{ row[field] || '—' }}</span>
          </template>
          <template #source="{ row }">
            <ElSelect
              v-if="editable && kind === 'refund' && !row.id"
              v-model="row.refundPaymentLineId"
              aria-label="原付款明细"
              filterable
              class="w-full!"
              @change="(value) => selectRefundSource(row, value)"
            >
              <ElOption
                v-if="
                  row.refundPaymentLineId &&
                  !options?.refundSource?.some(
                    (source) => source.refundPaymentLineId === row.refundPaymentLineId
                  )
                "
                :value="row.refundPaymentLineId"
                :label="row.refundPaymentDocumentNo || row.sourceDocumentNo || '原付款明细'"
                disabled
              />
              <ElOption
                v-for="source in options?.refundSource || []"
                :key="source.refundPaymentLineId || source.id || source.lineNo"
                :value="source.refundPaymentLineId || ''"
                :label="`${source.refundPaymentDocumentNo} / ${source.lineNo} · ${source.supplierName || '承运商'} · 可退 ${formatCurrencyValue(source.availableRefundAmount || 0)}`"
              />
            </ElSelect>
            <ElSelect
              v-else-if="editable && kind !== 'refund' && !row.applicationLineId"
              :model-value="row.payableId || row.purchaseId"
              aria-label="来源单据"
              filterable
              clearable
              class="w-full!"
              @change="(value) => selectSource(row, value)"
            >
              <ElOption
                v-if="
                  (row.payableId || row.purchaseId) &&
                  ![...(options?.payable || []), ...(options?.purchase || [])].some(
                    (option) => option.id === (row.payableId || row.purchaseId)
                  )
                "
                :value="row.payableId || row.purchaseId"
                :label="row.sourceDocumentNo || '来源已停用，请重新选择'"
                disabled
              />
              <ElOptionGroup label="财务应付"
                ><ElOption
                  v-for="option in options?.payable || []"
                  :key="option.id"
                  :value="option.id"
                  :label="`${option.code} · ${option.name}`"
              /></ElOptionGroup>
              <ElOptionGroup label="采购合同 / 订单预付款"
                ><ElOption
                  v-for="option in options?.purchase || []"
                  :key="option.id"
                  :value="option.id"
                  :label="`${option.code} · ${option.name}`"
              /></ElOptionGroup> </ElSelect
            ><span v-else>{{
              row.refundPaymentDocumentNo || row.sourceDocumentNo || '手工新增'
            }}</span>
          </template>
          <template #employee="{ row }">
            <ArtEmployeeSelect
              v-if="editable && kind !== 'refund'"
              :model-value="row.details.employeeId || undefined"
              :api-fn="fetchPayableEmployeeSelector"
              :selected-data="selectedEmployee(row)"
              @update:model-value="row.details.employeeId = $event || null"
              :tenant-id="document.tenantId"
              title="选择采购员"
              @confirm="
                (_keys, employees) => {
                  row.details.employeeName = employees[0]?.employeeName
                  row.details.employeeNo = employees[0]?.employeeNo
                }
              "
            />
            <span v-else>{{ row.details.employeeName || '—' }}</span>
          </template>
          <template #expense="{ row }">
            <ElSelect
              v-if="editable && kind !== 'refund'"
              v-model="row.details.expenseItemId"
              aria-label="费用项目"
              filterable
              clearable
              ><ElOption
                v-for="option in options?.expense || []"
                :key="option.id"
                :value="option.id"
                :label="option.name"
            /></ElSelect>
            <span v-else>{{
              options?.expense.find((option) => option.id === row.details.expenseItemId)?.name ||
              '—'
            }}</span>
          </template>
          <template #sourceLineNo="{ row }"
            ><ElInput
              v-if="editable && kind !== 'refund'"
              v-model="row.details.sourceLineNo"
              aria-label="源行号"
              maxlength="80"
            /><span v-else>{{ row.details.sourceLineNo || '—' }}</span></template
          >
          <template #operation="{ row }">
            <BusinessTableRowActions v-if="editable">
              <ArtButtonTable icon="ri:file-copy-line" label="复制明细" @click="copyLine(row)" />
              <ArtButtonTable type="delete" label="删除明细" @click="removeLine(row)" />
            </BusinessTableRowActions>
          </template>
        </ArtTable>
      </ArtSectionCard>
      <ArtSectionCard
        :title="kind === 'refund' ? '退款金额说明' : '金额与付款说明'"
        :subtitle="
          kind === 'refund'
            ? '退款本金与失效折扣分开记录；保存时校准同源全额退款的失效折扣。'
            : kind === 'application'
              ? '申请、核准及预计金额由明细汇总；手续费不冲减供应商应付余额。'
              : '实付金额由明细汇总；确认付款后登记资金流水，手续费不冲减供应商应付余额。'
        "
      >
        <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div
            ><p class="text-sm text-g-600">{{
              kind === 'refund' ? '退款本金' : kind === 'application' ? '申请金额' : '实付金额'
            }}</p
            ><p class="mt-1 text-xl font-semibold text-warning">{{
              formatCurrencyValue(total)
            }}</p></div
          >
          <div v-if="kind === 'application'"
            ><p class="text-sm text-g-600">核准金额</p
            ><p class="mt-1 text-lg font-medium">{{
              formatCurrencyValue(
                document.lines.reduce((sum, row) => sum + Number(row.approvedAmount || 0), 0)
              )
            }}</p></div
          >
          <div v-if="kind === 'application'"
            ><p class="text-sm text-g-600">预计付款金额</p
            ><p class="mt-1 text-lg font-medium">{{
              formatCurrencyValue(
                document.lines.reduce((sum, row) => sum + Number(row.plannedAmount || 0), 0)
              )
            }}</p></div
          >
          <div v-if="kind === 'payment'"
            ><p class="mb-1 text-sm text-g-600">付款方手续费(元)</p
            ><ElInputNumber
              v-if="editable"
              v-model="document.details.fee"
              aria-label="付款方手续费"
              :min="0"
              :precision="2"
              :controls="false"
            /><p v-else>{{ formatCurrencyValue(document.details.fee || 0) }}</p></div
          >
          <div v-if="kind === 'refund'">
            <p class="text-sm text-g-600">失效折扣（非现金）</p>
            <p class="mt-1 text-lg font-medium">{{
              formatCurrencyValue(
                document.lines.reduce((sum, row) => sum + Number(row.expiredDiscountAmount || 0), 0)
              )
            }}</p>
          </div>
        </div>
      </ArtSectionCard>
    </div>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </ArtDrawer>
</template>
<script setup lang="ts">
  import { fetchOrganizationOptionsTree } from '@/api/system-manage'
  import { cloneDeep } from 'lodash-es'
  import { unref } from 'vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import type { EmployeeIntegrationItem } from '@/api/integration/employees'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtEmployeeSelect from '@/components/business/art-employee-select/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import {
    fetchPayableEmployeeSelector,
    fetchPayableSettlementOptions,
    savePayableSettlement,
    fetchSettlementDeleteDependencies,
    type PayableSettlementDocument,
    type PayableSettlementKind,
    type PayableSettlementLine,
    type PayableSettlementOptions,
    type PayableSettlementOption
  } from '@/api/payable-settlement'
  import {
    settlementStatusLabel,
    settlementTitles,
    newPayableSettlement,
    newPayableSettlementLine,
    validateSettlementAmounts
  } from '@/utils/finance/payable-settlement'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import type { ColumnOption } from '@/types'

  const props = defineProps<{ kind: PayableSettlementKind }>()
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const { hasAuth } = useAuth()
  const permissionMap = {
    application: {
      View: 'FinancePayableApplication:View',
      Add: 'FinancePayableApplication:Add',
      Edit: 'FinancePayableApplication:Edit'
    },
    payment: {
      View: 'FinancePayablePayment:View',
      Add: 'FinancePayablePayment:Add',
      Edit: 'FinancePayablePayment:Edit'
    },
    refund: {
      View: 'FinancePayableRefund:View',
      Add: 'FinancePayableRefund:Add',
      Edit: 'FinancePayableRefund:Edit'
    }
  }
  const captureOperation = useTenantOperationGuard(permissionMap[props.kind].View)
  const session = useArtOverlaySession(() => Boolean(unref(drawerRef.value?.visible)))
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const document = ref<PayableSettlementDocument>()
  const options = ref<PayableSettlementOptions>()
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const editable = ref(false)
  const loading = ref(false)
  const error = ref('')
  watch(
    [loading, error],
    () => drawerRef.value?.setOptions({ confirmDisabled: loading.value || Boolean(error.value) }),
    { flush: 'sync' }
  )
  let requestVersion = 0
  const { confirmDelete } = useArtFeedback()
  const title = computed(() => settlementTitles[props.kind])
  const total = computed(
    () => document.value?.lines.reduce((sum, row) => sum + Number(row.amount || 0), 0) || 0
  )
  const referenceFields = [
    'purposeId',
    'supplierId',
    'payeeSupplierId',
    'projectId',
    'contractId',
    'departmentId',
    'settlementMethodId',
    'fundAccountId'
  ] as const
  type ReferenceField = (typeof referenceFields)[number]
  const referenceLabels: Record<ReferenceField, string> = {
    purposeId: props.kind === 'refund' ? '退款用途' : '付款用途',
    supplierId: '往来单位',
    payeeSupplierId: props.kind === 'refund' ? '原收款单位' : '收款单位',
    projectId: '项目名称',
    contractId: '合同',
    departmentId: '费用承担部门',
    settlementMethodId: '结算方式',
    fundAccountId: props.kind === 'refund' ? '退款收款账户' : '付款账号'
  }
  const referenceKeys = {
    purposeId: 'purpose',
    supplierId: 'supplier',
    payeeSupplierId: 'supplier',
    projectId: 'project',
    contractId: 'purchase',
    departmentId: 'organization',
    settlementMethodId: 'method',
    fundAccountId: 'fund'
  } as const
  const numericFields = computed(() =>
    props.kind === 'application'
      ? (['amount', 'approvedAmount', 'plannedAmount'] as const)
      : props.kind === 'refund'
        ? (['amount', 'expiredDiscountAmount'] as const)
        : (['amount', 'cashDiscount', 'taxRate'] as const)
  )
  type NumericField =
    | 'amount'
    | 'approvedAmount'
    | 'plannedAmount'
    | 'cashDiscount'
    | 'taxRate'
    | 'expiredDiscountAmount'
  const numericLabels: Record<NumericField, string> = {
    amount: props.kind === 'refund' ? '退款本金' : '申请金额',
    approvedAmount: '核准金额',
    plannedAmount: '预计付款金额',
    cashDiscount: '现金折扣',
    taxRate: '税率',
    expiredDiscountAmount: '失效折扣'
  }
  const textFields = computed(() =>
    props.kind === 'refund'
      ? (['bankReference', 'fundPurpose', 'remark'] as const)
      : ([
          'bankAccount',
          'bankAccountName',
          'bankName',
          'bankReference',
          'fundPurpose',
          'remark'
        ] as const)
  )
  const textLabels = {
    bankAccount: '对方银行账号',
    bankAccountName: '对方账号名称',
    bankName: '对方账户开户行',
    bankReference: props.kind === 'refund' ? '到账流水号 / 附言' : '转账附言',
    fundPurpose: '资金用途',
    remark: '备注'
  }
  const toSelect = (key: 'documentType' | 'organization' | 'currency') =>
    (options.value?.[key] || []).map((option) => ({ value: option.id, label: option.name }))
  const headerItems = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: `${title.value}号`,
      type: 'input',
      props: { disabled: true, placeholder: '保存后自动生成' }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      props: { options: toSelect('documentType') }
    },
    {
      key: 'businessDate',
      label: props.kind === 'application' ? '申请日期' : '业务日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    {
      key: 'currencyCode',
      label:
        props.kind === 'refund'
          ? '退款币种'
          : props.kind === 'application'
            ? '结算币种'
            : '付款币种',
      type: 'select',
      props: { options: toSelect('currency'), disabled: props.kind === 'refund' }
    },
    ...(props.kind === 'payment'
      ? [
          {
            key: 'details.paymentType',
            label: '支付类型',
            type: 'select',
            span: 8,
            props: {
              options: [
                { value: 'active', label: '主动付款' },
                { value: 'passive', label: '被动付款' }
              ]
            }
          } as FormItem
        ]
      : []),
    {
      key: 'organizationId',
      label: props.kind === 'refund' ? '退款组织' : '付款组织',
      type: 'treeSelect',
      span: props.kind === 'application' ? 12 : 8,
      api: () => fetchOrganizationOptionsTree({ tenantId: document.value?.tenantId }),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      childrenField: 'children',
      props: { clearable: true, filterable: true, checkStrictly: true }
    },
    {
      key: 'applicantName',
      label: '申请人',
      type: 'input',
      span: props.kind === 'application' ? 12 : 8,
      props: { disabled: true, placeholder: '保存后带入当前操作人' }
    },
    {
      key: 'reason',
      label: props.kind === 'application' ? '请款事由' : '摘要',
      type: 'textarea',
      span: 12,
      props: { autosize: { minRows: 2, maxRows: 4 }, maxlength: 500 }
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 12,
      props: { autosize: { minRows: 2, maxRows: 4 }, maxlength: 500 }
    }
  ])
  const readOnlyItems = [
    { key: 'documentTypeName', field: 'documentTypeName', label: '单据类型' },
    { key: 'businessDate', field: 'businessDate', label: '业务日期' },
    { key: 'postingDate', field: 'postingDate', label: '记账日期' },
    {
      key: 'organizationName',
      field: 'organizationName',
      label: props.kind === 'refund' ? '退款组织' : '付款组织'
    },
    { key: 'applicantName', field: 'applicantName', label: '申请人' },
    { key: 'currencyCode', field: 'currencyCode', label: '结算币种' },
    { key: 'reason', field: 'reason', label: '请款事由 / 摘要', span: 3 },
    { key: 'remark', field: 'remark', label: '备注', span: 3 }
  ]
  const columns = computed<ColumnOption<PayableSettlementLine>[]>(() => [
    { prop: 'lineNo', label: '行号', width: 70, fixed: 'left' },
    { prop: 'source', label: '来源单据', width: 265, useSlot: true },
    ...referenceFields.map((field) => ({
      prop: field,
      label: referenceLabels[field],
      minWidth: field === 'supplierId' || field === 'payeeSupplierId' ? 225 : 180,
      useSlot: true
    })),
    {
      prop: 'counterpartyBalance',
      label: '往来单位余额(元)',
      width: 170,
      formatter: (row) =>
        row.counterpartyBalance == null ? '—' : formatCurrencyValue(row.counterpartyBalance)
    },
    ...numericFields.value.map((field) => ({
      prop: field,
      fixed: field === 'amount' ? ('right' as const) : undefined,
      label:
        field === 'amount' && props.kind === 'payment'
          ? '实付金额(元)'
          : `${numericLabels[field]}${field === 'taxRate' ? '(%)' : '(元)'}`,
      width: 170,
      useSlot: true
    })),
    {
      prop: 'paidAmount',
      label: props.kind === 'refund' ? '已到账金额(元)' : '已付款金额(元)',
      width: 160,
      formatter: (row) => formatCurrencyValue(row.paidAmount || 0)
    },
    { prop: 'expense', label: '费用项目', width: 190, useSlot: true },
    { prop: 'employee', label: '采购员', width: 220, useSlot: true },
    { prop: 'sourceLineNo', label: '源行号', width: 130, useSlot: true },
    ...textFields.value.map((field) => ({
      prop: field,
      label: textLabels[field],
      width: 200,
      useSlot: true
    })),
    ...(editable.value
      ? [{ prop: 'operation', label: '操作', width: 100, fixed: 'right' as const, useSlot: true }]
      : [])
  ])
  function referenceDisabled(row: PayableSettlementLine, field: ReferenceField): boolean {
    return (
      (field === 'supplierId' &&
        !!(row.payableId || row.purchaseId || row.applicationLineId || row.carrierId)) ||
      (field === 'purposeId' && !!row.applicationLineId) ||
      (field === 'payeeSupplierId' && !!row.carrierId)
    )
  }
  function fieldOptions(field: ReferenceField, row: PayableSettlementLine) {
    const data = options.value?.[referenceKeys[field]] || []
    if (field === 'purposeId' && props.kind === 'refund') {
      const sourceType = row.sourcePurposeBusinessType || row.details.sourcePurposeBusinessType
      const symmetricType = (
        { purchase: 'purchase_refund', advance: 'advance_refund', other: 'other_refund' } as Record<
          string,
          string
        >
      )[sourceType || '']
      return data.filter((option) => option.businessType === symmetricType)
    }
    if (field === 'contractId')
      return data.filter(
        (option) =>
          option.kind === 'purchase_contract' &&
          (!row.supplierId || option.supplierId === row.supplierId)
      )
    if (field !== 'fundAccountId') return data
    const method = options.value?.method.find((option) => option.id === row.settlementMethodId)
    const sourceBook =
      props.kind === 'refund'
        ? document.value?.accountSetId || row.accountSetId
        : options.value?.payable.find((option) => option.id === row.payableId)?.accountSetId
    return data.filter(
      (option) =>
        option.currencyCode === document.value?.currencyCode &&
        (!sourceBook || option.accountSetId === sourceBook) &&
        (method?.category === 'cash' ? option.category === 'cash' : option.category !== 'cash')
    )
  }
  function referenceOptionLabel(field: ReferenceField, option: PayableSettlementOption): string {
    return `${option.name}${option.code ? ` · ${option.code}` : ''}${field === 'fundAccountId' && option.accountSetName ? ` · ${option.accountSetName}` : ''}`
  }
  function referenceLabel(row: PayableSettlementLine, field: ReferenceField): string {
    if (field === 'supplierId' && row.carrierId) return row.supplierName || '承运商'
    if (field === 'payeeSupplierId' && row.carrierId)
      return row.payeeSupplierName || row.supplierName || '承运商'
    const historical = {
      purposeId: row.purposeName,
      supplierId: row.supplierName,
      payeeSupplierId: row.payeeSupplierName,
      projectId: row.projectName,
      contractId: row.contractNo,
      departmentId: row.departmentName,
      settlementMethodId: row.settlementMethodName,
      fundAccountId: row.fundAccountName
    }
    const selected = options.value?.[referenceKeys[field]].find(
      (option) => option.id === row[field]
    )
    return (
      (selected
        ? field === 'fundAccountId'
          ? referenceOptionLabel(field, selected)
          : selected.name
        : '') ||
      historical[field] ||
      (row[field] ? '已停用选项，请重新选择' : '—')
    )
  }
  function referenceChanged(row: PayableSettlementLine, field: ReferenceField): void {
    if (field === 'supplierId') {
      row.payeeSupplierId = row.supplierId
      row.counterpartyBalance = options.value?.supplier.find(
        (option) => option.id === row.supplierId
      )?.amount
    }
    if (field === 'supplierId' || field === 'payeeSupplierId') {
      const banks = supplierBanks(row)
      row.bankAccount = banks.length === 1 ? banks[0].bankAccount : ''
      bankChanged(row)
    }
    if (field === 'purposeId') {
      row.counterpartyBalance =
        options.value?.purpose.find((option) => option.id === row.purposeId)?.payableWriteoff ===
        false
          ? undefined
          : (options.value?.payable.find((option) => option.id === row.payableId)?.balance ??
            options.value?.supplier.find((option) => option.id === row.supplierId)?.amount)
      row.fundPurpose =
        options.value?.purpose.find((option) => option.id === row.purposeId)?.defaultFundPurpose ||
        ''
    }
    if (
      field === 'settlementMethodId' &&
      !fieldOptions('fundAccountId', row).some((option) => option.id === row.fundAccountId)
    )
      row.fundAccountId = null
  }
  function amountChanged(
    row: PayableSettlementLine,
    field: NumericField,
    value: number | undefined,
    previous: number | undefined
  ): void {
    if (field === 'amount') {
      if (row.approvedAmount === previous || !row.approvedAmount) row.approvedAmount = value || 0
      if (row.plannedAmount === previous || !row.plannedAmount) row.plannedAmount = value || 0
    }
  }
  function selectSource(row: PayableSettlementLine, id: string | undefined): void {
    const payable = options.value?.payable.find((option) => option.id === id)
    const purchase = options.value?.purchase.find((option) => option.id === id)
    const source = payable || purchase
    row.payableId = payable?.id || null
    row.purchaseId = purchase?.id || null
    row.carrierId = source?.carrierId || null
    if (source) {
      row.supplierId = source.supplierId
      row.payeeSupplierId = source.supplierId
      row.projectId = source.projectId
      row.amount = source.amount || 0
      row.approvedAmount = row.amount
      row.plannedAmount = row.amount
      row.sourceDocumentNo = source.code
      row.counterpartyBalance =
        source.balance ??
        options.value?.supplier.find((option) => option.id === row.supplierId)?.amount
      if (purchase?.kind === 'purchase_contract') row.contractId = purchase.id
      referenceChanged(row, 'payeeSupplierId')
      row.purposeId =
        options.value?.purpose.find((option) => option.code === (purchase ? '202' : '201'))?.id ||
        ''
    }
    if (
      row.fundAccountId &&
      !fieldOptions('fundAccountId', row).some((option) => option.id === row.fundAccountId)
    )
      row.fundAccountId = null
  }
  function selectRefundSource(row: PayableSettlementLine, id: string): void {
    const source = options.value?.refundSource?.find((option) => option.refundPaymentLineId === id)
    if (!source || !document.value) return
    Object.assign(row, {
      refundPaymentLineId: id,
      refundPaymentDocumentNo: source.refundPaymentDocumentNo,
      sourceDocumentNo: source.refundPaymentDocumentNo,
      accountSetId: source.accountSetId,
      supplierId: source.supplierId,
      supplierName: source.supplierName,
      payeeSupplierId: source.payeeSupplierId,
      payeeSupplierName: source.payeeSupplierName,
      carrierId: source.carrierId,
      payableId: source.payableId,
      purchaseId: source.purchaseId,
      contractId: source.contractId,
      projectId: source.projectId,
      departmentId: source.departmentId,
      sourcePurposeBusinessType: source.sourcePurposeBusinessType,
      amount: source.availableRefundAmount || 0,
      approvedAmount: source.availableRefundAmount || 0,
      plannedAmount: source.availableRefundAmount || 0,
      expiredDiscountAmount: source.availableRefundDiscount || 0,
      cashDiscount: 0,
      settlementMethodId: source.settlementMethodId,
      fundAccountId: source.fundAccountId,
      details: { ...source.details, sourcePurposeBusinessType: source.sourcePurposeBusinessType }
    })
    row.purposeId = fieldOptions('purposeId', row)[0]?.id || ''
    document.value.accountSetId ||= source.accountSetId
    if (!fieldOptions('fundAccountId', row).some((option) => option.id === row.fundAccountId))
      row.fundAccountId = null
  }
  function supplierBanks(row: PayableSettlementLine) {
    return (options.value?.bank || []).filter(
      (bank) =>
        bank.supplierId === row.payeeSupplierId &&
        bank.currencyCode === document.value?.currencyCode
    )
  }
  function bankChanged(row: PayableSettlementLine): void {
    const bank = supplierBanks(row).find((bank) => bank.bankAccount === row.bankAccount)
    row.bankAccountName = bank?.accountName || ''
    row.bankName = bank?.bankName || ''
  }
  function selectedEmployee(row: PayableSettlementLine): EmployeeIntegrationItem[] {
    return row.details.employeeId && row.details.employeeName && document.value?.tenantId
      ? [
          {
            id: row.details.employeeId,
            tenantId: document.value.tenantId,
            employeeName: row.details.employeeName,
            employeeNo: row.details.employeeNo || '',
            employmentStatus: ''
          }
        ]
      : []
  }
  function addLine(): void {
    if (!document.value) return
    const row = newPayableSettlementLine((document.value.lines.length + 1) * 10)
    row.purposeId = options.value?.purpose.find((option) => option.code === '201')?.id || ''
    row.settlementMethodId = options.value?.method.find((option) => option.code === 'JSFS01')?.id
    document.value.lines.push(row)
  }
  function copyLine(row: PayableSettlementLine): void {
    if (!document.value) return
    document.value.lines.push({
      ...cloneDeep(row),
      id: undefined,
      clientKey: crypto.randomUUID(),
      lineNo: (document.value.lines.length + 1) * 10
    })
  }
  async function removeLine(row: PayableSettlementLine): Promise<void> {
    if (!document.value) return
    const guard = deleteGuardRef.value
    if (!guard) {
      ElMessage.warning('关联检查尚未就绪，请关闭并重新打开单据后再试')
      return
    }
    const inspect = () =>
      guard.inspect({
        resourceLabel: '暂存明细',
        resources: [{ id: row.id || row.clientKey || '', label: `第 ${row.lineNo} 行` }],
        fetchDependencies: async () =>
          document.value?.id ? fetchSettlementDeleteDependencies([document.value.id]) : []
      })
    if (await inspect()) return
    try {
      await confirmDelete('确认从暂存单移除此明细？保存单据后生效。')
    } catch {
      return
    }
    document.value.lines = document.value.lines.filter((line) => line !== row)
    document.value.lines.forEach((line, index) => (line.lineNo = (index + 1) * 10))
  }
  async function loadOptions(): Promise<void> {
    if (!document.value) return
    const current = ++requestVersion
    loading.value = true
    error.value = ''
    try {
      const data = await fetchPayableSettlementOptions(props.kind, document.value.tenantId)
      const organizations = await fetchOrganizationOptionsTree({ tenantId: data.tenantId })
      if (organizations.error) throw organizations.error
      if (current !== requestVersion || !document.value) return
      organizationTree.value = organizations.data ?? []
      options.value = data
      document.value.tenantId = data.tenantId
      document.value.documentTypeId ||=
        data.documentType.find((option) => option.isDefault)?.id || data.documentType[0]?.id
    } catch (cause) {
      if (current === requestVersion) {
        error.value = '基础资料加载失败，请重新加载后保存'
        notifyFriendlyError(cause, error.value)
      }
    } finally {
      await nextTick()
      if (current === requestVersion) loading.value = false
    }
  }
  async function open(value?: PayableSettlementDocument, edit = false): Promise<void> {
    const kind = props.kind
    const scopeCurrent = captureOperation()
    const version = session.invalidate()
    const permissions = permissionMap[kind]
    const permission = value?.id ? permissions.Edit : permissions.Add
    const contextCurrent = () =>
      scopeCurrent() &&
      props.kind === kind &&
      session.version.value === version &&
      (!edit || hasAuth(permission))
    if (!contextCurrent()) return
    const isCurrent = () => contextCurrent() && session.isCurrent(version)
    requestVersion += 1
    loading.value = false
    error.value = ''
    editable.value = edit
    options.value = undefined
    document.value = value ? cloneDeep(value) : newPayableSettlement(props.kind)
    document.value.details = { fee: 0, paymentType: 'active', ...document.value.details }
    document.value.postingDate = document.value.businessDate
    document.value.lines.forEach((row) => {
      row.clientKey = row.id || crypto.randomUUID()
      row.details ||= {}
    })
    await drawerRef.value?.handleOpen(undefined, {
      title: `${edit ? (value ? '编辑' : '新增') : '查看'}${title.value}`,
      showFooter: edit,
      confirmText: '保存',
      confirmDisabled: true,
      onClose: () => {
        session.invalidate()
        requestVersion += 1
      },
      onConfirm: async () => {
        if (!edit || !isCurrent()) {
          ElMessage.warning('操作范围或权限已变化，请重新打开付款单据')
          return false
        }
        if (
          !document.value ||
          loading.value ||
          error.value ||
          !(await validateArtFormForSubmit(formRef.value))
        )
          return false
        if (!isCurrent()) return false
        const invalid = validateSettlementAmounts(document.value.lines, props.kind)
        if (invalid) {
          ElMessage.warning(invalid)
          return false
        }
        try {
          await savePayableSettlement(document.value)
          if (!isCurrent()) return false
          ElMessage.success(`${title.value}已保存`)
          emit('success')
          return true
        } catch (cause) {
          if (isCurrent()) notifyFriendlyError(cause, '单据未保存，请核对金额和来源后重试')
          return false
        }
      }
    })
    if (isCurrent() && (edit || props.kind !== 'refund')) await loadOptions()
  }
  defineExpose({ open })
  watch(
    () => document.value?.businessDate,
    (value) => {
      if (document.value) document.value.postingDate = value
    }
  )
  onBeforeUnmount(() => {
    requestVersion += 1
  })
</script>
