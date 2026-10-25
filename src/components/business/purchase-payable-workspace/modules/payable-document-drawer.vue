<template>
  <ArtDrawer ref="drawerRef" size="88%">
    <div v-if="document" class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        icon="ri:bill-line"
        :title="document.documentNo || `新增${title}`"
        :description="`${document.sourceType === 'carrier_statement' ? '来源承运商对账单' : document.sourceType === 'manual' ? '来源单据' : '来源采购入库单'}：${document.sourceDocumentNo || '手工录入'}`"
      >
        <template #aside>
          <div class="flex flex-wrap items-center gap-2">
            <ElTag v-if="document.isCredit" type="danger" effect="plain">红字冲减</ElTag>
            <ElTag :type="document.status === 'approved' ? 'success' : 'info'"
              >{{ payableStatusLabels[document.status]
              }}{{ document.isReversal ? ' · 冲回单' : '' }}</ElTag
            >
          </div>
        </template>
      </ArtEntitySummary>
      <ElAlert
        v-if="document.isCredit"
        type="info"
        :closable="false"
        show-icon
        title="红字冲减应付，不生成付款计划或直接下推付款"
        description="数量、单价和录入金额填写正数，系统按负债冲减方向立账。当前支持非标准采购类型的手工红字，采购退库及运输来源另走对应业务链。"
      />
      <ElAlert
        v-if="optionError"
        type="warning"
        :closable="false"
        show-icon
        title="基础资料加载失败，请重试后再保存"
      >
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ElAlert
        v-if="editable && currencyNotice"
        :type="currencyConfigured ? 'info' : 'warning'"
        :closable="false"
        show-icon
        :title="currencyNotice"
      >
        <ElButton
          v-if="!currencyConfigured"
          link
          type="primary"
          :loading="currencyLoading"
          @click="loadCurrency(false)"
          >重新加载币种</ElButton
        >
      </ElAlert>
      <ArtSectionCard
        title="基本信息"
        :subtitle="
          currency !== baseCurrency
            ? `记账汇率表示 1 ${currency} 可折算的 ${baseCurrency} 金额；已有汇率不会自动随台账变化。`
            : '业务日期、往来单位及税价口径；单据编号由系统生成。'
        "
        :loading="editable && optionLoading"
      >
        <template #actions>
          <ElButton
            v-if="editable && currency !== baseCurrency"
            :loading="currencyLoading"
            :disabled="optionLoading"
            @click="loadCurrency(true)"
            >取业务日期汇率</ElButton
          >
        </template>
        <ArtDescriptions
          v-if="!editable"
          :data="document"
          :items="readOnlyHeaderItems"
          :label-width="144"
        />
        <ArtForm
          v-else
          ref="formRef"
          :model-value="document"
          :items="headerItems"
          :rules="headerRules"
          :span="8"
          :gutter="18"
          label-position="top"
          :disabled="optionLoading || currencyLoading"
          :show-submit="false"
          :show-reset="false"
          @update:model-value="replaceReactiveModel(document, $event)"
        />
      </ArtSectionCard>
      <ArtSectionCard
        title="应付明细"
        :subtitle="`共 ${document.lines.length} 行 · 立账价税合计 ${formatCurrencyValue(signedTotal, currency)}`"
      >
        <template #actions>
          <ElButton
            v-if="editable && document.sourceType === 'manual'"
            :disabled="optionError || optionLoading"
            @click="materialPickerRef?.open()"
            ><ArtSvgIcon icon="ri:add-line" />选择物料</ElButton
          >
        </template>
        <ArtForm
          v-if="editable"
          :model-value="document"
          :items="entryItems"
          :span="6"
          :show-submit="false"
          :show-reset="false"
          @update:model-value="replaceReactiveModel(document, $event)"
        />
        <p v-if="editable" class="mb-3 text-xs text-g-700">
          <span v-if="document.isCredit">红字明细按绝对值录入。</span>
          更换单位按当前数量更新基本数量，单价不会自动折算；基本数量可核对后手工校正。
        </p>
        <ArtTable
          ref="lineTableRef"
          :data="document.lines"
          :columns="lineColumns"
          :pagination="false"
          row-key="id"
          :max-height="360"
        >
          <template v-for="field in numericFields" :key="field" #[field]="{ row }">
            <ElInputNumber
              v-if="editable && canEditNumber(field)"
              v-model="row[field]"
              :aria-label="numericLabels[field]"
              :precision="
                field === 'quantity' || field === 'baseQuantity'
                  ? 6
                  : field.includes('Price')
                    ? 4
                    : 2
              "
              :min="field === 'quantity' || field === 'baseQuantity' ? 0.000001 : 0"
              :controls="false"
              class="w-full!"
              @change="
                (_value: number | undefined, previous: number | undefined) =>
                  recalculate(row, field, previous)
              "
            />
            <span v-else>{{ row[field] ?? '—' }}</span>
          </template>
          <template #taxRate="{ row }"
            ><ElSelect
              v-if="editable"
              v-model="row.taxRate"
              aria-label="税率"
              class="w-full!"
              @change="recalculate(row)"
              ><ElOption
                v-for="option in options.tax"
                :key="option.id"
                :value="Number(option.code)"
                :label="`${Number(option.code)}%`" /></ElSelect
            ><span v-else>{{ row.taxRate ?? 0 }}%</span></template
          >
          <template #projectName="{ row }"
            ><ArtTableSingleSelect
              v-if="editable"
              :model-value="row.projectId || undefined"
              :data="options.project"
              :columns="pickerColumns"
              row-key="id"
              label-key="name"
              description-key="code"
              title="参选项目"
              @update:selected-data="(rows) => selectProject(row, rows)"
            /><span v-else>{{ row.projectName || '—' }}</span></template
          >
          <template #inventoryUnitId="{ row }"
            ><ElSelect
              v-if="editable"
              v-model="row.inventoryUnitId"
              aria-label="库存单位"
              :disabled="optionLoading"
              :loading="optionLoading"
              class="w-full!"
              @change="updateLineUnit(row, 'inventoryUnitId')"
              ><ElOption
                v-if="
                  row.inventoryUnitId &&
                  !options.unit?.some((unit) => unit.id === row.inventoryUnitId)
                "
                :value="row.inventoryUnitId"
                :label="row.unitName || '历史库存单位不可参选，请核对'"
                disabled /><ElOption
                v-for="unit in options.unit"
                :key="unit.id"
                :value="unit.id"
                :label="unit.name" /></ElSelect
            ><span v-else>{{ row.unitName }}</span></template
          >
          <template v-for="field in referenceFields" :key="field" #[field]="{ row }">
            <ElTreeSelect
              v-if="editable && field === 'departmentId'"
              v-model="row.departmentId"
              aria-label="费用承担部门"
              :data="organizationTree"
              :props="{ label: 'organizationName', children: 'children' }"
              node-key="id"
              :disabled="optionLoading"
              :cache-data="
                row.departmentId
                  ? [{ id: row.departmentId, organizationName: referenceName(row, field) }]
                  : []
              "
              check-strictly
              filterable
              clearable
              class="w-full!"
            />
            <ElSelect
              v-else-if="editable"
              v-model="row[field]"
              :aria-label="referenceLabels[field]"
              :disabled="optionLoading"
              :loading="optionLoading"
              :no-data-text="
                field === 'contractId'
                  ? '暂无可参选合同，请确认采购合同查看权限或合同数据'
                  : '暂无数据'
              "
              clearable
              filterable
              class="w-full!"
              @change="field === 'baseUnitId' && updateLineUnit(row, 'baseUnitId')"
            >
              <ElOption
                v-if="
                  row[field] &&
                  !(options[referenceOptions[field]] || []).some(
                    (option) => option.id === row[field]
                  )
                "
                :value="row[field]"
                :label="referenceName(row, field)"
                disabled
              />
              <ElOption
                v-for="option in options[referenceOptions[field]] || []"
                :key="option.id"
                :value="option.id"
                :label="option.name"
              />
            </ElSelect>
            <span v-else>{{ referenceName(row, field) }}</span>
          </template>
          <template v-for="field in sourceFields" :key="field" #[field]="{ row }">
            <ElInput
              v-if="editable && document.sourceType === 'manual' && !row.estimatedLineId"
              v-model="row[field]"
              :aria-label="field === 'sourceDocumentNo' ? '明细来源单据' : '明细源行号'"
              maxlength="200"
            />
            <BusinessRecordLink
              v-else-if="
                !editable &&
                field === 'sourceDocumentNo' &&
                document.sourceType === 'manual' &&
                row.estimatedDocumentId &&
                hasAuth('FinanceEstimatedPayable:View')
              "
              :label="row[field] || '来源暂估'"
              :title="`查看来源暂估 ${row[field]}`"
              interactive
              compact
              @click="openEstimatedSource(row.estimatedDocumentId)"
            />
            <span v-else>{{ row[field] || '—' }}</span>
          </template>
          <template #discountMethod="{ row }"
            ><ElSelect
              v-if="editable"
              v-model="row.discountMethod"
              aria-label="折扣方式"
              class="w-full!"
              @change="recalculate(row)"
              ><ElOption label="无" value="none" /><ElOption
                label="折扣率(%)"
                value="rate" /><ElOption label="单位折扣" value="unit" /></ElSelect
            ><span v-else>{{
              row.discountMethod === 'rate'
                ? '折扣率'
                : row.discountMethod === 'unit'
                  ? '单位折扣'
                  : '无'
            }}</span></template
          >
          <template #discountValue="{ row }"
            ><ElInputNumber
              v-if="editable"
              v-model="row.discountValue"
              aria-label="单位折扣或折扣率"
              :disabled="!row.discountMethod || row.discountMethod === 'none'"
              :min="0"
              :max="row.discountMethod === 'rate' ? 100 : undefined"
              :controls="false"
              class="w-full!"
              @change="recalculate(row)"
            /><span v-else>{{ row.discountValue || 0 }}</span></template
          >
          <template #gift="{ row }"
            ><ElCheckbox
              v-model="row.gift"
              aria-label="赠品"
              :disabled="!editable"
              @change="recalculate(row)"
          /></template>
          <template #invoiceFirst="{ row }"
            ><ElSwitch v-model="row.invoiceFirst" aria-label="先到票" :disabled="!editable"
          /></template>
          <template #remark="{ row }"
            ><ElInput
              v-if="editable"
              v-model="row.remark"
              aria-label="明细备注"
              maxlength="1000"
            /><span v-else>{{ row.remark || '—' }}</span></template
          >
          <template #operation="{ row }"
            ><ArtButtonTable v-if="editable" type="delete" label="移除" @click="removeLine(row.id)"
          /></template>
        </ArtTable>
      </ArtSectionCard>
      <ArtSectionCard
        v-if="document.kind === 'financial' && !document.isCredit"
        title="付款计划"
        subtitle="金额合计需与价税合计一致；按比例开启后，应付金额自动计算。"
      >
        <template #actions
          ><ElButton v-if="editable" @click="addPlan"
            ><ArtSvgIcon icon="ri:add-line" />增加付款期次</ElButton
          ></template
        >
        <ElSwitch
          v-model="document.plansByRatio"
          :disabled="!editable"
          active-text="按比例(%)"
          aria-label="按比例计算付款计划"
          @change="recalculatePlans"
        />
        <ArtTable
          class="mt-3"
          :data="document.paymentPlans || []"
          :columns="planColumns"
          :pagination="false"
        >
          <template #dueDate="{ row }"
            ><ElDatePicker
              v-if="editable"
              v-model="row.dueDate"
              type="date"
              value-format="YYYY-MM-DD"
              aria-label="到期日期"
              class="w-full!"
            /><span v-else>{{ row.dueDate }}</span></template
          >
          <template #ratio="{ row }"
            ><ElInputNumber
              v-if="editable && document.plansByRatio"
              v-model="row.ratio"
              :min="0"
              :max="100"
              :precision="6"
              :controls="false"
              aria-label="应付比例"
              class="w-full!"
              @change="recalculatePlans"
            /><span v-else>{{ row.ratio }}%</span></template
          >
          <template #amount="{ row }"
            ><ElInputNumber
              v-if="editable && !document.plansByRatio"
              v-model="row.amount"
              :min="0"
              :precision="2"
              :controls="false"
              aria-label="应付金额"
              class="w-full!"
              @change="recalculatePlans"
            /><span v-else>{{ formatCurrencyValue(row.amount, currency) }}</span></template
          >
          <template #remark="{ row }"
            ><ElInput v-if="editable" v-model="row.remark" aria-label="付款计划备注" /><span
              v-else
              >{{ row.remark || '—' }}</span
            ></template
          >
          <template #operation="{ $index }"
            ><ArtButtonTable
              v-if="editable"
              type="delete"
              label="移除"
              @click="document.paymentPlans?.splice($index, 1)"
          /></template>
        </ArtTable>
      </ArtSectionCard>
      <ArtSectionCard
        title="关联信息"
        :subtitle="
          document.isCredit
            ? '核对红字核销余额、冻结与会计凭证，不创建资金付款。'
            : '来源、冲回与制证均保留在统一应付账簿。'
        "
      >
        <ArtDescriptions :data="document" :items="relatedItems" :columns="3" :label-width="144" />
      </ArtSectionCard>
    </div>
  </ArtDrawer>
  <ArtTableMultipleSelect
    ref="materialPickerRef"
    :show-trigger="false"
    :api-fn="loadMaterials"
    :columns="materialColumns"
    row-key="id"
    label-key="name"
    description-key="code"
    title="数据来源物料编码"
    subtitle="支持多选；自动带入描述、编码、规格和计量单位。"
    @confirm="(_keys, rows) => addMaterials(rows)"
  />
</template>
<script setup lang="ts">
  import { fetchOrganizationOptionsTree } from '@/api/system-manage'
  import dayjs from 'dayjs'
  import { cloneDeep } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import {
    fetchPayableOptions,
    fetchPayableCurrencyContext,
    savePurchasePayable,
    type PurchasePayableDocument,
    type PurchasePayableKind,
    type PurchasePayableLine,
    type PayableOption,
    type PayablePaymentPlan
  } from '@/api/purchase-payable'
  import {
    calculatePayableLine,
    calculatePaymentPlans,
    validatePaymentPlans,
    payableStatusLabels,
    roundPayable,
    payableLiabilityAmount,
    payableDocumentForEditing
  } from '@/utils/finance/payable'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useAuth } from '@/hooks/core/useAuth'
  import { unref } from 'vue'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import { financePaths } from '@/router/business-paths'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import type { ColumnOption } from '@/types'

  const props = defineProps<{ kind: PurchasePayableKind }>()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const emit = defineEmits<{ success: [] }>()
  const drawerRef = ref<ArtDrawerExpose>()
  const permissionMap = {
    estimated: {
      View: 'FinanceEstimatedPayable:View',
      Add: 'FinanceEstimatedPayable:Add',
      Edit: 'FinanceEstimatedPayable:Edit'
    },
    financial: {
      View: 'FinancePurchasePayable:View',
      Add: 'FinancePurchasePayable:Add',
      Edit: 'FinancePurchasePayable:Edit'
    }
  }
  const captureOperation = useTenantOperationGuard(permissionMap[props.kind].View)
  const session = useArtOverlaySession(() => Boolean(unref(drawerRef.value?.visible)))
  const materialPickerRef = ref<ArtDataSelectExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const lineTableRef = ref<ArtTableExpose>()
  const document = ref<PurchasePayableDocument>()
  const editable = ref(false)
  async function openEstimatedSource(id: string): Promise<void> {
    if (editable.value || !hasAuth('FinanceEstimatedPayable:View')) {
      ElMessage.warning('当前状态不允许查看来源暂估，请先核对权限并关闭编辑')
      return
    }
    try {
      await drawerRef.value?.handleClose(true)
      await router.push({ path: financePaths.estimatedPayable, query: { recordId: id } })
    } catch (error) {
      notifyFriendlyError(error, '来源暂估定位失败，请重新打开详情后重试')
    }
  }
  const optionError = ref(false)
  const optionLoading = ref(false)
  const currencyLoading = ref(false)
  const currencyConfigured = ref(true)
  const currencyMessage = ref('')
  let currencyVersion = 0
  let lastValidQuantities = new WeakMap<PurchasePayableLine, number>()
  const currency = computed(() => document.value?.currencyCode || 'CNY')
  const baseCurrency = computed(() => document.value?.baseCurrencyCode || 'CNY')
  const amountLabel = (name: string) =>
    `${name}(${currency.value === 'CNY' ? '元' : currency.value})`
  const currencyNotice = computed(
    () =>
      currencyMessage.value ||
      (currency.value !== 'CNY' || baseCurrency.value !== 'CNY'
        ? '当前外币支持立账、同币冲回和制证；付款与当前工作台的跨币入口尚未开放，禁止按人民币金额代付。'
        : '')
  )
  const options = reactive<Record<string, PayableOption[]>>({})
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const headerRules = {
    documentTypeId: [{ required: true, message: '请选择单据类型' }],
    supplierId: [{ required: true, message: '请选择结算供应商' }],
    businessDate: [{ required: true, message: '请选择业务日期' }],
    postingDate: [{ required: true, message: '请选择记账日期' }],
    currencyCode: [{ required: true, message: '请选择结算币种' }],
    exchangeRate: [
      { required: true, message: '请填写本单记账汇率' },
      { type: 'number', min: 0.00000001, message: '记账汇率必须大于零' }
    ]
  }
  const title = computed(() => (props.kind === 'estimated' ? '暂估应付单' : '财务应付单'))
  const total = computed(
    () => document.value?.lines.reduce((sum, line) => sum + line.totalAmount, 0) || 0
  )
  const signedTotal = computed(() => payableLiabilityAmount(total.value, document.value?.isCredit))
  const documentTypeOptions = computed(() =>
    (options[`${props.kind}_type`] || []).filter(
      (option) => !document.value?.isCredit || option.standardPurchase === false
    )
  )
  const directionLocked = computed(
    () =>
      document.value?.status !== 'draft' ||
      document.value?.sourceType !== 'manual' ||
      document.value?.isReversal ||
      !!document.value?.sourceDocumentId ||
      !!document.value?.lines.some((line) => line.estimatedLineId || line.sourceLineId) ||
      !!document.value?.paymentPlans?.length
  )
  const pickerColumns = [
    { prop: 'code', label: '编码', width: 160 },
    { prop: 'name', label: '名称', minWidth: 200 }
  ]
  const materialColumns = [
    ...pickerColumns,
    { prop: 'description', label: '物料描述', minWidth: 200 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 160 }
  ]
  const fieldOptions = (key: string) =>
    (options[key] || []).map((item) => ({ label: item.name, value: item.id }))
  const readOnlyHeaderItems = computed<ArtDescriptionItem<PurchasePayableDocument>[]>(() => [
    { key: 'documentNo', label: '单据编号', field: 'documentNo' },
    { key: 'documentTypeName', label: '单据类型', field: 'documentTypeName' },
    {
      key: 'isCredit',
      label: '应付方向',
      value: (row: PurchasePayableDocument) =>
        row.isReversal ? '暂估冲回' : row.isCredit ? '红字冲减' : '蓝字应付'
    },
    { key: 'businessDate', label: '业务日期', field: 'businessDate' },
    { key: 'postingDate', label: '记账日期', field: 'postingDate' },
    { key: 'currencyCode', label: '结算币种', field: 'currencyCode' },
    { key: 'exchangeRate', label: '原单记账汇率', field: 'exchangeRate' },
    { key: 'accountSetName', label: '核算账套', field: 'accountSetName' },
    {
      key: 'baseTotalAmount',
      label: '价税合计(本位币)',
      field: 'baseTotalAmount',
      value: (row: PurchasePayableDocument) =>
        formatCurrencyValue(
          row.baseTotalAmount ?? roundPayable(row.totalAmount * (row.exchangeRate ?? 1)),
          row.baseCurrencyCode || 'CNY'
        )
    },
    { key: 'supplierName', label: '结算供应商', field: 'supplierName' },
    { key: 'payeeSupplierName', label: '收款供应商', field: 'payeeSupplierName' },
    { key: 'organizationName', label: '付款组织', field: 'organizationName' },
    { key: 'projectName', label: '项目名称', field: 'projectName' },
    { key: 'paymentTermName', label: '付款条件', field: 'paymentTermName' },
    {
      key: 'basis',
      label: '立账依据',
      value: (row: PurchasePayableDocument) => (row.basis === 'amount' ? '金额' : '数量')
    },
    {
      key: 'taxExcludedFromCost',
      label: '税额不计入成本',
      value: (row: PurchasePayableDocument) => (row.taxExcludedFromCost === false ? '否' : '是')
    },
    { key: 'invoiceNo', label: '发票号码', field: 'invoiceNo' },
    {
      key: 'totalAmount',
      label: amountLabel('价税合计'),
      field: 'totalAmount',
      formatter: (value, row) => formatCurrencyValue(Number(value || 0), row.currencyCode || 'CNY')
    },
    { key: 'remark', label: '备注', field: 'remark', span: 3 }
  ])
  const headerItems = computed<FormItem[]>(() => [
    {
      key: 'documentNo',
      label: '单据编号',
      type: 'input',
      props: { disabled: true, placeholder: '保存后自动生成' }
    },
    {
      key: 'isCredit',
      label: '应付方向',
      type: 'segment',
      hidden: props.kind !== 'financial',
      help: '红字仅用于手工非标准采购应付。有关联来源或付款计划时不可切换方向。',
      props: {
        disabled: directionLocked.value,
        options: [
          { label: '蓝字应付', value: false },
          { label: '红字冲减', value: true }
        ]
      }
    },
    {
      key: 'documentTypeId',
      label: '单据类型',
      type: 'select',
      props: {
        options: documentTypeOptions.value.map((option) => ({
          label: option.name,
          value: option.id
        }))
      }
    },
    {
      key: 'businessDate',
      label: '业务日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    {
      key: 'postingDate',
      label: '记账日期',
      type: 'date',
      props: { valueFormat: 'YYYY-MM-DD' }
    },
    {
      key: 'currencyCode',
      label: '结算币种',
      type: 'select',
      props: {
        options: fieldOptions('currency'),
        disabled:
          document.value?.sourceType !== 'manual' ||
          document.value?.lines.some((line) => !!line.estimatedLineId)
      }
    },
    {
      key: 'exchangeRate',
      label: '记账汇率',
      type: 'number',
      hidden: currency.value === baseCurrency.value,
      props: {
        min: 0.00000001,
        precision: 8,
        controls: false,
        disabled: currency.value === baseCurrency.value
      }
    },
    {
      key: 'accountSetName',
      label: '核算账套',
      type: 'input',
      props: { disabled: true, placeholder: '未配置账套，仅支持人民币立账' }
    },
    {
      key: 'supplierId',
      label: '结算供应商',
      type: 'dataSelect',
      props: {
        data: options.supplier || [],
        rowKey: 'id',
        labelKey: 'name',
        descriptionKey: 'code',
        columns: pickerColumns,
        title: '选择结算供应商'
      }
    },
    {
      key: 'payeeSupplierId',
      label: '收款供应商',
      type: 'dataSelect',
      props: {
        data: options.supplier || [],
        rowKey: 'id',
        labelKey: 'name',
        columns: pickerColumns,
        title: '选择收款供应商'
      }
    },
    {
      key: 'organizationId',
      label: '付款组织',
      type: 'treeSelect',
      api: () => fetchOrganizationOptionsTree({ tenantId: document.value?.tenantId }),
      resultField: 'data',
      labelField: 'organizationName',
      valueField: 'id',
      childrenField: 'children',
      props: { clearable: true, filterable: true, checkStrictly: true }
    },
    {
      key: 'projectId',
      label: '项目名称',
      type: 'dataSelect',
      props: {
        data: options.project || [],
        rowKey: 'id',
        labelKey: 'name',
        columns: pickerColumns,
        title: '参选项目'
      }
    },
    {
      key: 'paymentTermId',
      label: '付款条件',
      type: 'select',
      hidden: !!document.value?.isCredit,
      props: { options: fieldOptions('payment_term'), clearable: true }
    },
    {
      key: 'basis',
      label: '立账依据',
      type: 'select',
      props: {
        options: [
          { label: '数量', value: 'quantity' },
          { label: '金额', value: 'amount' }
        ]
      }
    },
    { key: 'taxExcludedFromCost', label: '税额不计入成本', type: 'switch' },
    { key: 'invoiceNo', label: '发票号码', type: 'input', hidden: props.kind !== 'financial' },
    { key: 'sourceDocumentNo', label: '来源单据', type: 'input', props: { disabled: true } },
    {
      key: 'totalAmount',
      label: amountLabel('价税合计'),
      type: 'input',
      props: { disabled: true }
    },
    {
      key: 'baseTotalAmount',
      label: '价税合计（本位币）',
      type: 'input',
      hidden: currency.value === baseCurrency.value,
      props: { disabled: true, placeholder: '填写汇率后计算' }
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      span: 24,
      props: { maxlength: 2000, rows: 2 }
    }
  ])
  const entryItems: FormItem[] = [
    { key: 'inputTaxInclusivePrice', label: '录入含税单价', type: 'switch' },
    { key: 'inputAmount', label: '录入金额', type: 'switch' },
    { key: 'discountIncludesTax', label: '折扣额含税', type: 'switch' }
  ]
  const numericLabels = {
    quantity: '数量',
    baseQuantity: '基本数量',
    unitPrice: '单价',
    taxInclusiveUnitPrice: '含税单价',
    amount: '金额',
    totalAmount: '价税合计'
  }
  type NumericField = keyof typeof numericLabels
  const numericFields = Object.keys(numericLabels) as NumericField[]
  const referenceLabels = {
    baseUnitId: '基本单位',
    supplierId: '供应商',
    departmentId: '费用承担部门',
    contractId: '合同'
  }
  type ReferenceField = keyof typeof referenceLabels
  const referenceFields = Object.keys(referenceLabels) as ReferenceField[]
  const referenceOptions = {
    baseUnitId: 'unit',
    supplierId: 'supplier',
    departmentId: 'organization',
    contractId: 'contract'
  }
  const sourceFields = ['sourceDocumentNo', 'sourceLineNo'] as const
  function referenceName(row: PurchasePayableLine, field: ReferenceField): string {
    if (field === 'contractId' && row.contractNo) return row.contractNo
    const name = options[referenceOptions[field]]?.find((option) => option.id === row[field])?.name
    const historical = {
      baseUnitId: row.baseUnitName,
      supplierId: row.supplierName,
      departmentId: row.departmentName,
      contractId: row.contractNo
    }
    return name || historical[field] || (row[field] ? '已停用或不可参选，请核对' : '—')
  }
  const lineColumns = computed<ColumnOption<PurchasePayableLine>[]>(() => [
    { prop: 'lineNo', label: '行号', width: 70, fixed: 'left' },
    {
      prop: 'materialDescription',
      label: '物料描述',
      minWidth: 220,
      fixed: 'left',
      required: editable.value,
      requiredMessage: '请选择应付物料'
    },
    { prop: 'materialCode', label: '物料编码', minWidth: 150 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 },
    { prop: 'projectName', label: '项目名称', minWidth: 180, useSlot: true },
    { prop: 'projectCode', label: '项目编码', minWidth: 130 },
    {
      prop: 'inventoryUnitId',
      label: '库存单位',
      width: 120,
      useSlot: true,
      required: editable.value,
      requiredMessage: '请选择库存单位'
    },
    { prop: 'baseUnitId', label: '基本单位', width: 120, useSlot: true },
    ...numericFields.slice(0, 4).map((field) => ({
      prop: field,
      label: numericLabels[field],
      width: 135,
      useSlot: true,
      required: editable.value && (field === 'quantity' || field === 'baseQuantity'),
      rules: {
        validator: ({ value }: { value: unknown }) =>
          Number.isFinite(Number(value)) &&
          (field === 'quantity' || field === 'baseQuantity'
            ? Number(value) > 0
            : Number(value) >= 0),
        message: `请填写有效的${numericLabels[field]}`
      }
    })),
    {
      prop: 'taxRate',
      label: '税率(%)',
      width: 110,
      useSlot: true,
      required: editable.value,
      requiredMessage: '请选择税率'
    },
    { prop: 'discountMethod', label: '折扣方式', width: 135, useSlot: true },
    { prop: 'discountValue', label: '单位折扣(率)', width: 130, useSlot: true },
    { prop: 'discountAmount', label: amountLabel('折扣额'), width: 125 },
    { prop: 'amount', label: amountLabel('金额'), width: 135, useSlot: true },
    {
      prop: 'taxAmount',
      label: amountLabel('税额'),
      width: 120,
      formatter: (row) => formatCurrencyValue(row.taxAmount, currency.value)
    },
    { prop: 'totalAmount', label: amountLabel('价税合计'), width: 145, useSlot: true },
    { prop: 'invoiceFirst', label: '先到票', width: 90, useSlot: true },
    { prop: 'gift', label: '赠品', width: 80, useSlot: true },
    ...(props.kind === 'financial'
      ? [
          {
            prop: 'writtenOffAmount',
            label: amountLabel('已核销金额'),
            width: 150,
            align: 'right' as const,
            formatter: (row: PurchasePayableLine) =>
              formatCurrencyValue(row.writtenOffAmount || 0, currency.value)
          },
          {
            prop: 'unpaidAmount',
            label: amountLabel('未核销金额'),
            width: 150,
            align: 'right' as const,
            formatter: (row: PurchasePayableLine) =>
              formatCurrencyValue(row.unpaidAmount ?? row.totalAmount, currency.value)
          },
          {
            prop: 'matchedAmount',
            label: amountLabel('已勾稽金额'),
            width: 150,
            align: 'right' as const,
            formatter: (row: PurchasePayableLine) =>
              formatCurrencyValue(row.matchedAmount || 0, currency.value)
          },
          {
            prop: 'unmatchedAmount',
            label: amountLabel('未勾稽金额'),
            width: 150,
            align: 'right' as const,
            formatter: (row: PurchasePayableLine) =>
              formatCurrencyValue(row.unmatchedAmount ?? row.totalAmount, currency.value)
          }
        ]
      : []),
    { prop: 'supplierId', label: '供应商', minWidth: 170, useSlot: true },
    { prop: 'departmentId', label: '费用承担部门', minWidth: 170, useSlot: true },
    { prop: 'contractId', label: '合同', minWidth: 230, useSlot: true },
    ...(props.kind === 'estimated'
      ? [
          {
            prop: 'linkedQuantity',
            label: '已关联财务数量',
            width: 150,
            align: 'right' as const
          }
        ]
      : []),
    { prop: 'linkedAmount', label: amountLabel('已关联财务应付'), width: 165 },
    {
      prop: 'unlinkedAmount',
      label: amountLabel('未关联财务应付'),
      width: 165,
      formatter: (row) =>
        formatCurrencyValue(row.totalAmount - (row.linkedAmount || 0), currency.value)
    },
    ...(props.kind === 'estimated'
      ? [
          {
            prop: 'isReversed',
            label: '已冲回',
            width: 90,
            formatter: (row: PurchasePayableLine) => (row.isReversed ? '是' : '否')
          },
          { prop: 'unreversedAmount', label: amountLabel('未冲回金额'), width: 150 },
          { prop: 'reversedAmount', label: amountLabel('已冲回金额'), width: 150 },
          { prop: 'costDifference', label: `成本差异(${baseCurrency.value})`, width: 145 }
        ]
      : []),
    { prop: 'sourceDocumentNo', label: '来源单据', minWidth: 180, useSlot: true },
    { prop: 'sourceLineNo', label: '源行号', width: 110, useSlot: true },
    { prop: 'remark', label: '备注', minWidth: 180, useSlot: true },
    ...(editable.value
      ? [{ prop: 'operation', label: '操作', width: 80, fixed: 'right' as const, useSlot: true }]
      : [])
  ])
  const planColumns = computed<ColumnOption<PayablePaymentPlan>[]>(() => [
    { prop: 'dueDate', label: '到期日期', width: 180, useSlot: true },
    { prop: 'ratio', label: '应付比例(%)', width: 150, useSlot: true },
    { prop: 'amount', label: amountLabel('应付金额'), width: 160, useSlot: true },
    { prop: 'sourceDocumentNo', label: '来源单据', minWidth: 170 },
    { prop: 'contractNo', label: '合同', minWidth: 140 },
    { prop: 'remark', label: '备注', minWidth: 160, useSlot: true },
    { prop: 'operation', label: '操作', width: 80, useSlot: true }
  ])
  const relatedItems = computed<ArtDescriptionItem<PurchasePayableDocument>[]>(() => [
    ...(props.kind === 'estimated'
      ? [
          {
            key: 'financialPayableTypeName',
            label: '到票财务类型',
            value: (row: PurchasePayableDocument) =>
              row.standardPurchase
                ? '从同源采购入库单生成'
                : row.financialPayableTypeName || '未配置'
          }
        ]
      : []),
    { key: 'sourceDocumentNo', label: '来源单据', field: 'sourceDocumentNo' },
    { key: 'supplierName', label: '往来单位', field: 'supplierName' },
    { key: 'voucherNo', label: '凭证号', field: 'voucherNo' },
    ...(document.value?.isCredit
      ? [
          {
            key: 'writtenOffAmount',
            label: '已核销金额',
            value: (row: PurchasePayableDocument) =>
              formatCurrencyValue(row.writtenOffAmount ?? 0, currency.value)
          },
          {
            key: 'unpaidAmount',
            label: '未核销余额',
            value: (row: PurchasePayableDocument) =>
              formatCurrencyValue(
                row.status === 'draft' ? signedTotal.value : (row.unpaidAmount ?? row.totalAmount),
                currency.value
              )
          }
        ]
      : [
          {
            key: 'linkedAmount',
            label: '已关联金额',
            field: 'linkedAmount',
            formatter: (value: unknown) => formatCurrencyValue(Number(value || 0), currency.value)
          },
          {
            key: 'reversedAmount',
            label: '已冲回金额',
            field: 'reversedAmount',
            formatter: (value: unknown) => formatCurrencyValue(Number(value || 0), currency.value)
          }
        ]),
    {
      key: 'frozenAmount',
      label: '冻结金额',
      field: 'frozenAmount',
      formatter: (value) => formatCurrencyValue(Number(value || 0), currency.value)
    }
  ])
  async function loadOptions(): Promise<void> {
    const target = document.value
    if (!target) return
    optionError.value = false
    optionLoading.value = true
    try {
      const keys = [
        'supplier',
        'project',
        'organization',
        'unit',
        'payment_term',
        'contract',
        `${props.kind}_type`,
        'tax'
      ]
      const values = await Promise.all(keys.map((key) => fetchPayableOptions(key, target.tenantId)))
      const organizations = await fetchOrganizationOptionsTree({ tenantId: target.tenantId })
      if (organizations.error) throw organizations.error
      if (document.value !== target) return
      organizationTree.value = organizations.data ?? []
      keys.forEach((key, index) => {
        options[key] = values[index]
      })
      if (!target.documentTypeId && !target.isCredit)
        target.documentTypeId = documentTypeOptions.value[0]?.id
      await loadCurrency(false)
    } catch {
      if (document.value === target) optionError.value = true
    } finally {
      if (document.value === target) optionLoading.value = false
    }
  }
  async function loadCurrency(replaceRate: boolean): Promise<void> {
    if (!document.value || !editable.value) return
    const snapshot = cloneDeep(document.value)
    const current = ++currencyVersion
    currencyLoading.value = true
    currencyMessage.value = ''
    try {
      const context = await fetchPayableCurrencyContext(snapshot)
      if (current !== currencyVersion || !document.value) return
      options.currency = context.currencies
      currencyConfigured.value = context.configured
      currencyMessage.value =
        context.configured && context.exchangeRate !== null ? '' : context.message
      if (context.configured) {
        document.value.accountSetId = context.accountSetId
        document.value.accountSetName = context.accountSetName
        document.value.baseCurrencyCode = context.baseCurrencyCode
        if (replaceRate || !document.value.id || !document.value.exchangeRate)
          document.value.exchangeRate = context.exchangeRate ?? undefined
      } else if (replaceRate) document.value.exchangeRate = undefined
    } catch (error) {
      if (current === currencyVersion) {
        currencyConfigured.value = false
        currencyMessage.value = '币种与记账汇率加载失败，请重新加载后保存'
        notifyFriendlyError(error, currencyMessage.value)
      }
    } finally {
      if (current === currencyVersion) currencyLoading.value = false
    }
  }
  function canEditNumber(field: NumericField): boolean {
    const current = document.value
    if (!current) return false
    if (field === 'amount')
      return Boolean(
        (current.inputAmount || current.basis === 'amount') && !current.inputTaxInclusivePrice
      )
    if (field === 'totalAmount')
      return Boolean(
        (current.inputAmount || current.basis === 'amount') && current.inputTaxInclusivePrice
      )
    if (field === 'unitPrice') return !current.inputTaxInclusivePrice
    if (field === 'taxInclusiveUnitPrice') return Boolean(current.inputTaxInclusivePrice)
    return true
  }
  function recalculate(
    row: PurchasePayableLine,
    field?: NumericField,
    previousQuantity?: number
  ): void {
    if (!document.value) return
    if (field === 'baseQuantity') {
      row.baseQuantityEdited = true
      return
    }
    if (field === 'quantity' && previousQuantity && previousQuantity > 0)
      lastValidQuantities.set(row, previousQuantity)
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) return
    const priorQuantity =
      previousQuantity && previousQuantity > 0 ? previousQuantity : lastValidQuantities.get(row)
    const changed =
      field === 'unitPrice' || field === 'taxInclusiveUnitPrice' || field === 'amount'
        ? field
        : 'quantity'
    Object.assign(
      row,
      calculatePayableLine(
        row,
        document.value,
        changed,
        field === 'quantity' ? priorQuantity : undefined
      )
    )
    lastValidQuantities.set(row, row.quantity)
    if (field === 'quantity') {
      if (row.baseQuantity === undefined)
        Object.assign(row, calculatePayableLine(row, document.value, 'inventoryUnitId'))
    }
    recalculatePlans()
  }
  function updateLineUnit(row: PurchasePayableLine, field: 'inventoryUnitId' | 'baseUnitId'): void {
    if (!document.value) return
    row.unitName =
      options.unit.find((unit) => unit.id === row.inventoryUnitId)?.name || row.unitName
    row.baseUnitId ||= row.materialUnits?.baseUnitId || row.inventoryUnitId
    Object.assign(row, calculatePayableLine(row, document.value, field))
    if (row.baseQuantity === undefined)
      ElMessage.warning('未配置该单位换算，请核对物料资料或手工填写基本数量，单价仍需确认')
  }
  function recalculatePlans(): void {
    if (!document.value) return
    document.value.paymentPlans = calculatePaymentPlans(
      document.value.paymentPlans || [],
      total.value,
      Boolean(document.value.plansByRatio)
    )
  }
  function selectProject(row: PurchasePayableLine, selected: PayableOption[]): void {
    row.projectId = selected[0]?.id || null
    row.projectName = selected[0]?.name || null
    row.projectCode = selected[0]?.code || null
  }
  function removeLine(id: string): void {
    if (!document.value) return
    document.value.lines = document.value.lines.filter((line) => line.id !== id)
    document.value.lines.forEach((line, index) => {
      line.lineNo = (index + 1) * 10
    })
    recalculatePlans()
  }
  async function loadMaterials(params: DataSelectFetchParams): Promise<PayableOption[]> {
    return fetchPayableOptions('material', document.value?.tenantId, params.keyword)
  }
  function addMaterials(materials: PayableOption[]): void {
    if (!document.value) return
    for (const material of materials) {
      const materialLine: PurchasePayableLine = {
        id: crypto.randomUUID(),
        sourceLineId: null,
        lineNo: (document.value.lines.length + 1) * 10,
        materialId: material.id,
        materialCode: material.code || '',
        materialDescription: material.description || material.name,
        specificationModel: material.specificationModel,
        inventoryUnitId: material.inventoryUnitId,
        baseUnitId: material.baseUnitId || material.inventoryUnitId,
        materialUnits: {
          baseUnitId: material.baseUnitId,
          unitConversions: material.unitConversions || []
        },
        unitName: material.unitName || '',
        projectName: null,
        constructionNo: null,
        quantity: 1,
        unitPrice: 0,
        priceBasis: document.value.inputTaxInclusivePrice ? 'gross' : 'net',
        taxInclusiveUnitPrice: 0,
        taxRate: 0,
        supplierId: document.value.supplierId,
        discountMethod: 'none',
        discountValue: 0,
        gift: false,
        invoiceFirst: false,
        amount: 0,
        taxAmount: 0,
        totalAmount: 0
      }
      document.value.lines.push(
        calculatePayableLine(materialLine, document.value, 'inventoryUnitId')
      )
    }
    materialPickerRef.value?.clear()
  }
  function addPlan(): void {
    if (!document.value || document.value.isCredit) return
    const term = options.payment_term?.find((item) => item.id === document.value?.paymentTermId)
    document.value.paymentPlans ||= []
    document.value.paymentPlans.push({
      dueDate: dayjs(document.value.businessDate)
        .add(term?.days || 0, 'day')
        .format('YYYY-MM-DD'),
      ratio: 0,
      amount: 0,
      sourceDocumentNo: document.value.sourceDocumentNo,
      contractNo: '',
      remark: ''
    })
  }
  async function save(isCurrent: () => boolean): Promise<boolean> {
    if (!isCurrent()) {
      ElMessage.warning('操作范围或权限已变化，请重新打开应付单')
      return false
    }
    if (
      !document.value ||
      optionError.value ||
      optionLoading.value ||
      currencyLoading.value ||
      !currencyConfigured.value ||
      !formRef.value?.controlsReady
    )
      return false
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!isCurrent()) return false
      if (!document.value.lines.length) {
        ElMessage.warning('请至少选择一行物料明细')
        return false
      }
      const lineValidation = await lineTableRef.value?.validate()
      if (!isCurrent()) return false
      if (lineValidation?.valid === false) {
        ElMessage.warning(lineValidation.firstError?.message || '请完整填写应付明细')
        return false
      }
      const planError = validatePaymentPlans(document.value.paymentPlans || [], total.value)
      if (document.value.isCredit && document.value.paymentPlans?.length) {
        ElMessage.warning('红字冲减不能设置付款计划，请核对单据方向')
        return false
      }
      if (planError) {
        ElMessage.warning(planError)
        return false
      }
      await savePurchasePayable(document.value)
      if (!isCurrent()) return false
      ElMessage.success('应付单已保存')
      emit('success')
      return true
    } catch (error) {
      if (isCurrent()) notifyFriendlyError(error, '保存失败，请检查明细和当前数据状态')
      return false
    }
  }
  async function open(row?: PurchasePayableDocument, edit = false): Promise<void> {
    const kind = props.kind
    const scopeCurrent = captureOperation()
    const version = session.invalidate()
    const permissions = permissionMap[kind]
    const permission = row?.id ? permissions.Edit : permissions.Add
    const contextCurrent = () =>
      scopeCurrent() &&
      props.kind === kind &&
      session.version.value === version &&
      (!edit || hasAuth(permission))
    if (!contextCurrent()) return
    const isCurrent = () => edit && contextCurrent() && session.isCurrent(version)
    lastValidQuantities = new WeakMap()
    materialPickerRef.value?.clear()
    currencyVersion += 1
    currencyLoading.value = false
    currencyConfigured.value = true
    currencyMessage.value = ''
    options.currency = []
    editable.value = edit
    const tenantId =
      useTenantScopeStore().effectiveTenantId || useUserStore().getUserInfo.tenantId || ''
    document.value = row
      ? {
          inputTaxInclusivePrice: true,
          inputAmount: false,
          discountIncludesTax: true,
          taxExcludedFromCost: true,
          basis: 'quantity',
          postingDate: row.businessDate,
          sourceType: 'manual',
          currencyCode: 'CNY',
          baseCurrencyCode: 'CNY',
          exchangeRate: 1,
          isCredit: false,
          ...(edit ? payableDocumentForEditing(row) : cloneDeep(row))
        }
      : {
          id: '',
          tenantId,
          currencyCode: 'CNY',
          baseCurrencyCode: 'CNY',
          exchangeRate: 1,
          kind: props.kind,
          documentNo: '',
          sourceType: 'manual',
          sourceDocumentId: null,
          sourceDocumentNo: '',
          supplierName: null,
          businessDate: dayjs().format('YYYY-MM-DD'),
          postingDate: dayjs().format('YYYY-MM-DD'),
          status: 'draft',
          isCredit: false,
          taxExcludedFromCost: true,
          inputTaxInclusivePrice: true,
          inputAmount: false,
          discountIncludesTax: true,
          basis: 'quantity',
          plansByRatio: false,
          paymentPlans: [],
          lines: [],
          amount: 0,
          taxAmount: 0,
          totalAmount: 0
        }
    const currentDocument = document.value
    currentDocument.lines.forEach((line) => {
      line.taxRate ??= line.amount ? Math.round((line.taxAmount / line.amount) * 100) : 0
      line.taxInclusiveUnitPrice ??= Number((line.unitPrice * (1 + line.taxRate / 100)).toFixed(4))
      line.discountMethod ||= 'none'
      line.baseUnitId ||= line.materialUnits?.baseUnitId || line.inventoryUnitId
      line.baseQuantity ??= calculatePayableLine(
        line,
        currentDocument,
        'inventoryUnitId'
      ).baseQuantity
      line.baseQuantityEdited = false
    })
    lineTableRef.value?.clearValidate()
    optionError.value = false
    optionLoading.value = edit
    await drawerRef.value?.handleOpen(undefined, {
      title: `${edit ? (row ? '编辑' : '新增') : ''}${title.value}${edit ? '' : '详情'}`,
      confirmText: '保存',
      confirmDisabled: edit,
      showFooter: edit,
      onClose: () => {
        session.invalidate()
        currencyVersion += 1
      },
      onConfirm: () => save(isCurrent)
    })
    if (isCurrent()) await loadOptions()
  }
  watch(signedTotal, (value) => {
    if (document.value && editable.value) document.value.totalAmount = roundPayable(value)
  })
  watch(
    () => [signedTotal.value, document.value?.exchangeRate],
    () => {
      if (document.value && editable.value)
        document.value.baseTotalAmount =
          Number.isFinite(document.value.exchangeRate) && (document.value.exchangeRate || 0) > 0
            ? roundPayable(signedTotal.value * (document.value.exchangeRate || 0))
            : undefined
    }
  )
  watch(
    () => [document.value?.currencyCode, document.value?.businessDate],
    (current, previous) => {
      if (current[0] === previous?.[0] && current[1] === previous?.[1]) return
      if (editable.value && !optionLoading.value && previous?.[0] && document.value)
        void loadCurrency(current[0] !== previous[0])
    }
  )
  watch(
    () =>
      optionLoading.value ||
      optionError.value ||
      currencyLoading.value ||
      !currencyConfigured.value ||
      (editable.value && !formRef.value?.controlsReady),
    (disabled) => drawerRef.value?.setOptions({ confirmDisabled: disabled }),
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    currencyVersion += 1
  })
  watch(
    () => document.value?.supplierId,
    (supplier, previous) => {
      if (!editable.value || !document.value || !supplier) return
      if (!document.value.payeeSupplierId || document.value.payeeSupplierId === previous)
        document.value.payeeSupplierId = supplier
    }
  )
  watch(
    () => [
      document.value,
      document.value?.inputTaxInclusivePrice,
      document.value?.inputAmount,
      document.value?.discountIncludesTax,
      document.value?.basis
    ],
    (current, previous) => {
      if (
        editable.value &&
        current[0] === previous?.[0] &&
        current.slice(2).some((value, index) => value !== previous?.[index + 2]) &&
        previous?.slice(1).every((value) => value !== undefined)
      )
        document.value?.lines.forEach((line) => recalculate(line))
    }
  )
  watch(
    () => document.value?.isCredit,
    (isCredit, previous) => {
      if (
        !editable.value ||
        !document.value ||
        !isCredit ||
        previous === undefined ||
        optionLoading.value
      )
        return
      if (
        !documentTypeOptions.value.some((option) => option.id === document.value?.documentTypeId)
      ) {
        document.value.documentTypeId = undefined
        ElMessage.info('请选择支持手工红字的非标准采购单据类型')
      }
    }
  )
  watch(
    () => document.value?.businessDate,
    (date, previous) => {
      if (document.value && date && document.value.postingDate === previous)
        document.value.postingDate = date
    }
  )
  defineExpose({ open })
</script>
