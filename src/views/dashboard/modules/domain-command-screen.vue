<template>
  <div
    ref="screenRef"
    class="domain-command-screen"
    :class="[
      `is-${kind}`,
      `is-layout-${definition.layout}`,
      {
        'has-no-alerts': !showAlertPanel,
        'has-no-trend': !showTrendPanel,
        'has-no-stage': !showStagePanel
      }
    ]"
    :style="{ '--theme-color': definition.accent }"
  >
    <ArtAsyncState
      class="domain-command-screen__state"
      :loading="state.loading"
      :loading-mode="state.loaded ? 'mask' : 'skeleton'"
      :error="state.loaded ? null : state.error"
      :min-height="0"
      full-height
      @retry="loadData"
    >
      <ElScrollbar class="domain-command-screen__scrollbar">
        <div
          class="domain-command-screen__stage"
          :class="{ 'has-refresh-error': state.loaded && state.error }"
        >
          <header class="domain-header">
            <div class="domain-header__identity">
              <button
                type="button"
                class="domain-icon-button"
                aria-label="返回工作台"
                title="返回工作台"
                @click="exitScreen"
              >
                <ArtSvgIcon icon="ri:arrow-left-line" />
              </button>
              <div>
                <h1>{{ definition.title }}</h1>
              </div>
            </div>

            <nav class="domain-nav" aria-label="专业大屏场景">
              <ElScrollbar class="domain-nav__scrollbar">
                <div class="domain-nav__items">
                  <RouterLink to="/dashboard/business-cockpit">
                    <ArtSvgIcon icon="ri:dashboard-3-line" />
                    综合总览
                  </RouterLink>
                  <RouterLink
                    v-for="item in navItems"
                    :key="item.path"
                    :to="item.path"
                    :aria-current="item.kind === kind ? 'page' : undefined"
                    :class="{ 'is-active': item.kind === kind }"
                  >
                    <ArtSvgIcon :icon="item.icon" />
                    {{ item.shortTitle }}
                  </RouterLink>
                </div>
              </ElScrollbar>
            </nav>

            <div class="domain-header__status">
              <div>
                <time :datetime="currentTime">{{ timeText }}</time>
                <span>{{ dateText }}</span>
              </div>
              <span class="domain-live-status" :class="{ 'is-warning': state.error }">
                <i /> {{ state.error ? '数据更新失败' : `数据融合 ${refreshText}` }}
              </span>
              <button
                type="button"
                class="domain-icon-button"
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
                class="domain-icon-button"
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

          <main class="domain-content">
            <section
              class="domain-metric-rail"
              :style="{ gridTemplateColumns: `repeat(${visibleMetrics.length}, minmax(0, 1fr))` }"
              :aria-label="`${definition.shortTitle}核心指标`"
            >
              <article v-for="metric in visibleMetrics" :key="metric.label" class="domain-metric">
                <div class="domain-metric__icon" :class="`is-${metric.tone}`">
                  <ArtSvgIcon :icon="metric.icon" />
                </div>
                <div class="domain-metric__content">
                  <span>{{ metric.label }}</span>
                  <strong
                    >{{ metric.value }}<em v-if="metric.unit">{{ metric.unit }}</em></strong
                  >
                  <small>{{ metric.hint }}</small>
                </div>
                <i class="domain-metric__signal" :class="`is-${metric.tone}`" />
              </article>
            </section>

            <section class="domain-layout">
              <div class="domain-column domain-column--left">
                <article v-if="showScorePanel" class="domain-panel domain-score-panel">
                  <ScreenPanelHeading title="态势研判" :icon="definition.icon">
                    <template #aside>
                      <span class="domain-status-pill" :class="`is-${scoreTone}`">
                        <i /> {{ scoreStatus }}
                      </span>
                    </template>
                  </ScreenPanelHeading>
                  <div class="domain-score">
                    <ScreenGaugeChart
                      class="domain-score__gauge"
                      :value="data.score"
                      :label="definition.scoreLabel"
                    />
                    <div class="domain-score__copy">
                      <strong>{{ data.headline }}</strong>
                      <p>{{ data.description }}</p>
                    </div>
                  </div>
                  <div class="domain-score__signals" :class="{ 'is-compact': !showRiskSignal }">
                    <div>
                      <span>综合指数</span>
                      <strong>{{ data.score }}<em>/100</em></strong>
                    </div>
                    <div>
                      <span>{{ definition.activeLabel }}</span>
                      <strong
                        >{{ data.activeCount }}<em>{{ definition.activeUnit }}</em></strong
                      >
                    </div>
                    <div v-if="showRiskSignal">
                      <span>风险事项</span>
                      <strong class="is-risk">{{ data.riskCount }}<em>项</em></strong>
                    </div>
                  </div>
                </article>

                <article class="domain-panel domain-distribution-panel">
                  <ScreenPanelHeading
                    :title="definition.distributionTitle"
                    icon="ri:bar-chart-horizontal-line"
                  />
                  <div v-if="isTreasury && !hasDistributionData" class="domain-zero-state">
                    <ArtSvgIcon icon="ri:check-double-line" />
                    <strong>暂无应收账龄压力</strong>
                    <span>当前各账龄区间金额均为 0 元</span>
                  </div>
                  <DomainInsightChart
                    v-else
                    class="domain-distribution-chart"
                    :items="distributionItems"
                    :variant="definition.distributionChart"
                    :title="definition.distributionTitle"
                    unit=""
                  />
                </article>
              </div>

              <div class="domain-column domain-column--center">
                <article class="domain-panel domain-core-panel">
                  <ScreenPanelHeading
                    :title="`${definition.shortTitle}数字孪生`"
                    :icon="definition.icon"
                  >
                    <template #aside>
                      <span class="domain-status-pill is-live"><i /> 实时联动</span>
                    </template>
                  </ScreenPanelHeading>
                  <EnterpriseCommandCore
                    class="domain-command-core"
                    :style="{ '--domain-telemetry-count': coreTelemetry.length }"
                    mode="business"
                    :title="data.headline"
                    :score="data.score"
                    :active-count="data.activeCount"
                    :risk-count="data.riskCount"
                    :nodes="data.nodes"
                    :telemetry="coreTelemetry"
                    :score-label="definition.scoreLabel"
                    :active-label="definition.activeLabel"
                    :active-unit="definition.activeUnit"
                    :scene-variant="definition.sceneVariant"
                    core-eyebrow="领域运行指数"
                    online-label="多域数据联动"
                  />
                </article>

                <article v-if="showTrendPanel" class="domain-panel domain-trend-panel">
                  <ScreenPanelHeading :title="definition.trendTitle" icon="ri:pulse-line">
                    <template #aside>
                      <span class="domain-panel-caption">主指标 / 风险</span>
                    </template>
                  </ScreenPanelHeading>
                  <ScreenTrendChart
                    class="domain-trend-chart"
                    :points="data.trend"
                    :variant="definition.trendChart"
                    :primary-label="definition.trendPrimaryLabel"
                    :secondary-label="definition.trendSecondaryLabel"
                    :is-empty="!data.trend.length"
                  />
                </article>
              </div>

              <div class="domain-column domain-column--right">
                <article
                  v-if="showAlertPanel"
                  class="domain-panel domain-alert-panel"
                  :class="{ 'is-sparse': data.alerts.length <= 2 }"
                >
                  <ScreenPanelHeading :title="definition.alertTitle" icon="ri:alarm-warning-line">
                    <template #aside>
                      <span class="domain-alert-count">{{ data.riskCount }}</span>
                    </template>
                  </ScreenPanelHeading>
                  <ElScrollbar v-if="data.alerts.length" class="domain-alert-scrollbar">
                    <div class="domain-alert-list">
                      <div v-for="alert in data.alerts" :key="alert.id" class="domain-alert">
                        <i :class="`is-${alert.tone}`" />
                        <div>
                          <strong>{{ alert.title }}</strong>
                          <span>{{ alert.detail }}</span>
                        </div>
                        <b>{{ alert.value }}</b>
                      </div>
                    </div>
                  </ElScrollbar>
                  <ArtEmptyState
                    v-else
                    class="screen-empty-state"
                    title="风险明细暂未同步"
                    description="请稍后刷新查看处置明细。"
                    size="compact"
                    :visual-size="72"
                  />
                </article>

                <article v-if="showStagePanel" class="domain-panel domain-stage-panel">
                  <ScreenPanelHeading :title="definition.stageTitle" icon="ri:node-tree" />
                  <div v-if="isTreasury && !hasStageData" class="domain-zero-state">
                    <ArtSvgIcon icon="ri:funds-line" />
                    <strong>未来 30 天暂无资金缺口</strong>
                    <span>7 / 15 / 30 天预测余额均为 0 元</span>
                  </div>
                  <DomainInsightChart
                    v-else
                    class="domain-stage-chart"
                    :items="data.stages"
                    :variant="definition.stageChart"
                    :title="definition.stageTitle"
                    unit=""
                    :is-empty="!data.stages.length"
                  />
                </article>
              </div>
            </section>
          </main>
        </div>
      </ElScrollbar>
    </ArtAsyncState>
  </div>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import {
    createEmptyDomainCommandData,
    domainCommandDefinitions,
    fetchDomainCommandData,
    type DomainCommandDefinition,
    type DomainCommandChartItem,
    type DomainCommandData,
    type DomainCommandKind,
    type DomainCommandTone
  } from '@/api/domain-command'
  import DomainInsightChart from './domain-insight-chart.vue'
  import EnterpriseCommandCore from './enterprise-command-core.vue'
  import ScreenGaugeChart from './screen-gauge-chart.vue'
  import ScreenPanelHeading from './screen-panel-heading.vue'
  import ScreenRefreshNotice from './screen-refresh-notice.vue'
  import { formatScreenDate } from './screen-format'
  import ScreenTrendChart from './screen-trend-chart.vue'

  interface Props {
    kind: DomainCommandKind
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
  const data = reactive<DomainCommandData>(createEmptyDomainCommandData())
  const definition = computed(() => domainCommandDefinitions[props.kind])
  const navItems = Object.values(domainCommandDefinitions)
  const {
    isFullscreen,
    isSupported: isFullscreenSupported,
    toggle: toggleFullscreen
  } = useFullscreen(screenRef, { autoExit: true })

  const timeText = computed(() => dayjs(currentTime.value).format('HH:mm:ss'))
  const dateText = computed(() => formatScreenDate(currentTime.value))
  const refreshText = computed(() => dayjs(data.generatedAt).format('HH:mm:ss'))
  const fullscreenButtonLabel = computed(() => {
    if (!isFullscreenSupported.value) return '当前浏览器不支持全屏'
    return isFullscreen.value ? '退出全屏' : '进入全屏'
  })
  const scoreTone = computed<DomainCommandTone>(() => {
    if (data.score >= 90) return 'success'
    if (data.score >= 75) return 'primary'
    if (data.score >= 60) return 'warning'
    return 'danger'
  })
  const scoreStatus = computed(() => {
    if (data.score >= 90) return '运行稳健'
    if (data.score >= 75) return '总体可控'
    if (data.score >= 60) return '需要关注'
    return '优先处置'
  })
  const visibleMetrics = computed(() => {
    const limitByLayout: Record<DomainCommandDefinition['layout'], number> = {
      sentinel: 4,
      field: 5,
      treasury: 5,
      flow: 4,
      fleet: 4,
      topology: 5,
      people: 4
    }
    return data.metrics.slice(0, limitByLayout[definition.value.layout])
  })
  const showScorePanel = computed(
    () =>
      !['field', 'flow', 'fleet', 'people'].includes(definition.value.layout) &&
      (definition.value.layout !== 'treasury' || showTrendPanel.value)
  )
  const showAlertPanel = computed(() => data.riskCount > 0 || data.alerts.length > 0)
  const isTreasury = computed(() => definition.value.layout === 'treasury')
  const hasDistributionData = computed(() =>
    distributionItems.value.some((item) => Math.abs(item.value) > 0)
  )
  const hasStageData = computed(() => data.stages.some((item) => Math.abs(item.value) > 0))
  const showTrendPanel = computed(
    () => !isTreasury.value || data.trend.some((point) => point.primary || point.secondary)
  )
  const showStagePanel = computed(() => {
    if (definition.value.layout !== 'fleet') return true
    return (
      data.distribution.length !== data.stages.length ||
      data.distribution.some((item, index) => item.value !== data.stages[index]?.value)
    )
  })
  const showRiskSignal = computed(
    () => definition.value.activeLabel !== '风险事项' || data.activeCount !== data.riskCount
  )
  const distributionItems = computed(() => {
    if (definition.value.layout === 'field') {
      const sourceByLabel = new Map(data.distribution.map((item) => [item.label, item]))
      const baseline: DomainCommandChartItem[] = [
        { label: '重大风险', value: 0, tone: 'danger' },
        { label: '较大风险', value: 0, tone: 'warning' },
        { label: '一般风险', value: 0, tone: 'info' },
        { label: '低风险', value: 0, tone: 'success' }
      ]
      const knownLabels = new Set(baseline.map((item) => item.label))

      return [
        ...baseline.map((item) => ({ ...item, ...sourceByLabel.get(item.label) })),
        ...data.distribution.filter((item) => !knownLabels.has(item.label))
      ]
    }

    if (data.distribution.length) return data.distribution

    const labelsByLayout: Record<DomainCommandDefinition['layout'], string[]> = {
      sentinel: ['访问控制', '输入安全', '输出合规', '模型稳定'],
      field: ['重大风险', '较大风险', '一般风险', '低风险'],
      treasury: ['当前应收', '30 天内', '31–60 天', '61–90 天', '90 天以上'],
      flow: ['运输费用', '车辆档案', '运输合同', '其他流程'],
      fleet: ['严重风险', '高风险', '中风险', '低风险'],
      topology: ['完整性', '唯一性', '一致性', '时效性', '分发状态'],
      people: ['核心组织', '保障组织', '协作组织']
    }

    return labelsByLayout[definition.value.layout].map((label) => ({ label, value: 0 }))
  })
  const coreTelemetry = computed(() => [
    { label: definition.value.scoreLabel, value: data.score, unit: '/100', tone: scoreTone.value },
    {
      label: definition.value.activeLabel,
      value: data.activeCount,
      unit: definition.value.activeUnit,
      tone: 'info' as const
    },
    ...(showRiskSignal.value
      ? [
          {
            label: '风险事项',
            value: data.riskCount,
            unit: '项',
            tone: data.riskCount ? ('danger' as const) : ('success' as const)
          }
        ]
      : []),
    { label: '数据节点', value: data.nodes.length, unit: '域', tone: 'primary' as const }
  ])
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

  watch(
    () => props.kind,
    () => void loadData(),
    { immediate: true }
  )

  async function loadData(showLoading = true): Promise<void> {
    const requestId = ++state.requestId
    if (showLoading) state.loading = true
    state.error = null
    try {
      const result = await fetchDomainCommandData(props.kind)
      if (requestId !== state.requestId) return
      Object.assign(data, result)
      state.loaded = true
    } catch (error) {
      if (requestId !== state.requestId) return
      state.error = error instanceof Error ? error : new Error(`${definition.value.title}加载失败`)
    } finally {
      if (requestId === state.requestId) state.loading = false
    }
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

<style scoped lang="scss" src="./domain-command-screen.scss"></style>
