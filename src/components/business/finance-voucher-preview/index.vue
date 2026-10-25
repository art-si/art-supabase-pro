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
  import { ref } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import type { ColumnOption } from '@/types'
  export interface FinanceVoucherPreviewLine {
    summary: string
    subjectCode: string
    subjectName: string
    debitAmount: number
    creditAmount: number
  }
  export interface FinanceVoucherPreviewResult {
    message?: string
    lines?: FinanceVoucherPreviewLine[]
  }
  defineOptions({ name: 'FinanceVoucherPreview' })
  defineProps<{ result?: FinanceVoucherPreviewResult }>()
  const dialog = ref<ArtDialogExpose>()
  const columns: ColumnOption<FinanceVoucherPreviewLine>[] = [
    { prop: 'summary', label: '摘要', minWidth: 220 },
    { prop: 'subjectCode', label: '科目编码', width: 130 },
    { prop: 'subjectName', label: '科目名称', minWidth: 200 },
    {
      prop: 'debitAmount',
      label: '借方',
      width: 160,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.debitAmount)
    },
    {
      prop: 'creditAmount',
      label: '贷方',
      width: 160,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.creditAmount)
    }
  ]
  async function handleOpen(): Promise<void> {
    await dialog.value?.handleOpen()
  }
  defineExpose({ handleOpen })
</script>
