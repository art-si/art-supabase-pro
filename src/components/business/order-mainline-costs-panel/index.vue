<template>
  <ArtSectionCard
    title="运单费用明细"
    subtitle="按明确关联的执行运单列示。合单费用会标记为共用，不能整笔计为本订单独占成本。"
    :loading="state.loading"
    :error="state.error"
    error-title="费用流水加载失败"
    :empty="!state.rows.length"
    :empty-title="canViewCosts ? '暂无关联费用' : '暂无费用查看权限'"
    :empty-description="
      canViewCosts
        ? '该订单关联的执行运单暂无费用记录。'
        : '请联系管理员开通订单综合查询和运单费用查看权限后再查询。'
    "
    :min-height="260"
    @retry="loadRows"
  >
    <ArtTable :data="state.rows" :columns="columns" :pagination="false" />
    <div v-if="state.total > pageSize" class="mt-4 flex justify-end">
      <ElPagination
        v-model:current-page="state.page"
        background
        layout="prev, pager, next, total"
        :page-size="pageSize"
        :total="state.total"
        @current-change="loadRows"
      />
    </div>
  </ArtSectionCard>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import { RouterLink } from 'vue-router'
  import { fetchOrderMainlineCosts, type OrderMainlineCostRecord } from '@/api/order-mainline-costs'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import { getWaybillCostDetailPath } from '@/router/business-paths'
  import { formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'

  defineOptions({ name: 'OrderMainlineCostsPanel' })

  const props = defineProps<{
    orderId: string
  }>()
  const { hasAuth } = useAuth()
  const canViewCosts = computed(
    () => hasAuth('FinanceWaybillCost:View') && hasAuth('TmsOrderQuery:View')
  )
  const pageSize = 20
  const state = reactive<{
    rows: OrderMainlineCostRecord[]
    total: number
    page: number
    loading: boolean
    error: string | null
  }>({ rows: [], total: 0, page: 1, loading: false, error: null })

  const columns = computed<ColumnOption<OrderMainlineCostRecord>[]>(() => [
    { type: 'globalIndex', label: '序号', width: 68 },
    {
      prop: 'costNo',
      label: '费用单号',
      minWidth: 170,
      formatter: (row) =>
        row.id ? (
          <RouterLink
            class="text-[var(--el-color-primary)] hover:underline focus-visible:outline-2"
            to={getWaybillCostDetailPath(row.id)}
          >
            {row.costNo || '查看费用'}
          </RouterLink>
        ) : (
          row.costNo || '--'
        )
    },
    {
      prop: 'waybillNoSnapshot',
      label: '执行运单',
      minWidth: 160,
      formatter: (row) => (
        <BusinessRecordLink
          label={row.waybillNoSnapshot || '查看执行运单'}
          to={
            row.waybillId && hasAuth('TmsLoadedWaybillList:View')
              ? `/tms/waybill-management/detail/${row.waybillId}`
              : undefined
          }
          compact
        />
      )
    },
    {
      prop: 'plateNoSnapshot',
      label: '承运车辆',
      minWidth: 125,
      formatter: (row) => row.plateNoSnapshot || '--'
    },
    {
      prop: 'driverNameSnapshot',
      label: '承运司机',
      minWidth: 125,
      formatter: (row) => row.driverNameSnapshot || '--'
    },
    {
      prop: 'shared',
      label: '费用归属',
      minWidth: 120,
      formatter: (row) =>
        row.shared ? (
          <ElTag size="small" type="warning">
            {row.linkedOrderCount} 单共用
          </ElTag>
        ) : (
          '本单执行'
        )
    },
    {
      prop: 'expenseItemName',
      label: '费用项目',
      minWidth: 140,
      formatter: (row) =>
        row.expenseItemName ? (
          row.expenseItemName
        ) : row.costType ? (
          <ArtDictDisplay dictCode="tmsWaybillCostType" value={row.costType} />
        ) : (
          '--'
        )
    },
    {
      prop: 'amount',
      label: '金额',
      minWidth: 125,
      align: 'right',
      formatter: (row) => formatSensitiveNumberWithAffix(row.amount, { prefix: '¥' })
    },
    {
      prop: 'occurredOn',
      label: '发生日期',
      minWidth: 125,
      formatter: (row) => row.occurredOn || '--'
    },
    {
      prop: 'auditStatus',
      label: '审核状态',
      minWidth: 110,
      dict: { code: 'tmsCostAuditStatus', display: 'tag' }
    },
    {
      prop: 'settlementStatus',
      label: '结算状态',
      minWidth: 110,
      dict: { code: 'tmsWaybillCostSettlementStatus', display: 'tag' }
    }
  ])

  let requestId = 0
  async function loadRows(): Promise<void> {
    const currentRequest = ++requestId
    state.error = null
    if (!canViewCosts.value || !props.orderId) {
      state.rows = []
      state.total = 0
      state.loading = false
      return
    }
    state.loading = true
    try {
      const from = (state.page - 1) * pageSize
      const result = await fetchOrderMainlineCosts({
        orderId: props.orderId,
        from,
        to: from + pageSize - 1
      })
      if (currentRequest !== requestId) return
      state.rows = result.data
      state.total = result.total
    } catch {
      if (currentRequest !== requestId) return
      state.rows = []
      state.total = 0
      state.error = '暂时无法读取订单运单费用，请重试。'
    } finally {
      if (currentRequest === requestId) state.loading = false
    }
  }

  watch(
    () => [props.orderId, canViewCosts.value],
    () => {
      state.page = 1
      void loadRows()
    },
    { immediate: true }
  )
</script>
