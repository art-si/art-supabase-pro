<template>
  <ArtPageShell
    class="operations-dashboard"
    :loading="overview.loading"
    :loading-mode="loadingMode"
    :error="pageError"
    min-height="520px"
    @retry="refreshData"
  >
    <BusinessWorkspaceHeader
      eyebrow="TRANSPORT CONTROL"
      :title="`${greeting}，${userName}`"
      description="聚焦今日运力、调度进度与车辆风险，快速处理需要关注的运营事项。"
      icon="ri:dashboard-3-line"
      :tags="workspaceTags"
      class="operations-dashboard__header"
      density="compact"
      refreshable
      refresh-label="刷新运营数据"
      :refresh-loading="overview.loading"
      @refresh="refreshData"
    >
      <template #actions>
        <ElButton :icon="Van" @click="navigateTo('/tms/waybill-management/pending')">
          处理调度
        </ElButton>
        <ElButton type="primary" :icon="EditPen" @click="navigateTo('/tms/order-open')">
          立即开单
        </ElButton>
      </template>
    </BusinessWorkspaceHeader>

    <DashboardMetricCards :items="metricCards" @select="navigateTo" />

    <section class="operations-dashboard__operations">
      <DashboardTransit
        :orders="overview.data.transitOrders"
        @monitor="navigateTo('/tms/in-transit-monitor')"
        @open-order="openOrder"
      />
      <DashboardFleetRisk
        :vehicle-count="overview.data.vehicleCount"
        :operating-vehicle-count="overview.data.operatingVehicleCount"
        :pending-audit-vehicle-count="overview.data.pendingAuditVehicleCount"
        :reminder-total="reminderTotal"
        :reminders="overview.data.reminders"
        @view-reminder="navigateTo('/vms/reminder-manage')"
      />
    </section>

    <section class="operations-dashboard__summary">
      <DashboardTrend
        :period="overview.period"
        :data="trendData"
        :loading="overview.loading"
        @update:period="handleTrendPeriodChange"
      />
      <DashboardOrderFlow
        :period-label="trendPeriodLabel"
        :total="statusTotal"
        :in-transit-count="overview.data.inTransitCount"
        :status-items="statusItems"
        :loading="overview.loading"
        @view-orders="navigateTo('/tms/order-list')"
      />
    </section>

    <DashboardRecentOrders
      :orders="overview.data.recentOrders"
      @view-orders="navigateTo('/tms/order-list')"
      @open-order="openOrder"
    />
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { EditPen, Van } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import {
    fetchDashboardData,
    type DashboardData,
    type DashboardTrendPeriod
  } from '@/api/dashboard'
  import { useUserStore } from '@/store/modules/user'
  import { formatCurrencyValue, formatNumberValue } from '@/utils/ui'
  import { navigateToApplication } from '@/utils/application-navigation'
  import DashboardFleetRisk from './modules/dashboard-fleet-risk.vue'
  import DashboardMetricCards from './modules/dashboard-metric-cards.vue'
  import DashboardOrderFlow from './modules/dashboard-order-flow.vue'
  import DashboardRecentOrders from './modules/dashboard-recent-orders.vue'
  import DashboardTransit from './modules/dashboard-transit.vue'
  import DashboardTrend from './modules/dashboard-trend.vue'
  import type { DashboardMetric, DashboardStatusItem, DashboardTrendData } from './modules/types'

  interface OverviewState {
    loading: boolean
    loaded: boolean
    error: Error | null
    lastUpdatedAt: number | null
    requestId: number
    period: DashboardTrendPeriod
    data: DashboardData
  }

  const router = useRouter()
  const { info, language } = storeToRefs(useUserStore())
  const createEmptyDashboard = (): DashboardData => ({
    todayOrderCount: 0,
    todayFreightAmount: 0,
    pendingDispatchCount: 0,
    inTransitCount: 0,
    vehicleCount: 0,
    operatingVehicleCount: 0,
    pendingAuditVehicleCount: 0,
    completedTodayCount: 0,
    trend: [],
    statusCounts: {},
    transitOrders: [],
    recentOrders: [],
    reminders: []
  })
  const overview = reactive<OverviewState>({
    loading: false,
    loaded: false,
    error: null,
    lastUpdatedAt: null,
    requestId: 0,
    period: 'month',
    data: createEmptyDashboard()
  })
  const statusDefinitions = [
    { key: 'pending_load', label: '待配载', color: 'var(--el-color-primary)' },
    { key: 'pending_order', label: '待发车', color: 'var(--el-color-info)' },
    { key: 'transporting', label: '运输中', color: 'var(--el-color-success)' },
    { key: 'signed', label: '待结案', color: 'var(--el-color-warning)' },
    { key: 'completed', label: '已完成', color: 'var(--el-text-color-secondary)' }
  ]
  const locale = computed(() =>
    String(language.value).toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  )
  const greeting = computed(() => {
    const hour = new Date().getHours()
    return hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
  })
  const userName = computed(() => {
    const candidates = [
      info.value?.nickName,
      info.value?.organization?.organizationName,
      info.value?.userName
    ]
    return (
      candidates.find((value) => value && !/^\d+$/.test(String(value).trim()))?.trim() || '用户'
    )
  })
  const userContext = computed(() => {
    const organization = info.value?.organization?.organizationName
    const role = info.value?.roleNames?.[0] ?? info.value?.userRoles?.[0]
    return [organization, role].filter(Boolean).join(' · ')
  })
  const dateText = computed(() =>
    new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    }).format(new Date())
  )
  const dataStatusTag = computed<BusinessWorkspaceTag>(() => {
    if (overview.loading) return { label: '运营数据更新中', type: 'info', effect: 'plain' }
    if (overview.error) return { label: '更新失败，请重试', type: 'danger', effect: 'plain' }
    if (!overview.lastUpdatedAt) return { label: '等待加载运营数据', type: 'info', effect: 'plain' }

    const updatedAt = new Intl.DateTimeFormat(locale.value, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(overview.lastUpdatedAt)
    return { label: `更新于 ${updatedAt}`, type: 'success', effect: 'plain' }
  })
  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    dataStatusTag.value,
    { label: dateText.value, type: 'info', effect: 'plain' },
    ...(userContext.value
      ? [{ label: userContext.value, type: 'primary' as const, effect: 'plain' as const }]
      : [])
  ])
  const trendData = computed<DashboardTrendData>(() => ({
    labels: overview.data.trend.map((item) => item.label),
    values: overview.data.trend.map((item) => item.orderCount),
    orderCount: overview.data.trend.reduce((total, item) => total + item.orderCount, 0),
    freightAmount: overview.data.trend.reduce((total, item) => total + item.freightAmount, 0)
  }))
  const trendPeriodLabel = computed(
    () =>
      ({
        today: '当天',
        week: '本周',
        month: '本月',
        year: '本年'
      })[overview.period]
  )
  const statusTotal = computed(() =>
    Object.values(overview.data.statusCounts).reduce((total, value) => total + value, 0)
  )
  const statusItems = computed<DashboardStatusItem[]>(() =>
    statusDefinitions.map((item) => {
      const value = overview.data.statusCounts[item.key] ?? 0
      return {
        ...item,
        value,
        percent: statusTotal.value ? Math.round((value / statusTotal.value) * 100) : 0
      }
    })
  )
  const reminderTotal = computed(() =>
    overview.data.reminders.reduce((total, item) => total + item.count, 0)
  )
  const loadingMode = computed<'mask' | 'skeleton'>(() => (overview.loaded ? 'mask' : 'skeleton'))
  const pageError = computed(() => (overview.loaded ? null : overview.error))
  const metricCards = computed<DashboardMetric[]>(() => [
    {
      key: 'risk',
      label: '风险待处理',
      value: formatNumberValue(reminderTotal.value, locale.value),
      unit: '项',
      hint: `${overview.data.pendingAuditVehicleCount} 台车辆待审核`,
      icon: 'ri:alarm-warning-line',
      tone: 'danger',
      route: '/vms/reminder-manage'
    },
    {
      key: 'pending-dispatch',
      label: '待调度',
      value: formatNumberValue(overview.data.pendingDispatchCount, locale.value),
      unit: '单',
      hint: '待安排车辆与司机',
      icon: 'ri:truck-line',
      tone: 'warning',
      route: '/tms/waybill-management/pending'
    },
    {
      key: 'in-transit',
      label: '运输中',
      value: formatNumberValue(overview.data.inTransitCount, locale.value),
      unit: '单',
      hint: '实时关注运输进度',
      icon: 'ri:route-line',
      tone: 'success',
      route: '/tms/in-transit-monitor'
    },
    {
      key: 'today-order',
      label: '今日开单',
      value: formatNumberValue(overview.data.todayOrderCount, locale.value),
      unit: '单',
      hint: '今日新增运输订单',
      icon: 'ri:file-list-3-line',
      tone: 'primary',
      route: '/tms/order-list'
    },
    {
      key: 'today-freight',
      label: '今日运费',
      value: formatCurrencyValue(overview.data.todayFreightAmount, 'CNY', locale.value),
      hint: '今日开单金额汇总',
      icon: 'ri:money-cny-circle-line',
      tone: 'info',
      route: '/tms/order-list'
    },
    {
      key: 'completed-today',
      label: '今日完成',
      value: formatNumberValue(overview.data.completedTodayCount, locale.value),
      unit: '单',
      hint: '今日完成签收结案',
      icon: 'ri:checkbox-circle-line',
      tone: 'success',
      route: '/tms/order-list'
    }
  ])

  async function refreshData(): Promise<void> {
    const requestId = ++overview.requestId
    overview.loading = true
    overview.error = null
    try {
      const data = await fetchDashboardData(overview.period)
      if (requestId !== overview.requestId) return
      overview.data = data
      overview.loaded = true
      overview.lastUpdatedAt = Date.now()
    } catch (error) {
      if (requestId !== overview.requestId) return
      overview.error = error instanceof Error ? error : new Error('运营工作台加载失败')
    } finally {
      if (requestId === overview.requestId) overview.loading = false
    }
  }
  function handleTrendPeriodChange(period: DashboardTrendPeriod): void {
    if (overview.period === period) return
    overview.period = period
    void refreshData()
  }
  function navigateTo(path: string): void {
    if (path.startsWith('/vms/')) {
      void navigateToApplication('vms', path).catch((error) =>
        ElMessage.error(getFriendlySupabaseErrorMessage(error, 'VMS 应用跳转失败'))
      )
      return
    }
    void router.push(path)
  }
  function openOrder(id?: string): void {
    if (id) void router.push({ name: 'TmsOrderDetail', params: { id } })
  }
  onMounted(() => {
    void refreshData()
  })
  defineOptions({ name: 'Console' })
</script>

<style scoped lang="scss">
  .operations-dashboard {
    min-height: 100%;
    font-variant-numeric: tabular-nums;

    :deep(> .art-async-state) {
      display: grid;
      gap: 16px;
      min-width: 0;
      padding-bottom: var(--art-space-6);
    }

    &__summary {
      display: grid;
      grid-template-columns: minmax(0, 1.65fr) minmax(330px, 0.72fr);
      gap: 16px;
      min-width: 0;
    }

    &__operations {
      display: grid;
      grid-template-columns: minmax(0, 1.55fr) minmax(330px, 0.78fr);
      gap: 16px;
      min-width: 0;
    }

    @media screen and (width <= 1080px) {
      &__summary,
      &__operations {
        grid-template-columns: 1fr;
      }
    }

    @media screen and (width <= 720px) {
      :deep(> .art-async-state) {
        gap: var(--art-space-3);
      }
    }
  }
</style>
