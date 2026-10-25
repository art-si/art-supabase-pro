<template>
  <div class="opening-reconciliation">
    <ArtEntitySummary
      icon="ri:scales-3-line"
      eyebrow="OPENING BALANCES"
      :title="organizationName"
      description="核对库存期初结存、未结清应收与暂估应付。汇总金额只包含已审核单据。"
    />
    <ElAlert
      type="info"
      :closable="false"
      title="库存实存与未结清往来分别核对"
      description="往来单据数量仅供追溯，不能推算实存库存。请按物料、仓库、仓位、批次核对盘点余额，并按客户／供应商核对未结清金额。"
    />
    <ArtAsyncState
      :loading="loading"
      loading-mode="skeleton"
      :error="error"
      error-title="初始化对账加载失败"
      :empty="rows.length === 0"
      empty-text="暂无期初数据"
      empty-description="请先录入初始库存或期初往来单据，再刷新对账表。"
      @retry="load"
    >
      <ArtDescriptions :data="totals" :items="summaryItems" :columns="3" />
      <div class="opening-reconciliation__toolbar">
        <ElSelect
          v-model="balanceType"
          aria-label="余额类别"
          placeholder="全部期初明细"
          class="opening-reconciliation__category"
        >
          <ElOption label="全部期初明细" value="" />
          <ElOption label="期初库存" value="stock" />
          <ElOption label="期初应收" value="receivable" />
          <ElOption label="期初暂估应付" value="estimated_payable" />
        </ElSelect>
        <ElButton :loading="loading" @click="load">刷新对账</ElButton>
      </div>
      <ArtTable
        :data="visibleRows"
        :columns="columns"
        :pagination="false"
        row-key="id"
        max-height="420"
        :cell-class-name="cellClassName"
        empty-text="该类别暂无期初明细"
      />
    </ArtAsyncState>
  </div>
</template>

<script setup lang="tsx">
  import { computed, ref, watch } from 'vue'
  import { ElButton, ElOption, ElSelect, ElTag } from 'element-plus'
  import { useRouter } from 'vue-router'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchWmsInitializationReconciliation,
    type WmsInitializationReconciliationRow
  } from '@/api/wms-initialization-accounting'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { formatCurrencyValue, formatNumberValue } from '@/utils/ui/format'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'

  const props = defineProps<{ organizationId: string; organizationName: string }>()
  const router = useRouter()
  const { hasAuth } = useAuth()
  const rows = ref<WmsInitializationReconciliationRow[]>([])
  const loading = ref(false)
  const error = ref('')
  const balanceType = ref('')
  let requestId = 0
  const labels = { stock: '期初库存', receivable: '期初应收', estimated_payable: '期初暂估应付' }
  const visibleRows = computed(() =>
    rows.value.filter((row) => !balanceType.value || row.balanceType === balanceType.value)
  )
  const totals = computed(() =>
    Object.fromEntries(
      Object.keys(labels).map((key) => [
        key,
        formatCurrencyValue(
          rows.value
            .filter((row) => row.status === 'approved' && row.balanceType === key)
            .reduce((sum, row) => sum + Number(row.totalAmount), 0)
        )
      ])
    )
  )
  const summaryItems: ArtDescriptionItem<Record<string, string>>[] = Object.entries(labels).map(
    ([key, label]) => ({ key, label, field: key })
  )
  function routeName(row: WmsInitializationReconciliationRow): string {
    if (row.sourceArea === 'stock') return 'WmsInitialStock'
    if (row.sourceArea === 'sales')
      return row.quantity < 0 ? 'WmsInitialSalesReturn' : 'WmsInitialSalesOutbound'
    return row.quantity < 0 ? 'WmsInitialPurchaseReturn' : 'WmsInitialPurchaseInbound'
  }
  async function openSource(row: WmsInitializationReconciliationRow): Promise<void> {
    await router.push({ name: routeName(row), query: { documentId: row.documentId } })
  }
  function cellClassName({
    row,
    column
  }: {
    row: WmsInitializationReconciliationRow
    column: { property?: string }
  }): string {
    return row.quantity < 0 &&
      ['quantity', 'amount', 'taxAmount', 'totalAmount'].includes(column.property || '')
      ? 'opening-negative'
      : ''
  }
  const columns: ColumnOption<WmsInitializationReconciliationRow>[] = [
    {
      prop: 'documentNo',
      label: '来源单据',
      fixed: 'left',
      minWidth: 180,
      formatter: (row) =>
        hasAuth(`${routeName(row)}:View`) ? (
          <ElButton link type="primary" onClick={() => openSource(row)}>
            {row.documentNo}
          </ElButton>
        ) : (
          row.documentNo
        )
    },
    {
      prop: 'balanceType',
      label: '余额类别',
      minWidth: 145,
      formatter: (row) => labels[row.balanceType]
    },
    {
      prop: 'status',
      label: '审核状态',
      width: 110,
      formatter: (row) => (
        <ElTag type={row.status === 'approved' ? 'success' : 'warning'}>
          {row.status === 'approved' ? '已审核' : row.status === 'submitted' ? '已提交' : '暂存'}
        </ElTag>
      )
    },
    { prop: 'counterpartyName', label: '客户／供应商', minWidth: 180 },
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'materialName', label: '物料名称', minWidth: 160 },
    { prop: 'warehouseName', label: '仓库', minWidth: 140 },
    { prop: 'binName', label: '仓位', minWidth: 140 },
    { prop: 'batchNo', label: '批次', minWidth: 130 },
    {
      prop: 'quantity',
      label: '数量',
      minWidth: 110,
      align: 'right',
      formatter: (row) => formatNumberValue(row.quantity)
    },
    { prop: 'unitName', label: '库存单位', width: 100 },
    {
      prop: 'amount',
      label: '金额',
      minWidth: 135,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.amount)
    },
    {
      prop: 'taxAmount',
      label: '税额',
      minWidth: 120,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.taxAmount)
    },
    {
      prop: 'totalAmount',
      label: '价税合计',
      minWidth: 140,
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.totalAmount)
    },
    {
      prop: 'pushed',
      label: '往来登记',
      minWidth: 120,
      formatter: (row) => (row.balanceType === 'stock' ? '—' : row.pushed ? '已登记' : '待下推')
    }
  ]
  async function load(): Promise<void> {
    const current = ++requestId
    loading.value = true
    error.value = ''
    rows.value = []
    try {
      const result = await fetchWmsInitializationReconciliation(props.organizationId)
      if (current === requestId) rows.value = result
    } catch (cause) {
      if (current === requestId)
        error.value = getFriendlySupabaseErrorMessage(cause, '初始化对账加载失败，请重试')
    } finally {
      if (current === requestId) loading.value = false
    }
  }
  watch(
    () => props.organizationId,
    () => {
      balanceType.value = ''
      void load()
    },
    { immediate: true }
  )
</script>

<style scoped>
  .opening-reconciliation {
    display: grid;
    gap: var(--art-space-4);
    min-width: 0;
  }

  .opening-reconciliation__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-3);
    align-items: center;
    justify-content: space-between;
    margin-block: var(--art-space-4);
  }

  .opening-reconciliation__category {
    width: min(192px, 100%);
  }

  :deep(.opening-negative .cell) {
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }
</style>
