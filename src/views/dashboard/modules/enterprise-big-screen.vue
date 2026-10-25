<template>
  <div ref="screenRef" class="enterprise-screen" :class="`is-${mode}`">
    <ArtAsyncState
      class="enterprise-screen__state"
      :loading="state.loading"
      :loading-mode="state.loaded ? 'mask' : 'skeleton'"
      :error="state.loaded ? null : state.error"
      :min-height="0"
      full-height
      @retry="loadData"
    >
      <ElScrollbar class="enterprise-screen__scrollbar">
        <div
          class="enterprise-screen__stage"
          :class="{ 'has-refresh-error': state.loaded && state.error }"
        >
          <header class="command-header">
            <div class="command-header__identity">
              <button
                type="button"
                class="screen-icon-button"
                aria-label="返回工作台"
                title="返回工作台"
                @click="exitScreen"
              >
                <ArtSvgIcon icon="ri:arrow-left-line" />
              </button>
              <div>
                <h1>{{ modeTitle }}</h1>
              </div>
            </div>

            <nav class="screen-nav" aria-label="大屏场景">
              <ElScrollbar class="screen-nav__scrollbar">
                <div class="screen-nav__items">
                  <RouterLink
                    v-for="item in screenNavItems"
                    :key="item.path"
                    :to="item.path"
                    :aria-current="item.mode === mode ? 'page' : undefined"
                    :class="{ 'is-active': item.mode === mode }"
                  >
                    <ArtSvgIcon :icon="item.icon" />
                    {{ item.label }}
                  </RouterLink>
                  <RouterLink to="/dashboard/asset-maintenance-command">
                    <ArtSvgIcon icon="ri:settings-3-line" />
                    设备运维
                  </RouterLink>
                  <RouterLink to="/tms/in-transit-monitor">
                    <ArtSvgIcon icon="ri:route-line" />
                    在途监控
                  </RouterLink>
                </div>
              </ElScrollbar>
            </nav>

            <div class="command-header__status">
              <div>
                <time :datetime="currentTime">{{ timeText }}</time>
                <span>{{ dateText }}</span>
              </div>
              <span class="live-status" :class="{ 'is-warning': state.error }">
                <i /> {{ state.error ? '数据更新失败' : '数据已同步' }}
              </span>
              <button
                type="button"
                class="screen-icon-button"
                :aria-label="fullscreenButtonLabel"
                :aria-pressed="isFullscreen"
                :title="fullscreenButtonLabel"
                @click="toggleScreenFullscreen"
              >
                <ArtSvgIcon
                  :icon="isFullscreen ? 'ri:fullscreen-exit-line' : 'ri:fullscreen-line'"
                />
              </button>
              <button
                type="button"
                class="screen-icon-button"
                :disabled="state.loading"
                aria-label="刷新大屏数据"
                title="刷新大屏数据"
                @click="loadData()"
              >
                <ArtSvgIcon icon="ri:refresh-line" :class="{ 'is-spinning': state.loading }" />
              </button>
            </div>
          </header>

          <ScreenRefreshNotice
            v-if="state.loaded && state.error"
            :updated-at="refreshText"
            :loading="state.loading"
            @retry="loadData()"
          />

          <main class="screen-content">
            <section class="metric-rail" aria-label="核心经营指标">
              <article v-for="metric in primaryMetrics" :key="metric.label" class="hero-metric">
                <div class="hero-metric__icon" :class="`is-${metric.tone}`">
                  <ArtSvgIcon :icon="metric.icon" />
                </div>
                <div class="hero-metric__content">
                  <span>{{ metric.label }}</span>
                  <strong
                    >{{ metric.value }}<em v-if="metric.unit">{{ metric.unit }}</em></strong
                  >
                  <small>{{ metric.hint }}</small>
                </div>
                <i class="hero-metric__signal" :class="`is-${metric.tone}`" />
              </article>
            </section>

            <template v-if="mode === 'business'">
              <section class="business-layout">
                <div class="screen-column screen-column--left">
                  <article class="screen-panel decision-panel">
                    <ScreenPanelHeading title="今日经营决策" icon="ri:focus-2-line" />
                    <div class="decision-score">
                      <ScreenGaugeChart
                        class="decision-score__gauge"
                        :value="businessScore"
                        label="综合健康度"
                      />
                      <div class="decision-score__copy">
                        <strong>{{ decisionHeadline }}</strong>
                        <p>{{ decisionDescription }}</p>
                      </div>
                    </div>
                    <div class="decision-signals">
                      <div v-for="item in decisionSignals" :key="item.label">
                        <span>{{ item.label }}</span>
                        <strong :class="`is-${item.tone}`">{{ item.value }}</strong>
                      </div>
                    </div>
                  </article>

                  <article class="screen-panel finance-panel">
                    <ScreenPanelHeading title="资金收支对比" icon="ri:bar-chart-box-line">
                      <template #aside>
                        <span class="finance-margin">毛利率 {{ grossMarginRate }}%</span>
                      </template>
                    </ScreenPanelHeading>
                    <ScreenHorizontalBarChart
                      class="finance-comparison-chart"
                      :items="financeComparisonItems"
                      unit="元"
                      summary-label="资金收支对比"
                      value-label="金额"
                    />
                  </article>
                </div>

                <div class="screen-column screen-column--center">
                  <article class="screen-panel trend-panel">
                    <ScreenPanelHeading title="全域经营数字孪生" icon="ri:global-line">
                      <template #aside>
                        <span class="panel-caption is-live">六域实时融合</span>
                      </template>
                    </ScreenPanelHeading>
                    <EnterpriseCommandCore
                      mode="business"
                      :title="decisionHeadline"
                      :score="businessScore"
                      :active-count="data.transport.inTransitCount"
                      :risk-count="totalRiskCount"
                      :nodes="domainHealth"
                      :telemetry="commandTelemetry"
                    />
                  </article>

                  <article class="screen-panel chain-panel">
                    <ScreenPanelHeading title="运输履约链路" icon="ri:route-line" />
                    <ScreenStageChart class="fulfillment-stage-chart" :items="fulfillmentStages" />
                  </article>
                </div>

                <div class="screen-column screen-column--right">
                  <article class="screen-panel health-panel">
                    <ScreenPanelHeading title="跨域健康度" icon="ri:heart-pulse-line" />
                    <ScreenHorizontalBarChart
                      class="domain-health-chart"
                      :items="domainHealthChartItems"
                      unit="/100"
                      summary-label="跨域健康度"
                      value-label="健康度"
                    />
                  </article>

                  <article class="screen-panel risk-panel">
                    <ScreenPanelHeading title="待关注事项" icon="ri:alarm-warning-line">
                      <template #aside
                        ><span class="risk-count">{{ totalRiskCount }}</span></template
                      >
                    </ScreenPanelHeading>
                    <ElScrollbar class="screen-list-scrollbar">
                      <div class="risk-list">
                        <div v-for="item in visibleRiskItems" :key="item.label" class="risk-item">
                          <i :class="`is-${item.tone}`" />
                          <div
                            ><strong>{{ item.label }}</strong
                            ><span>{{ item.description }}</span></div
                          >
                          <b>{{ item.value }}</b>
                        </div>
                      </div>
                    </ElScrollbar>
                  </article>
                </div>
              </section>
            </template>

            <template v-else>
              <section class="operations-layout">
                <article class="screen-panel dispatch-panel">
                  <ScreenPanelHeading title="运输任务队列" icon="ri:truck-line">
                    <template #aside
                      ><span class="panel-caption"
                        >实时 {{ data.transport.inTransitCount }} 单</span
                      ></template
                    >
                  </ScreenPanelHeading>
                  <ElScrollbar v-if="activeOrders.length" class="screen-list-scrollbar">
                    <div class="dispatch-list">
                      <div
                        v-for="(order, index) in activeOrders"
                        :key="order.orderNo"
                        class="dispatch-item"
                      >
                        <span class="dispatch-item__index">{{
                          String(index + 1).padStart(2, '0')
                        }}</span>
                        <div class="dispatch-item__route">
                          <strong>{{ order.originStation || '待补充起点' }}</strong>
                          <i><b /></i>
                          <strong>{{ order.destinationStation || '待补充终点' }}</strong>
                          <span
                            >{{ order.dispatchPlateNo || '待派车' }} ·
                            {{ order.dispatchDriverName || '待派司机' }}</span
                          >
                        </div>
                        <div class="dispatch-item__eta">
                          <strong>{{ formatEta(order.plannedArrivalTime) }}</strong>
                          <span>{{ order.orderNo }}</span>
                        </div>
                      </div>
                    </div>
                  </ElScrollbar>
                  <ArtEmptyState
                    v-else
                    class="screen-empty-state"
                    title="暂无在途任务"
                    description="新任务进入运输状态后将自动出现在队列中。"
                    size="compact"
                    :visual-size="72"
                  />
                </article>

                <article class="screen-panel network-panel">
                  <ScreenPanelHeading title="全域运营态势" icon="ri:radar-line">
                    <template #aside>
                      <span class="panel-caption is-live">
                        {{ state.error ? '上次同步' : '同步' }} {{ refreshText }}
                      </span>
                    </template>
                  </ScreenPanelHeading>
                  <EnterpriseCommandCore
                    mode="operations"
                    title="运输资源实时联动"
                    :score="businessScore"
                    :active-count="data.transport.inTransitCount"
                    :risk-count="totalRiskCount"
                    :nodes="domainHealth"
                    :telemetry="commandTelemetry"
                  />
                </article>

                <article class="screen-panel alert-panel">
                  <ScreenPanelHeading title="异常与资源" icon="ri:error-warning-line">
                    <template #aside>
                      <span class="risk-count">{{ totalRiskCount }} 项</span>
                    </template>
                  </ScreenPanelHeading>
                  <ElScrollbar class="screen-list-scrollbar">
                    <div class="risk-list risk-list--compact">
                      <div v-for="item in riskItems" :key="item.label" class="risk-item">
                        <i :class="`is-${item.tone}`" />
                        <div
                          ><strong>{{ item.label }}</strong
                          ><span>{{ item.description }}</span></div
                        >
                        <b>{{ item.value }}</b>
                      </div>
                    </div>
                  </ElScrollbar>
                  <div class="resource-strip">
                    <div
                      ><span>车辆在线</span
                      ><strong>{{ data.fleet.operating }}/{{ data.fleet.total }}</strong></div
                    >
                    <div
                      ><span>在岗员工</span><strong>{{ data.workforce.active }}</strong></div
                    >
                    <div
                      ><span>设备正常</span
                      ><strong
                        >{{ data.safety.equipmentNormal }}/{{ data.safety.equipmentTotal }}</strong
                      ></div
                    >
                  </div>
                </article>

                <article class="screen-panel flow-panel">
                  <ScreenPanelHeading title="订单阶段分布" icon="ri:bar-chart-grouped-line" />
                  <ScreenStageChart class="operations-stage-chart" :items="fulfillmentStages" />
                </article>
              </section>
            </template>
          </main>
        </div>
      </ElScrollbar>
    </ArtAsyncState>
  </div>
</template>

<script setup lang="ts">
  import './enterprise-big-screen.scss'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import dayjs from 'dayjs'
  import { clamp } from 'lodash-es'
  import { formatNumberValue } from '@/utils/ui/format'
  import { formatScreenDate } from './screen-format'
  import EnterpriseCommandCore from './enterprise-command-core.vue'
  import ScreenGaugeChart from './screen-gauge-chart.vue'
  import ScreenHorizontalBarChart from './screen-horizontal-bar-chart.vue'
  import ScreenPanelHeading from './screen-panel-heading.vue'
  import ScreenRefreshNotice from './screen-refresh-notice.vue'
  import ScreenStageChart from './screen-stage-chart.vue'
  import {
    fetchEnterpriseDashboardData,
    type EnterpriseDashboardData
  } from '@/api/enterprise-dashboard'

  type ScreenMode = 'business' | 'operations'
  type MetricTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

  interface Props {
    mode: ScreenMode
  }

  interface PrimaryMetric {
    label: string
    value: string
    unit?: string
    hint: string
    icon: string
    tone: MetricTone
  }

  interface ScreenState {
    loading: boolean
    loaded: boolean
    error: Error | null
    requestId: number
  }

  const props = defineProps<Props>()
  const router = useRouter()
  const screenRef = ref<HTMLElement | null>(null)
  const currentTime = ref(new Date().toISOString())
  const state = reactive<ScreenState>({ loading: false, loaded: false, error: null, requestId: 0 })
  const {
    isFullscreen,
    isSupported: isFullscreenSupported,
    toggle: toggleFullscreen
  } = useFullscreen(screenRef, { autoExit: true })

  const createEmptyData = (): EnterpriseDashboardData => ({
    generatedAt: new Date().toISOString(),
    transport: {
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
    },
    fleet: { total: 0, operating: 0, pendingAudit: 0, dueDocuments: 0 },
    finance: {
      voucherCount: 0,
      postedAmount: 0,
      cashInflow: 0,
      cashOutflow: 0,
      receivable: 0,
      payable: 0,
      approvedWaybillCost: 0
    },
    workforce: { total: 0, active: 0, probation: 0, expiringContracts: 0 },
    safety: {
      openHazards: 0,
      overdueHazards: 0,
      overdueInspections: 0,
      recentAccidents: 0,
      equipmentTotal: 0,
      equipmentNormal: 0,
      criticalEquipment: 0
    }
  })
  const data = reactive<EnterpriseDashboardData>(createEmptyData())

  const mode = computed(() => props.mode)
  const modeTitle = computed(() =>
    mode.value === 'business' ? '企业经营驾驶舱' : '全域运营态势大屏'
  )
  const fullscreenButtonLabel = computed(() => {
    if (!isFullscreenSupported.value) return '当前浏览器不支持全屏'
    return isFullscreen.value ? '退出全屏' : '进入全屏'
  })
  const timeText = computed(() => dayjs(currentTime.value).format('HH:mm:ss'))
  const dateText = computed(() => formatScreenDate(currentTime.value))
  const refreshText = computed(() => dayjs(data.generatedAt).format('HH:mm:ss'))
  const screenNavItems = [
    {
      mode: 'business',
      label: '经营驾驶舱',
      path: '/dashboard/business-cockpit',
      icon: 'ri:bar-chart-box-line'
    },
    {
      mode: 'operations',
      label: '运营态势',
      path: '/dashboard/operations-command',
      icon: 'ri:radar-line'
    }
  ] as const
  const transportRevenue = computed(() =>
    data.transport.trend.reduce((sum, item) => sum + item.freightAmount, 0)
  )
  const monthOrderCount = computed(() =>
    data.transport.trend.reduce((sum, item) => sum + item.orderCount, 0)
  )
  const completedCount = computed(() => data.transport.statusCounts.completed ?? 0)
  const statusTotal = computed(() =>
    Object.values(data.transport.statusCounts).reduce((sum, value) => sum + value, 0)
  )
  const completionRate = computed(() =>
    statusTotal.value ? Math.round((completedCount.value / statusTotal.value) * 100) : 100
  )
  const fleetRate = computed(() => percentage(data.fleet.operating, data.fleet.total))
  const equipmentRate = computed(() =>
    percentage(data.safety.equipmentNormal, data.safety.equipmentTotal)
  )
  const workforceRate = computed(() => percentage(data.workforce.active, data.workforce.total))
  const financeHealthScore = computed(() =>
    data.finance.cashOutflow
      ? clamp(Math.round((data.finance.cashInflow / data.finance.cashOutflow) * 100), 0, 100)
      : 100
  )
  const safetyScore = computed(() =>
    Math.max(
      0,
      100 -
        data.safety.overdueHazards * 8 -
        data.safety.overdueInspections * 3 -
        data.safety.recentAccidents * 12
    )
  )
  const businessScore = computed(() =>
    Math.round(
      (completionRate.value +
        fleetRate.value +
        workforceRate.value +
        safetyScore.value +
        equipmentRate.value +
        financeHealthScore.value) /
        6
    )
  )
  const grossMarginRate = computed(() => {
    if (!transportRevenue.value) return 0
    return clamp(
      Math.round(
        ((transportRevenue.value - data.finance.approvedWaybillCost) / transportRevenue.value) * 100
      ),
      0,
      100
    )
  })
  const decisionHeadline = computed(() => {
    if (totalRiskCount.value > 10) return '风险事项需要优先收敛'
    if (data.transport.pendingDispatchCount > data.transport.inTransitCount)
      return '调度积压值得关注'
    return '整体运营保持稳定'
  })
  const decisionDescription = computed(() => {
    if (data.safety.overdueInspections)
      return `当前有 ${data.safety.overdueInspections} 项巡检已逾期，建议优先安排责任人闭环。`
    if (data.fleet.dueDocuments)
      return `未来 30 天有 ${data.fleet.dueDocuments} 项车辆证照到期，请提前安排续办。`
    return '运输、车辆、人员和安全关键指标处于可控区间。'
  })

  const primaryMetrics = computed<PrimaryMetric[]>(() =>
    mode.value === 'business'
      ? [
          {
            label: '今日开单',
            value: String(data.transport.todayOrderCount),
            unit: '单',
            hint: '今日新增运输订单',
            icon: 'ri:file-list-3-line',
            tone: 'primary'
          },
          {
            label: '今日运费',
            value: formatCompactNumber(data.transport.todayFreightAmount),
            unit: '元',
            hint: '开单收入实时口径',
            icon: 'ri:money-cny-circle-line',
            tone: 'info'
          },
          {
            label: '履约完成率',
            value: String(completionRate.value),
            unit: '%',
            hint: '全量订单完成占比',
            icon: 'ri:checkbox-circle-line',
            tone: 'success'
          },
          {
            label: '风险待处理',
            value: String(totalRiskCount.value),
            unit: '项',
            hint: '跨域异常聚合',
            icon: 'ri:alarm-warning-line',
            tone: totalRiskCount.value ? 'warning' : 'success'
          }
        ]
      : [
          {
            label: '当前在途',
            value: String(data.transport.inTransitCount),
            unit: '单',
            hint: '正在执行运输任务',
            icon: 'ri:route-line',
            tone: 'primary'
          },
          {
            label: '待调度',
            value: String(data.transport.pendingDispatchCount),
            unit: '单',
            hint: '等待车辆与司机',
            icon: 'ri:time-line',
            tone: 'warning'
          },
          {
            label: '今日完成',
            value: String(data.transport.completedTodayCount),
            unit: '单',
            hint: '今日签收结案',
            icon: 'ri:checkbox-circle-line',
            tone: 'success'
          },
          {
            label: '运营车辆',
            value: String(data.fleet.operating),
            unit: '台',
            hint: `车队总量 ${data.fleet.total} 台`,
            icon: 'ri:truck-line',
            tone: 'success'
          }
        ]
  )

  const decisionSignals = computed(() => [
    {
      label: '待调度订单',
      value: `${data.transport.pendingDispatchCount} 单`,
      tone: data.transport.pendingDispatchCount ? 'warning' : 'success'
    },
    {
      label: '逾期隐患',
      value: `${data.safety.overdueHazards} 项`,
      tone: data.safety.overdueHazards ? 'danger' : 'success'
    },
    {
      label: '人员在岗率',
      value: `${workforceRate.value}%`,
      tone: workforceRate.value >= 90 ? 'success' : 'warning'
    }
  ])
  const domainHealth = computed(() => [
    {
      label: '运输履约',
      score: completionRate.value,
      caption: `${data.transport.inTransitCount} 单在途 · ${data.transport.pendingDispatchCount} 单待调度`,
      icon: 'ri:route-line',
      tone: scoreTone(completionRate.value)
    },
    {
      label: '车辆资产',
      score: fleetRate.value,
      caption: `${data.fleet.operating}/${data.fleet.total} 台运营中`,
      icon: 'ri:truck-line',
      tone: scoreTone(fleetRate.value)
    },
    {
      label: '组织人力',
      score: workforceRate.value,
      caption: `${data.workforce.active} 人在岗 · ${data.workforce.probation} 人试用期`,
      icon: 'ri:team-line',
      tone: scoreTone(workforceRate.value)
    },
    {
      label: '安全生产',
      score: safetyScore.value,
      caption: `${data.safety.openHazards} 项隐患 · ${data.safety.overdueInspections} 项逾期巡检`,
      icon: 'ri:shield-check-line',
      tone: scoreTone(safetyScore.value)
    },
    {
      label: '设备运行',
      score: equipmentRate.value,
      caption: `${data.safety.equipmentNormal}/${data.safety.equipmentTotal} 台设备正常`,
      icon: 'ri:settings-3-line',
      tone: scoreTone(equipmentRate.value)
    },
    {
      label: '资金运行',
      score: financeHealthScore.value,
      caption: `流入 ${formatCompactNumber(data.finance.cashInflow)} 元 · 流出 ${formatCompactNumber(data.finance.cashOutflow)} 元`,
      icon: 'ri:funds-box-line',
      tone: scoreTone(financeHealthScore.value)
    }
  ])
  const riskItems = computed(() => [
    {
      label: '待调度订单',
      value: data.transport.pendingDispatchCount,
      description: '等待车辆与司机资源匹配',
      tone: 'warning'
    },
    {
      label: '车辆证照临期',
      value: data.fleet.dueDocuments,
      description: '未来 30 天保险或年检到期',
      tone: 'warning'
    },
    {
      label: '逾期安全巡检',
      value: data.safety.overdueInspections,
      description: '超过计划完成时间仍未闭环',
      tone: 'danger'
    },
    {
      label: '未闭环隐患',
      value: data.safety.openHazards,
      description: '处于审批、整改或验收阶段',
      tone: 'danger'
    },
    {
      label: '员工合同临期',
      value: data.workforce.expiringContracts,
      description: '未来 30 天合同到期',
      tone: 'info'
    }
  ])
  const totalRiskCount = computed(() => riskItems.value.reduce((sum, item) => sum + item.value, 0))
  const visibleRiskItems = computed(() => riskItems.value.slice(0, 4))
  const domainHealthChartItems = computed(() =>
    domainHealth.value.map((item) => ({
      label: item.label,
      value: item.score,
      caption: item.caption,
      tone: item.tone
    }))
  )
  const financeComparisonItems = computed(() => [
    { label: '运输收入', value: transportRevenue.value, caption: '运单收入' },
    { label: '已审成本', value: data.finance.approvedWaybillCost, caption: '审核口径' },
    { label: '现金流入', value: data.finance.cashInflow, caption: '实收资金' },
    { label: '现金流出', value: data.finance.cashOutflow, caption: '实付资金' }
  ])
  const commandTelemetry = computed(() =>
    mode.value === 'business'
      ? [
          { label: '本月订单', value: monthOrderCount.value, unit: '单', tone: 'primary' as const },
          {
            label: '本月运输收入',
            value: `${formatCompactNumber(transportRevenue.value)} 元`,
            tone: 'success' as const
          },
          {
            label: '当前在途',
            value: data.transport.inTransitCount,
            unit: '单',
            tone: 'info' as const
          },
          {
            label: '风险事项',
            value: totalRiskCount.value,
            unit: '项',
            tone: totalRiskCount.value ? ('danger' as const) : ('success' as const)
          }
        ]
      : [
          {
            label: '待调度',
            value: data.transport.pendingDispatchCount,
            unit: '单',
            tone: data.transport.pendingDispatchCount ? ('warning' as const) : ('success' as const)
          },
          {
            label: '今日完成',
            value: data.transport.completedTodayCount,
            unit: '单',
            tone: 'success' as const
          },
          {
            label: '运营车辆',
            value: data.fleet.operating,
            unit: '台',
            tone: 'primary' as const
          },
          {
            label: '设备在线率',
            value: equipmentRate.value,
            unit: '%',
            tone: scoreTone(equipmentRate.value)
          }
        ]
  )

  const fulfillmentStages = computed(() => {
    const definitions = [
      { key: 'pending_load', label: '待配载', caption: '资源匹配' },
      { key: 'pending_order', label: '待发车', caption: '装车准备' },
      { key: 'transporting', label: '运输中', caption: '在途执行' },
      { key: 'signed', label: '待结案', caption: '回单核验' },
      { key: 'completed', label: '已完成', caption: '履约闭环' }
    ]
    return definitions.map((item) => {
      const value = data.transport.statusCounts[item.key] ?? 0
      return { ...item, value }
    })
  })
  const activeOrders = computed(() => data.transport.transitOrders.slice(0, 6))
  const clockInterval = useIntervalFn(() => {
    currentTime.value = new Date().toISOString()
  }, 1000)
  const dataRefreshInterval = useIntervalFn(() => {
    void loadData(false)
  }, 60000)
  let wasDeactivated = false

  onActivated(() => {
    clockInterval.resume()
    dataRefreshInterval.resume()
    if (wasDeactivated) void loadData(false)
    wasDeactivated = false
  })

  onDeactivated(() => {
    wasDeactivated = true
    clockInterval.pause()
    dataRefreshInterval.pause()
    state.requestId += 1
    state.loading = false
  })

  onMounted(() => {
    void loadData()
  })

  async function loadData(showLoading = true): Promise<void> {
    const requestId = ++state.requestId
    if (showLoading) state.loading = true
    state.error = null
    try {
      const result = await fetchEnterpriseDashboardData()
      if (requestId !== state.requestId) return
      Object.assign(data, result)
      state.loaded = true
    } catch (error) {
      if (requestId !== state.requestId) return
      state.error = error instanceof Error ? error : new Error('企业经营大屏加载失败')
    } finally {
      if (requestId === state.requestId) state.loading = false
    }
  }

  function percentage(value: number, total: number): number {
    return total ? clamp(Math.round((value / total) * 100), 0, 100) : 100
  }

  function scoreTone(score: number): MetricTone {
    if (score >= 90) return 'success'
    if (score >= 75) return 'primary'
    if (score >= 60) return 'warning'
    return 'danger'
  }

  function formatCompactNumber(value: number): string {
    return formatNumberValue(value, 'zh-CN', {
      notation: value >= 10000 ? 'compact' : 'standard',
      maximumFractionDigits: 1
    })
  }

  function formatEta(value?: string | null): string {
    if (!value) return '待确认 ETA'
    const target = dayjs(value)
    if (!target.isValid()) return '待确认 ETA'
    const diff = target.diff(dayjs(), 'minute')
    if (diff < 0) return `已超时 ${Math.abs(diff)} 分钟`
    if (diff < 60) return `${diff} 分钟后到达`
    return `${Math.floor(diff / 60)} 小时 ${diff % 60} 分后到达`
  }

  async function toggleScreenFullscreen(): Promise<void> {
    if (!isFullscreenSupported.value) {
      ElMessage.warning('当前浏览器不支持全屏显示')
      return
    }

    try {
      await toggleFullscreen()
    } catch {
      ElMessage.error('全屏切换失败，请检查浏览器权限后重试')
    }
  }

  function exitScreen(): void {
    void router.push('/dashboard/console')
  }
</script>
