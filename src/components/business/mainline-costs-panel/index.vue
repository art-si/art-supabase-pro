<template>
  <ArtSectionCard
    title="费用流水"
    :subtitle="
      scope === 'vehicle'
        ? '按明确绑定本车的执行运单归集；一单多车时不将整单费用重复计入每台车'
        : '仅列出费用单明确指定该司机的记录；不把同运单其他司机的费用算入此处'
    "
    :loading="state.loading"
    :error="state.error"
    error-title="费用流水加载失败"
    :empty="!state.rows.length"
    :empty-title="canViewCosts ? '暂无关联费用' : '暂无费用查看权限'"
    :empty-description="
      canViewCosts
        ? '当前主线尚无明确关联的运单费用记录。'
        : '请联系管理员开通运单费用查看权限后再查询。'
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
  import { RouterLink } from 'vue-router'
  import { fetchMainlineCosts, type MainlineCostRecord } from '@/api/mainline-operating'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import BusinessRecordLink from '@/components/business/business-record-link/index.vue'
  import { getWaybillCostDetailPath } from '@/router/business-paths'
  import { formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import type { ColumnOption } from '@/types'
  import { useAuth } from '@/hooks/core/useAuth'

  defineOptions({ name: 'MainlineCostsPanel' })

  const props = defineProps<{
    scope: 'vehicle' | 'driver'
    recordId: string
  }>()
  const { hasAuth } = useAuth()
  const canViewCosts = computed(() => hasAuth('FinanceWaybillCost:View'))
  const pageSize = 20
  const state = reactive<{
    rows: MainlineCostRecord[]
    total: number
    page: number
    loading: boolean
    error: string | null
  }>({ rows: [], total: 0, page: 1, loading: false, error: null })

  const columns = computed<ColumnOption<MainlineCostRecord>[]>(() => [
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
      prop: 'orderNoSnapshot',
      label: '运输订单',
      minWidth: 160,
      formatter: (row) => row.orderNoSnapshot || '--'
    },
    {
      prop: props.scope === 'vehicle' ? 'driverNameSnapshot' : 'plateNoSnapshot',
      label: props.scope === 'vehicle' ? '承运司机' : '承运车辆',
      minWidth: 130,
      formatter: (row) =>
        props.scope === 'vehicle' ? row.driverNameSnapshot || '--' : row.plateNoSnapshot || '--'
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
    if (!canViewCosts.value || !props.recordId) {
      state.rows = []
      state.total = 0
      state.loading = false
      return
    }
    state.loading = true
    try {
      const from = (state.page - 1) * pageSize
      const result = await fetchMainlineCosts({
        [props.scope === 'vehicle' ? 'vehicleId' : 'driverId']: props.recordId,
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
      state.error = '暂时无法读取费用流水，请重试。'
    } finally {
      if (currentRequest === requestId) state.loading = false
    }
  }

  watch(
    () => [props.scope, props.recordId, canViewCosts.value],
    () => {
      state.page = 1
      void loadRows()
    },
    { immediate: true }
  )
</script>
