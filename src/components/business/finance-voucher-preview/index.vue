<template>
  <ArtDialog ref="dialog" title="凭证预览" size="xl" :show-footer="false">
    <ElAlert
      v-if="result?.message"
      :title="result.message"
      :type="result.lines?.length ? 'info' : 'warning'"
      :closable="false"
    />
    <ArtTable
      class="mt-4"
      :data="result?.lines || []"
      :columns="columns"
      :pagination="false"
      empty-text="尚无可预览分录"
      empty-description="请按提示配置自动入账规则后重新预览。"
    />
  </ArtDialog>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { formatNumberValue, formatSensitiveCurrencyValue } from '@/utils/ui/format'
  import type { FinanceVoucherPreviewLine } from '@/api/finance-voucher.types'
  import type { ColumnOption } from '@/types'
  export interface FinanceVoucherPreviewResult {
    message?: string
    lines?: FinanceVoucherPreviewLine[]
  }
  defineOptions({ name: 'FinanceVoucherPreview' })
  const props = defineProps<{ result?: FinanceVoucherPreviewResult }>()
  const dialog = ref<ArtDialogExpose>()
  const hasForeignLines = computed(() => props.result?.lines?.some((row) => row.currencyCode))
  const columns = computed<ColumnOption<FinanceVoucherPreviewLine>[]>(() => [
    { prop: 'summary', label: '摘要', minWidth: 220 },
    { prop: 'subjectCode', label: '科目编码', width: 130 },
    { prop: 'subjectName', label: '科目名称', minWidth: 200 },
    ...(hasForeignLines.value
      ? [
          { prop: 'currencyCode', label: '原币', width: 100 },
          {
            prop: 'originalAmount',
            label: '原币金额',
            width: 165,
            align: 'right' as const,
            formatter: (row: FinanceVoucherPreviewLine) =>
              row.currencyCode
                ? formatSensitiveCurrencyValue(row.originalAmount, row.currencyCode)
                : '—'
          },
          {
            prop: 'exchangeRate',
            label: '原记账汇率',
            width: 150,
            formatter: (row: FinanceVoucherPreviewLine) =>
              row.exchangeRate == null
                ? '—'
                : formatNumberValue(row.exchangeRate, 'zh-CN', { maximumFractionDigits: 12 })
          }
        ]
      : []),
    ...(props.result?.lines?.some((row) => row.baseCurrencyCode)
      ? [{ prop: 'baseCurrencyCode', label: '本位币', width: 100 }]
      : []),
    {
      prop: 'debitAmount',
      label: '借方(本位币)',
      width: 160,
      align: 'right',
      formatter: (row) =>
        formatSensitiveCurrencyValue(row.debitAmount, row.baseCurrencyCode || 'CNY')
    },
    {
      prop: 'creditAmount',
      label: '贷方(本位币)',
      width: 160,
      align: 'right',
      formatter: (row) =>
        formatSensitiveCurrencyValue(row.creditAmount, row.baseCurrencyCode || 'CNY')
    }
  ])
  async function handleOpen(): Promise<void> {
    await dialog.value?.handleOpen()
  }
  defineExpose({ handleOpen })
</script>
