<template>
  <ArtDialog
    ref="dialogRef"
    title="库存成本勾稽"
    subtitle="核对到票成本与原库存基线，确认后登记金额调整；不改变库存数量、不发起付款。"
    size="xl"
    :loading="preview.loading && !preview.data"
    confirm-text="确认成本勾稽"
    @closed="reset"
  >
    <ArtEntitySummary
      v-if="preview.data"
      class="mb-4"
      :title="preview.data.documentNo"
      :description="`${preview.data.tenantName} · ${preview.data.accountSetName} · 本位币 ${preview.data.baseCurrencyCode} · 待处理 ${pending.length} 行`"
      icon="ri:scales-3-line"
      compact
    >
      <template #aside>
        <div class="text-right">
          <small class="block text-xs text-g-600">{{
            !preview.data.lines.length
              ? '库存调整额'
              : pending.length
                ? '本次库存调整额'
                : '已执行库存调整额'
          }}</small>
          <strong class="text-xl font-semibold tabular-nums text-g-900">{{
            adjustmentTotal
          }}</strong>
        </div>
      </template>
    </ArtEntitySummary>
    <p v-if="preview.data?.supplierName" class="mb-4 text-sm text-g-700"
      >往来单位：{{ preview.data.supplierName }}</p
    >
    <ArtSectionCard
      title="成本核对"
      subtitle="未完成行按当前库存预览；已完成行展示执行快照，不重复调整。"
      :error="preview.data ? '' : preview.error"
      :empty="!preview.loading && !!preview.data && !preview.data.lines.length"
      empty-title="没有可核对的物料明细"
      empty-description="请核对财务应付及采购入库来源后重新预览。"
      @retry="load"
    >
      <template #actions>
        <ArtIconButton
          icon="ri:refresh-line"
          label="重新预览成本"
          :loading="preview.loading"
          :disabled="preview.executing"
          @click="load"
        />
      </template>
      <ElAlert
        v-if="preview.data && preview.error"
        class="mb-4!"
        :title="preview.error"
        description="确认已暂停；请重新预览并核对最新分配后再试。"
        type="error"
        :closable="false"
        show-icon
      />
      <ElAlert
        v-if="blocker"
        class="mb-4!"
        :title="blocker"
        :type="pending.length ? 'warning' : 'info'"
        :closable="false"
        show-icon
      />
      <ArtForm
        v-if="preview.data && pending.length"
        v-model="form.data"
        root-class="p-0! md:p-0!"
        :items="formItems"
        :disabled="preview.loading || preview.executing || !!preview.error"
        label-position="top"
        :show-submit="false"
        :show-reset="false"
      />
      <ArtTable
        :data="preview.data?.lines || []"
        :columns="lineColumns"
        :pagination="false"
        :max-height="260"
        row-key="financialLineId"
      />
    </ArtSectionCard>
    <ArtSectionCard
      v-if="preview.data && batchRows.length"
      class="mt-4"
      title="批次金额分配"
      subtitle="仅金额发生变化，原实物移动及其单价保留；已完成行保留执行时的批次数量和成本。"
    >
      <ArtTable
        :data="batchRows"
        :columns="batchColumns"
        :pagination="false"
        :max-height="240"
        row-key="recordKey"
      />
    </ArtSectionCard>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, reactive, ref, unref, watch } from 'vue'
  import dayjs from 'dayjs'
  import { sumBy } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import {
    matchPayableStockCost,
    previewPayableStockCost,
    type PayableStockCostBatch,
    type PayableStockCostLine,
    type PayableStockCostPreview
  } from '@/api/purchase-payable'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import {
    payableStockCostBlocker,
    payableStockCostUnitFormat
  } from '@/utils/finance/payable-stock-cost'
  import {
    formatCompactNumberValue,
    formatCurrencyValue,
    formatNumberValue
  } from '@/utils/ui/format'
  import type { ColumnOption } from '@/types'

  interface PreviewState {
    id: string
    data?: PayableStockCostPreview
    loading: boolean
    executing: boolean
    error: string
  }
  interface CostBatchRow extends PayableStockCostBatch {
    recordKey: string
    lineNo: number
    sourceDocumentNo: string
    currencyCode: string
  }

  const props = defineProps<{ permission: string }>()
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const tenantScope = useTenantScopeStore()
  const { hasAuth } = useAuth()
  const preview = reactive<PreviewState>({
    id: '',
    data: undefined,
    loading: false,
    executing: false,
    error: ''
  })
  const form = reactive({ data: { date: '', acknowledgeBaseline: false } })
  let requestVersion = 0
  const pending = computed(() => preview.data?.lines.filter((line) => !line.matched) || [])
  const needsBaseline = computed(() => pending.value.some((line) => line.baselineDifference !== 0))
  const blocker = computed(() => (preview.data ? payableStockCostBlocker(preview.data) : ''))
  const adjustmentTotal = computed(() =>
    preview.data?.lines.length
      ? formatCurrencyValue(
          sumBy(pending.value.length ? pending.value : preview.data.lines, 'adjustmentAmount'),
          preview.data.baseCurrencyCode
        )
      : '—'
  )
  const confirmDisabled = computed(
    () =>
      preview.loading ||
      preview.executing ||
      !!preview.error ||
      !preview.data ||
      !!blocker.value ||
      !hasAuth(props.permission) ||
      !form.data.date ||
      form.data.date < preview.data.minimumDate ||
      form.data.date > preview.data.costDate ||
      (needsBaseline.value && !form.data.acknowledgeBaseline)
  )
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'date',
      label: '成本日期',
      type: 'date',
      span: 8,
      props: {
        valueFormat: 'YYYY-MM-DD',
        clearable: false,
        disabledDate: (date: Date) => {
          const value = dayjs(date).format('YYYY-MM-DD')
          return (
            !!preview.data && (value < preview.data.minimumDate || value > preview.data.costDate)
          )
        }
      }
    },
    {
      key: 'acknowledgeBaseline',
      label: '库存基线确认',
      type: 'checkbox',
      span: 16,
      hidden: !needsBaseline.value,
      props: { label: '已逐行核对基线差额' },
      description: `基线差额合计 ${formatCurrencyValue(sumBy(pending.value, 'baselineDifference'), preview.data?.baseCurrencyCode)}；请逐行核对，税额口径及原库存基线变动与暂估价格差异分别保留。`
    }
  ])
  const moneyColumn = (
    prop:
      | 'originalAmount'
      | 'actualCostAmount'
      | 'apCostDifference'
      | 'baselineDifference'
      | 'adjustmentAmount',
    label: string
  ): ColumnOption<PayableStockCostLine> => ({
    prop,
    label,
    minWidth: 150,
    align: 'right',
    fixed: prop === 'adjustmentAmount' || prop === 'baselineDifference' ? 'right' : undefined,
    formatter: (row) => formatCurrencyValue(row[prop], row.currencyCode)
  })
  const lineColumns: ColumnOption<PayableStockCostLine>[] = [
    { prop: 'lineNo', label: '行号', width: 64, fixed: 'left' },
    {
      prop: 'materialDescription',
      label: '物料',
      minWidth: 150,
      fixed: 'left',
      formatter: (row) => row.materialDescription || row.materialCode || '物料信息待核对'
    },
    {
      prop: 'basicQuantity',
      label: '数量(源基本单位)',
      minWidth: 145,
      align: 'right',
      formatter: (row) =>
        `${formatCompactNumberValue(row.basicQuantity, 6)} ${row.sourceBaseUnitName}`
    },
    moneyColumn('originalAmount', '分摊原库存成本'),
    moneyColumn('actualCostAmount', '到票成本'),
    moneyColumn('apCostDifference', '暂估成本差异'),
    moneyColumn('baselineDifference', '基线差额'),
    { prop: 'sourceDocumentNo', label: '采购入库来源', minWidth: 200 },
    {
      prop: 'matched',
      label: '已完成',
      width: 90,
      dict: { code: 'commonBoolean', display: 'text', value: (row) => String(row.matched) }
    },
    { prop: 'matchedDate', label: '完成日期', minWidth: 130 },
    moneyColumn('adjustmentAmount', '库存调整额')
  ]
  const batchRows = computed<CostBatchRow[]>(() =>
    (preview.data?.lines || []).flatMap((line) =>
      line.batches.map((batch) => ({
        ...batch,
        recordKey: `${line.financialLineId}:${batch.id}`,
        lineNo: line.lineNo,
        sourceDocumentNo: line.sourceDocumentNo,
        currencyCode: line.currencyCode
      }))
    )
  )
  const batchColumns: ColumnOption<CostBatchRow>[] = [
    { prop: 'lineNo', label: '财务行', width: 80, fixed: 'left' },
    {
      prop: 'batchNo',
      label: '库存批次',
      minWidth: 180,
      fixed: 'left',
      formatter: (row) => row.batchNo || '无批号'
    },
    { prop: 'warehouseName', label: '仓库', minWidth: 160 },
    { prop: 'organizationName', label: '库存组织', minWidth: 170 },
    {
      prop: 'accountSetName',
      label: '核算账套',
      minWidth: 170,
      formatter: (row) => row.accountSetName || '尚未映射账套'
    },
    {
      prop: 'quantity',
      label: '批次数量',
      minWidth: 115,
      align: 'right',
      formatter: (row) => formatCompactNumberValue(row.quantity, 3)
    },
    {
      prop: 'unitCost',
      label: '调整前单位成本',
      minWidth: 165,
      align: 'right',
      formatter: (row) => formatNumberValue(row.unitCost, 'zh-CN', payableStockCostUnitFormat)
    },
    {
      prop: 'afterUnitCost',
      label: '调整后单位成本',
      minWidth: 165,
      align: 'right',
      formatter: (row) =>
        row.afterUnitCost === null
          ? '—'
          : formatNumberValue(row.afterUnitCost, 'zh-CN', payableStockCostUnitFormat)
    },
    {
      prop: 'adjustmentAmount',
      label: '本位币调整额',
      minWidth: 155,
      align: 'right',
      fixed: 'right',
      formatter: (row) =>
        row.adjustmentAmount === null
          ? '—'
          : formatCurrencyValue(row.adjustmentAmount, row.currencyCode)
    }
  ]

  async function load(): Promise<void> {
    if (!preview.id || preview.executing) return
    const current = ++requestVersion
    preview.loading = true
    preview.error = ''
    form.data.acknowledgeBaseline = false
    try {
      const result = await previewPayableStockCost(preview.id)
      if (current !== requestVersion) return
      preview.data = result
      if (
        !form.data.date ||
        form.data.date < result.minimumDate ||
        form.data.date > result.costDate
      )
        form.data.date = result.costDate
    } catch (cause) {
      if (current === requestVersion)
        preview.error = getFriendlySupabaseErrorMessage(cause, '成本预览暂不可用，请重新预览后重试')
    } finally {
      if (current === requestVersion) preview.loading = false
    }
  }
  async function open(id: string): Promise<void> {
    if (preview.executing || !hasAuth(props.permission) || !hasAuth('FinancePurchasePayable:View'))
      return
    Object.assign(preview, { id, data: undefined, loading: false, executing: false, error: '' })
    Object.assign(form.data, { date: '', acknowledgeBaseline: false })
    await dialogRef.value?.handleOpen(undefined, {
      confirmDisabled: true,
      onConfirm: async () => {
        if (confirmDisabled.value || !preview.data) return false
        preview.executing = true
        const current = requestVersion
        try {
          const affected = await matchPayableStockCost(
            preview.data,
            form.data.date,
            form.data.acknowledgeBaseline
          )
          if (current === requestVersion) {
            ElMessage.success(
              affected ? `已完成 ${affected} 行成本勾稽` : '所选明细已完成成本勾稽，未重复调整'
            )
            emit('success')
          }
          return true
        } catch (cause) {
          if (current === requestVersion)
            preview.error = getFriendlySupabaseErrorMessage(
              cause,
              '成本勾稽结果未确认，请重新预览后核对'
            )
          return false
        } finally {
          if (current === requestVersion) preview.executing = false
        }
      }
    })
    await load()
  }
  function reset(): void {
    if (unref(dialogRef.value?.visible)) return
    requestVersion += 1
    Object.assign(preview, { id: '', data: undefined, loading: false, executing: false, error: '' })
    Object.assign(form.data, { date: '', acknowledgeBaseline: false })
  }
  watch(
    [confirmDisabled, () => pending.value.length, () => !!preview.data],
    ([disabled, count, loaded]) => {
      dialogRef.value?.setOptions({
        confirmDisabled: disabled,
        showConfirmButton: !loaded || count > 0,
        cancelText: loaded && !count ? '关闭' : '取消'
      })
    },
    { flush: 'sync' }
  )
  watch(
    () => tenantScope.revision,
    () => {
      requestVersion += 1
      void dialogRef.value?.handleClose(true)
    }
  )
  onBeforeUnmount(() => {
    requestVersion += 1
  })
  defineExpose({ open })
</script>
