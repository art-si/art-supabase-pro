<template>
  <ArtPageShell
    class="ai-operations business-workspace-page"
    :loading="overview.loading"
    :loading-mode="loadingMode"
    :error="pageError"
    min-height="560px"
    @retry="loadOverview"
  >
    <BusinessWorkspaceHeader
      eyebrow="AI OPERATIONS"
      title="AI 运行中心"
      description="持续跟踪调用质量、响应速度、Token 消耗与失败原因，让每一次 AI 执行都可观测、可追溯。"
      icon="ri:brain-2-line"
      :metrics="workspaceMetrics"
      refreshable
      refresh-label="刷新运行数据"
      :refresh-loading="overview.loading"
      @refresh="refreshAll"
    >
      <template #actions>
        <ElRadioGroup v-model="overview.days" size="small" @change="loadOverview">
          <ElRadioButton
            v-for="option in analysisWindowOptions"
            :key="option.value"
            :value="option.value"
            >{{ option.label }}</ElRadioButton
          >
        </ElRadioGroup>
      </template>
    </BusinessWorkspaceHeader>

    <section class="ai-operations__workspace-nav art-card-xs">
      <div>
        <span>OBSERVABILITY WORKSPACE</span>
        <strong>{{ activeSectionMeta.title }}</strong>
        <small>{{ activeSectionMeta.description }}</small>
      </div>
      <ElScrollbar class="ai-operations__workspace-nav-scrollbar">
        <ElSegmented
          v-model="activeSection"
          :options="sectionOptions"
          aria-label="AI 运行中心工作区"
        />
      </ElScrollbar>
    </section>

    <div
      v-if="overview.loaded && overview.error"
      role="alert"
      class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--art-control-radius)] bg-[var(--el-color-warning-light-9)] px-3 py-2 text-sm text-[var(--el-color-warning-dark-2)]"
    >
      <span>
        近 {{ overview.days }} 天的数据暂未更新，当前显示近 {{ overview.data.days }} 天的上次结果。
      </span>
      <ElButton link type="warning" @click="loadOverview">重试加载</ElButton>
    </div>

    <ArtSectionCard
      v-if="activeSection === 'forms'"
      class="ai-operations__quality"
      preserve-content-structure
    >
      <template #header>
        <header class="ai-operations__card-header ai-operations__quality-header">
          <div>
            <span>HUMAN-IN-THE-LOOP</span>
            <h2>AI 填单质量闭环</h2>
          </div>
          <ElTag type="primary" effect="plain">
            平均置信度 {{ overview.data.quality.averageConfidence.toFixed(1) }}%
          </ElTag>
        </header>
      </template>

      <div class="ai-operations__quality-metrics">
        <article v-for="metric in qualityMetricCards" :key="metric.key">
          <div :class="['ai-operations__metric-icon', `is-${metric.tone}`]">
            <ArtSvgIcon :icon="metric.icon" />
          </div>
          <div>
            <span>{{ metric.label }}</span>
            <strong>{{ metric.value }}</strong>
            <small>{{ metric.hint }}</small>
          </div>
        </article>
      </div>

      <div class="ai-operations__quality-content">
        <article class="ai-operations__quality-trend">
          <header>
            <div>
              <span>质量趋势</span>
              <strong>草稿生成与保存采用</strong>
            </div>
            <ElSegmented
              v-model="trendWindow"
              :options="trendWindowOptions"
              size="small"
              aria-label="质量趋势时间窗口"
            />
          </header>
          <ArtLineChart
            v-if="qualityTrendLabels.length"
            height="100%"
            :data="qualityTrendSeries"
            :x-axis-data="qualityTrendLabels"
            :colors="['#5b8ff9', '#36c98f']"
            :show-area-color="true"
            :show-axis-line="false"
            :show-legend="true"
            :loading="overview.loading"
            class="ai-operations__quality-trend-chart"
          />
          <ArtEmptyState
            v-else
            title="暂无质量趋势"
            description="完成 AI 填单并保存后，这里会展示草稿生成与保存采用趋势。"
            :visual-size="88"
            size="compact"
            class="ai-operations__quality-chart-empty"
          />
        </article>

        <article class="ai-operations__field-quality">
          <header>
            <div>
              <span>字段质量</span>
              <strong>优先改进字段</strong>
            </div>
            <small>按人工修正次数排序</small>
          </header>
          <ArtAsyncState
            :empty="!overview.data.quality.fieldQuality.length"
            empty-text="完成一次 AI 填单并保存后，将显示字段质量"
            empty-description="保存 AI 填单结果后，可在此查看字段准确率与纠错趋势。"
            :empty-image-size="58"
            :min-height="0"
            class="ai-operations__field-state"
          >
            <ElScrollbar always class="ai-operations__field-scrollbar">
              <div class="ai-operations__field-list">
                <div v-for="item in overview.data.quality.fieldQuality" :key="item.field">
                  <div>
                    <span>{{ getAiOrderFieldLabel(item.field) }}</span>
                    <small>修正 {{ item.corrected }} / {{ item.total }}</small>
                  </div>
                  <ElProgress
                    :percentage="item.acceptanceRate"
                    :stroke-width="7"
                    :show-text="false"
                    :color="getQualityProgressColor(item.acceptanceRate)"
                  />
                  <strong>{{ item.acceptanceRate.toFixed(1) }}%</strong>
                </div>
              </div>
            </ElScrollbar>
          </ArtAsyncState>
        </article>
      </div>
    </ArtSectionCard>

    <AiOcrQualityPanel
      v-if="activeSection === 'ocr'"
      ref="ocrQualityPanelRef"
      :days="overview.days"
    />

    <AiFeedbackQualityPanel
      v-if="activeSection === 'feedback'"
      :data="overview.data.feedbackQuality"
      @resolve="openFeedbackResolution"
      @view-run="openRunById"
    />

    <section v-if="activeSection === 'overview'" class="ai-operations__insights">
      <article class="ai-operations__trend art-card-xs">
        <header class="ai-operations__card-header">
          <div>
            <span>运行趋势</span>
            <h2>每日执行质量</h2>
          </div>
          <div class="ai-operations__trend-actions">
            <ElSegmented
              v-model="trendWindow"
              :options="trendWindowOptions"
              size="small"
              aria-label="运行趋势时间窗口"
            />
            <div class="ai-operations__legend">
              <span class="is-success">成功</span>
              <span class="is-danger">失败</span>
            </div>
          </div>
        </header>
        <div class="ai-operations__trend-chart">
          <ArtLineChart
            v-if="trendLabels.length"
            height="100%"
            :data="trendSeries"
            :x-axis-data="trendLabels"
            :colors="['#36c98f', '#f56c6c']"
            :show-area-color="true"
            :show-axis-line="false"
            :show-legend="false"
            :loading="overview.loading"
          />
          <ArtEmptyState
            v-else
            title="暂无运行趋势"
            description="当前周期产生 AI 运行记录后，这里会展示每日成功与失败趋势。"
            :visual-size="88"
            size="compact"
            class="ai-operations__chart-empty"
          />
        </div>
      </article>

      <ArtSectionCard
        class="ai-operations__features"
        :class="{ 'max-md:h-auto!': !featureInventory.length }"
        preserve-content-structure
        :empty="!featureInventory.length"
        empty-title="暂无可用 AI 能力"
        empty-description="请联系平台管理员启用所需能力。"
        :empty-visual-size="54"
        :min-height="250"
        body-class="flex-1"
      >
        <template #header>
          <header class="ai-operations__card-header">
            <div class="min-w-0">
              <span>能力清单</span>
              <h2>可用 AI 能力与调用情况</h2>
              <p class="ai-operations__card-hint">
                普通用户与管理员能力清单一致，调用数据按当前账号统计
              </p>
            </div>
            <strong class="shrink-0 whitespace-nowrap">{{ featureInventory.length }} 项可用</strong>
          </header>
        </template>
        <div class="ai-operations__feature-content">
          <div class="ai-operations__feature-chart">
            <ArtRingChart
              height="100%"
              :data="featureChartData"
              :colors="['#5b8ff9', '#5ad8a6', '#f6bd16', '#7262fd', '#78d3f8']"
              :center-text="`${featureInventory.length} 项可用`"
              :loading="overview.loading"
            />
          </div>
          <div class="ai-operations__feature-list-shell">
            <div class="ai-operations__feature-list-header">
              <span>能力</span>
              <strong>调用</strong>
              <small>平均耗时</small>
            </div>
            <ElScrollbar class="ai-operations__feature-scrollbar">
              <div class="ai-operations__feature-list">
                <div
                  v-for="item in featureInventory"
                  :key="item.feature"
                  :class="{ 'is-unused': item.total === 0 }"
                >
                  <span
                    ><i /><ArtDictDisplay
                      dict-code="aiRunFeature"
                      :value="item.feature"
                      display="text"
                  /></span>
                  <strong>{{ formatNumberValue(item.total) }} 次</strong>
                  <small>{{
                    item.total ? formatDurationMs(item.averageLatencyMs) : '未调用'
                  }}</small>
                </div>
              </div>
            </ElScrollbar>
          </div>
        </div>
      </ArtSectionCard>
    </section>

    <ArtSectionCard
      v-if="activeSection === 'overview'"
      class="ai-operations__health"
      preserve-content-structure
    >
      <template #header>
        <div class="ai-operations__health-title">
          <div class="ai-operations__health-icon"><ArtSvgIcon icon="ri:heart-pulse-line" /></div>
          <div>
            <span>质量信号</span>
            <h2>反馈与异常概览</h2>
          </div>
        </div>
      </template>
      <div class="ai-operations__feedback">
        <div
          ><ArtSvgIcon icon="ri:thumb-up-line" /><span>有帮助</span
          ><strong>{{ overview.data.positiveFeedback }}</strong></div
        >
        <div
          ><ArtSvgIcon icon="ri:thumb-down-line" /><span>需改进</span
          ><strong>{{ overview.data.negativeFeedback }}</strong></div
        >
      </div>
      <div class="ai-operations__errors">
        <template v-if="overview.data.topErrors.length">
          <div v-for="item in overview.data.topErrors" :key="item.code">
            <code>{{ item.code }}</code
            ><span>{{ item.count }} 次</span>
          </div>
        </template>
        <div v-else class="ai-operations__healthy">
          <ArtSvgIcon icon="ri:checkbox-circle-line" /> 当前周期内暂无失败异常
        </div>
      </div>
    </ArtSectionCard>

    <section v-if="activeSection === 'runs'" class="ai-operations__table">
      <ArtTableQuery
        ref="tableQueryRef"
        focusable
        v-model="searchQuery"
        :search-items="searchItems"
        :api-fn="fetchAiRunList"
        :columns-factory="columnsFactory"
        :search-bar-props="{ span: 5, labelWidth: 84 }"
        :table-props="{ rowKey: 'id', tableLayout: 'fixed' }"
      />
    </section>

    <AiRunDetailDrawer ref="detailDrawerRef" @diagnosed="refreshAfterDiagnosis" />
    <AiFeedbackResolutionDialog
      ref="feedbackResolutionDialogRef"
      @success="refreshAfterFeedbackResolution"
    />
  </ArtPageShell>
</template>

<script setup lang="tsx">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { formatDurationMs, formatNumberValue, createDateTimeFormatter } from '@/utils/ui/format'
  import { ElMessage } from 'element-plus'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'
  import type { ColumnOption } from '@/types'
  import type { LineDataItem, PieDataItem } from '@/types/component/chart'
  import { useUserStore } from '@/store/modules/user'
  import {
    createEmptyAiOperationsOverview,
    fetchAiOperationsOverview,
    fetchAiRunList,
    type AiFeedbackQueueItem,
    type AiOperationsFeatureStat,
    type AiOperationsOverview,
    type AiRunListItem,
    type AiRunSearchParams
  } from '@/api/ai-operations'
  import AiFeedbackQualityPanel from './modules/ai-feedback-quality-panel.vue'
  import AiOcrQualityPanel from './modules/ai-ocr-quality-panel.vue'
  import AiFeedbackResolutionDialog from './modules/ai-feedback-resolution-dialog.vue'
  import AiRunDetailDrawer from './modules/ai-run-detail-drawer.vue'

  defineOptions({ name: 'AiOperations' })
  const configuredAnalysisWindowOptions = useDictionaryOptions('sysAiOperationsWindowDays', Number)
  const analysisWindowOptions = computed(() =>
    configuredAnalysisWindowOptions.filter((option) => [7, 30, 90].includes(option.value))
  )

  interface DetailDrawerExpose {
    handleOpen: (data: { id: string }) => Promise<void>
  }

  interface FeedbackResolutionDialogExpose {
    handleOpen: (data: { item: AiFeedbackQueueItem }) => Promise<void>
  }

  type MetricTone = 'primary' | 'success' | 'warning'
  type OperationsSection = 'overview' | 'forms' | 'ocr' | 'feedback' | 'runs'
  type TrendWindow = 'recent' | 'period'

  interface MetricCard {
    key: string
    label: string
    value: string
    hint: string
    icon: string
    tone: MetricTone
  }

  interface SectionOption {
    label: string
    value: OperationsSection
    title: string
    description: string
  }

  const userStore = useUserStore()
  const route = useRoute()
  const router = useRouter()
  const { getDictMap } = storeToRefs(userStore)
  const tableQueryRef = ref<ArtTableQueryExpose>()
  const detailDrawerRef = ref<DetailDrawerExpose>()
  const feedbackResolutionDialogRef = ref<FeedbackResolutionDialogExpose>()
  const ocrQualityPanelRef = ref<{ loadData: () => Promise<void> }>()
  const sectionOptions: SectionOption[] = [
    {
      label: '运行总览',
      value: 'overview',
      title: '运行健康与能力分布',
      description: '聚合执行趋势、能力调用、用户反馈与异常信号。'
    },
    {
      label: '填单质量',
      value: 'forms',
      title: '人机协同填单质量',
      description: '跟踪草稿采用率、字段修正与人工审查闭环。'
    },
    {
      label: 'OCR 质量',
      value: 'ocr',
      title: '票据识别质量',
      description: '集中查看识别准确率、字段表现与失败样本。'
    },
    {
      label: '反馈闭环',
      value: 'feedback',
      title: '用户反馈与问题处置',
      description: '定位低质量结果并跟进反馈解决状态。'
    },
    {
      label: '运行明细',
      value: 'runs',
      title: 'AI 运行明细',
      description: '按功能、模型、状态和时间范围追踪每次执行。'
    }
  ]
  const sectionValues = new Set<OperationsSection>(sectionOptions.map((item) => item.value))
  const requestedSection = Array.isArray(route.query.section)
    ? route.query.section[0]
    : route.query.section
  const activeSection = ref<OperationsSection>(
    requestedSection && sectionValues.has(requestedSection as OperationsSection)
      ? (requestedSection as OperationsSection)
      : 'overview'
  )
  const trendWindowOptions = [
    { label: '近 14 天', value: 'recent' },
    { label: '全周期', value: 'period' }
  ]
  const requestedTrendWindow = Array.isArray(route.query.window)
    ? route.query.window[0]
    : route.query.window
  const trendWindow = ref<TrendWindow>(requestedTrendWindow === 'period' ? 'period' : 'recent')
  const activeSectionMeta = computed(
    () => sectionOptions.find((item) => item.value === activeSection.value) ?? sectionOptions[0]
  )
  const searchQuery = ref<Partial<AiRunSearchParams>>({
    feature: '',
    status: '',
    model: '',
    timeRange: undefined
  })

  watch([activeSection, trendWindow], ([section, window]) => {
    const query = { ...route.query }
    if (section === 'overview') delete query.section
    else query.section = section
    if (window === 'recent') delete query.window
    else query.window = window
    void router.replace({ query })
  })
  const overview = reactive<{
    days: number
    loading: boolean
    loaded: boolean
    error: Error | null
    data: AiOperationsOverview
  }>({
    days: 30,
    loading: false,
    loaded: false,
    error: null,
    data: createEmptyAiOperationsOverview(30)
  })

  const loadingMode = computed<'mask' | 'skeleton'>(() => (overview.loaded ? 'mask' : 'skeleton'))
  const pageError = computed(() => (overview.loaded ? null : overview.error))

  const metricCards = computed<MetricCard[]>(() => [
    {
      key: 'runs',
      label: '总运行次数',
      value: formatNumberValue(overview.data.totalRuns || 0),
      hint: `${overview.data.runningRuns} 个任务正在运行`,
      icon: 'ri:flashlight-line',
      tone: 'primary'
    },
    {
      key: 'success',
      label: '成功率',
      value: `${overview.data.successRate.toFixed(1)}%`,
      hint: `${overview.data.failedRuns} 次失败需要关注`,
      icon: 'ri:checkbox-circle-line',
      tone: 'success'
    },
    {
      key: 'latency',
      label: '平均响应',
      value: formatDurationMs(overview.data.averageLatencyMs),
      hint: `P95 ${formatDurationMs(overview.data.p95LatencyMs)}`,
      icon: 'ri:speed-up-line',
      tone: 'warning'
    },
    {
      key: 'tokens',
      label: 'Token 消耗',
      value: formatNumberValue(
        overview.data.inputTokens + overview.data.outputTokens || 0,
        'zh-CN',
        { notation: 'compact', maximumFractionDigits: 1 }
      ),
      hint: `输入 ${formatNumberValue(overview.data.inputTokens || 0, 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 })} · 输出 ${formatNumberValue(overview.data.outputTokens || 0, 'zh-CN', { notation: 'compact', maximumFractionDigits: 1 })}`,
      icon: 'ri:coins-line',
      tone: 'primary'
    }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() =>
    metricCards.value.map((metric) => ({
      label: metric.label,
      value: metric.value,
      description: metric.hint,
      icon: metric.icon,
      tone: metric.tone
    }))
  )

  const qualityMetricCards = computed<MetricCard[]>(() => [
    {
      key: 'artifacts',
      label: 'AI 草稿',
      value: formatNumberValue(overview.data.quality.totalArtifacts || 0),
      hint: `${overview.data.quality.pendingArtifacts} 条等待形成最终结果`,
      icon: 'ri:file-list-3-line',
      tone: 'primary'
    },
    {
      key: 'review',
      label: '审查完成率',
      value: `${overview.data.quality.reviewCompletionRate.toFixed(1)}%`,
      hint: `${overview.data.quality.reviewedArtifacts} 条已形成闭环`,
      icon: 'ri:user-follow-line',
      tone: 'primary'
    },
    {
      key: 'application',
      label: '保存采用率',
      value: `${overview.data.quality.applicationRate.toFixed(1)}%`,
      hint: `${overview.data.quality.appliedArtifacts} 条草稿进入正式订单`,
      icon: 'ri:save-3-line',
      tone: 'success'
    },
    {
      key: 'fields',
      label: '字段直接采用率',
      value: `${overview.data.quality.fieldAcceptanceRate.toFixed(1)}%`,
      hint: `${overview.data.quality.correctedFields} 个字段被人工修正`,
      icon: 'ri:edit-circle-line',
      tone: 'warning'
    }
  ])

  const visibleRunTrend = computed(() =>
    trendWindow.value === 'period' ? overview.data.dailyTrend : overview.data.dailyTrend.slice(-14)
  )
  const visibleQualityTrend = computed(() =>
    trendWindow.value === 'period'
      ? overview.data.quality.dailyTrend
      : overview.data.quality.dailyTrend.slice(-14)
  )
  const trendLabels = computed(() =>
    visibleRunTrend.value.map((item) => dayjs(item.date).format('MM-DD'))
  )
  const trendSeries = computed<LineDataItem[]>(() => [
    {
      name: '成功',
      data: visibleRunTrend.value.map((item) => item.succeeded),
      showAreaColor: true
    },
    {
      name: '失败',
      data: visibleRunTrend.value.map((item) => item.failed),
      showAreaColor: true
    }
  ])
  const qualityTrendLabels = computed(() =>
    visibleQualityTrend.value.map((item) => dayjs(item.date).format('MM-DD'))
  )
  const qualityTrendSeries = computed<LineDataItem[]>(() => [
    {
      name: 'AI 草稿',
      data: visibleQualityTrend.value.map((item) => item.total),
      showAreaColor: true
    },
    {
      name: '保存采用',
      data: visibleQualityTrend.value.map((item) => item.applied),
      showAreaColor: true
    }
  ])
  const featureChartData = computed<PieDataItem[]>(() => {
    const featureDictionary = getDictMap.value?.aiRunFeature ?? []
    return overview.data.featureBreakdown.map((item) => ({
      name:
        featureDictionary.find((dictItem) => dictItem.value === item.feature)?.label ??
        item.feature,
      value: item.total
    }))
  })
  const featureInventory = computed<AiOperationsFeatureStat[]>(() => {
    const featureDictionary = getDictMap.value?.aiRunFeature ?? []
    const statistics = new Map(
      overview.data.featureBreakdown.map((item) => [item.feature, item] as const)
    )
    const knownFeatures = new Set(featureDictionary.map((item) => item.value))
    const availableFeatures = featureDictionary.map(
      (item): AiOperationsFeatureStat =>
        statistics.get(item.value) ?? {
          feature: item.value,
          total: 0,
          succeeded: 0,
          failed: 0,
          averageLatencyMs: 0
        }
    )
    const uncataloguedStatistics = overview.data.featureBreakdown.filter(
      (item) => !knownFeatures.has(item.feature)
    )

    return [...availableFeatures, ...uncataloguedStatistics]
  })

  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '功能场景',
      key: 'feature',
      type: 'select',
      props: {
        placeholder: '请选择功能场景',
        options: getDictMap.value?.aiRunFeature ?? [],
        clearable: true
      }
    },
    {
      label: '运行状态',
      key: 'status',
      type: 'select',
      props: {
        placeholder: '请选择运行状态',
        options: getDictMap.value?.aiRunStatus ?? [],
        clearable: true
      }
    },
    {
      label: '模型',
      key: 'model',
      type: 'input',
      props: { placeholder: '请输入模型名称', clearable: true }
    },
    {
      label: '运行日期',
      key: 'timeRange',
      type: 'date',
      props: {
        type: 'daterange',
        rangeSeparator: '至',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期',
        valueFormat: 'YYYY-MM-DD'
      }
    }
  ])

  const columnsFactory = (): ColumnOption<AiRunListItem>[] => [
    { type: 'globalIndex', label: '序号', width: 64 },
    {
      prop: 'feature',
      label: '功能场景',
      minWidth: 122,
      dict: { code: 'aiRunFeature', display: 'text' }
    },
    {
      prop: 'status',
      label: '状态',
      width: 82,
      dict: { code: 'aiRunStatus', display: 'auto' }
    },
    {
      prop: 'model',
      label: '模型',
      minWidth: 134,
      showOverflowTooltip: true,
      link: { onClick: openDetail }
    },
    {
      prop: 'latencyMs',
      label: '耗时',
      width: 90,
      formatter: (row) => (
        <span class={getLatencyClass(row.latencyMs)}>{formatDurationMs(row.latencyMs)}</span>
      )
    },
    {
      prop: 'tokens',
      label: 'Token',
      width: 92,
      formatter: (row) => <span>{formatNumberValue(row.inputTokens + row.outputTokens || 0)}</span>
    },
    {
      prop: 'toolCalls',
      label: '工具',
      width: 62,
      formatter: (row) => <span>{row.toolCalls?.length ?? 0}</span>
    },
    {
      prop: 'feedback',
      label: '反馈',
      width: 70,
      formatter: (row) => renderFeedback(row)
    },
    {
      prop: 'startedAt',
      label: '开始时间',
      width: 168,
      formatter: (row) => <span>{formatDateTime(row.startedAt)}</span>
    },
    {
      prop: 'operation',
      label: '操作',
      width: 68,
      fixed: 'right',
      formatter: (row) => <ArtButtonTable type="view" onClick={() => openDetail(row)} />
    }
  ]

  let overviewRequestId = 0

  async function loadOverview(): Promise<boolean> {
    const requestId = ++overviewRequestId
    const days = overview.days
    overview.loading = true
    overview.error = null
    try {
      const data = await fetchAiOperationsOverview(days)
      if (requestId !== overviewRequestId) return false
      overview.data = data
      overview.loaded = true
      return true
    } catch (error) {
      if (requestId !== overviewRequestId) return false
      overview.error = new Error('AI 运行概览加载失败，请重试。', { cause: error })
      return false
    } finally {
      if (requestId === overviewRequestId) overview.loading = false
    }
  }

  async function refreshAll(): Promise<void> {
    if (overview.loading) return
    try {
      const [overviewUpdated] = await Promise.all([
        loadOverview(),
        tableQueryRef.value?.refreshData(),
        ocrQualityPanelRef.value?.loadData()
      ])
      if (overviewUpdated) ElMessage.success('AI 运行概览已更新')
    } catch {
      // 接口层已统一展示错误信息。
    }
  }

  function openDetail(row: AiRunListItem): void {
    void detailDrawerRef.value?.handleOpen({ id: row.id })
  }

  function openRunById(runId: string): void {
    void detailDrawerRef.value?.handleOpen({ id: runId })
  }

  function openFeedbackResolution(item: AiFeedbackQueueItem): void {
    void feedbackResolutionDialogRef.value?.handleOpen({ item })
  }

  function refreshAfterDiagnosis(): void {
    void Promise.allSettled([loadOverview(), tableQueryRef.value?.refreshData()])
  }

  function refreshAfterFeedbackResolution(): void {
    void Promise.allSettled([loadOverview(), tableQueryRef.value?.refreshData()])
  }

  function renderFeedback(row: AiRunListItem) {
    const rating = row.feedback?.[0]?.rating
    if (rating === 1) return <ArtSvgIcon icon="ri:thumb-up-fill" class="text-success" />
    if (rating === -1) return <ArtSvgIcon icon="ri:thumb-down-fill" class="text-error" />
    return <span class="text-g-500">--</span>
  }

  function getLatencyClass(value?: number | null): string {
    if (value == null) return 'text-g-500'
    if (value > 15_000) return 'text-error'
    if (value > 5_000) return 'text-warning'
    return ''
  }

  function getAiOrderFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      originStationName: '发货站',
      destinationStationName: '到货站',
      transferStationName: '中转站',
      deliveryMethod: '配送方式',
      shippingCustomerName: '发货客户',
      shippingContactName: '发货联系人',
      shippingContactPhone: '发货电话',
      shippingAddressDetail: '发货地址',
      receivingCustomerName: '收货客户',
      receivingContactName: '收货联系人',
      receivingContactPhone: '收货电话',
      receivingAddressDetail: '收货地址',
      cargoItems: '货物明细',
      transportFee: '运费',
      deliveryFee: '送货费',
      unloadingFee: '卸货费',
      collectPaymentFee: '代收货款手续费',
      transferFee: '中转费',
      declaredValue: '声明价值',
      insuranceFee: '保险费',
      packageFee: '包装费',
      otherFee: '其他费用',
      paymentMethod: '付款方式',
      cashAmount: '现付金额',
      collectAmount: '到付金额',
      monthlyAmount: '月结金额',
      codAmount: '代收货款',
      handlingFee: '装卸费',
      transportMode: '运输方式',
      orderRemark: '订单备注'
    }
    return labels[field] || field
  }

  function getQualityProgressColor(rate: number): string {
    if (rate >= 85) return 'var(--el-color-success)'
    if (rate >= 60) return 'var(--el-color-warning)'
    return 'var(--el-color-danger)'
  }

  const formatDateTime = createDateTimeFormatter()

  onMounted(async () => {
    await Promise.all([
      ...['aiRunFeature', 'aiRunStatus', 'aiFeedbackIssueType', 'aiFeedbackResolutionStatus'].map(
        (code) => userStore.ensureDictLoaded(code)
      ),
      loadOverview()
    ])
  })

  onBeforeUnmount(() => {
    overviewRequestId += 1
  })
</script>

<style scoped lang="scss">
  .ai-operations {
    :deep(> .art-async-state) {
      display: grid;
      gap: var(--art-space-4);
      padding-bottom: var(--art-space-5);
    }

    &__health-title,
    &__feedback,
    &__feedback > div {
      display: flex;
      align-items: center;
    }

    &__workspace-nav {
      position: sticky;
      top: 8px;
      z-index: 5;
      display: flex;
      gap: 20px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 13px 16px;
      background:
        linear-gradient(
          90deg,
          color-mix(in srgb, var(--theme-color) 6%, transparent),
          transparent 44%
        ),
        var(--default-box-color);
      box-shadow: var(--el-box-shadow-lighter);

      > div:first-child {
        display: grid;
        gap: 2px;
        min-width: 0;

        span {
          font-size: 9px;
          font-weight: 700;
          color: var(--theme-color);
          letter-spacing: 0.12em;
        }

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }

        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }
      }

      &-scrollbar {
        flex: 0 0 auto;
        max-width: 100%;
      }
    }

    &__metric {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;
      padding: 20px;

      > div:last-child {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      strong {
        font-size: 23px;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__metric-icon,
    &__health-icon {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      width: 44px;
      height: 44px;
      font-size: 21px;
      border-radius: var(--art-feature-radius);
    }

    &__metric-icon {
      &.is-primary {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }

      &.is-success {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-warning {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
    }

    &__quality {
      display: grid;
      gap: 18px;
      padding: 22px 24px;
    }

    &__quality-header {
      margin-bottom: 0;

      > div > span {
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.1em;
      }
    }

    &__quality-metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;

      > article {
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
        padding: 14px;
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);

        > div:last-child {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        span,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        strong {
          font-size: 20px;
          color: var(--el-text-color-primary);
        }

        small {
          color: var(--el-text-color-placeholder);
        }
      }
    }

    &__quality-content {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(360px, 1fr);
      gap: 18px;
      min-width: 0;
    }

    &__quality-trend,
    &__field-quality {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: clamp(300px, 32vh, 328px);
      min-height: 0;
      padding: 16px 18px;
      overflow: hidden;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > header,
      > header > div {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }

      > header {
        margin-bottom: 8px;

        span,
        small {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }
      }
    }

    &__quality-trend-chart,
    &__quality-chart-empty {
      flex: 1;
      min-height: 0;
    }

    &__field-state {
      flex: 1;
      min-height: 0 !important;
      overflow: hidden;
    }

    &__field-scrollbar {
      height: 100%;

      :deep(.el-scrollbar__view) {
        padding-right: 12px;
      }
    }

    &__field-list {
      display: grid;
      gap: 11px;

      > div {
        display: grid;
        grid-template-columns: minmax(130px, 1fr) minmax(90px, 0.8fr) 48px;
        gap: 10px;
        align-items: center;

        > div:first-child {
          display: grid;
          min-width: 0;
        }

        span,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        span {
          font-size: 12px;
          color: var(--el-text-color-primary);
        }

        small {
          font-size: 10px;
          color: var(--el-text-color-placeholder);
        }

        > strong {
          font-size: 11px;
          color: var(--el-text-color-secondary);
          text-align: right;
        }
      }
    }

    &__insights {
      display: grid;
      grid-template-columns: minmax(0, 1.65fr) minmax(340px, 1fr);
      gap: 16px;
      align-items: stretch;
    }

    &__trend,
    &__features {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: clamp(390px, 48vh, 480px);
      min-height: 0;
      padding: 21px 24px 14px;
    }

    &__card-header {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      h2 {
        margin: 3px 0 0;
        font-size: 17px;
        color: var(--el-text-color-primary);
      }

      > strong {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__card-hint {
      margin: 4px 0 0;
      font-size: 11px;
      line-height: 1.5;
      color: var(--el-text-color-placeholder);
    }

    &__legend {
      display: flex;
      gap: 14px;

      span::before {
        display: inline-block;
        width: 7px;
        height: 7px;
        margin-right: 6px;
        content: '';
        border-radius: 50%;
      }

      .is-success::before {
        background: var(--el-color-success);
      }

      .is-danger::before {
        background: var(--el-color-danger);
      }
    }

    &__trend-actions {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    &__feature-content {
      display: grid;
      flex: 1;
      grid-template-columns: minmax(160px, 0.9fr) minmax(230px, 1.1fr);
      gap: 14px;
      min-height: 0;
      overflow: hidden;
    }

    &__trend-chart,
    &__feature-chart {
      min-width: 0;
      min-height: 0;
    }

    &__trend-chart {
      flex: 1;
    }

    &__chart-empty {
      min-height: 210px;
    }

    &__feature-chart {
      display: grid;
      place-items: center;
    }

    &__feature-list-shell {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 0;
      min-height: 0;
      padding: 4px 0 2px;
      overflow: hidden;
    }

    &__feature-scrollbar {
      flex: 1;
      min-height: 0;

      :deep(.el-scrollbar__view) {
        padding-right: 10px;
      }
    }

    &__feature-list {
      display: grid;
      gap: 7px;
      min-width: 0;

      > div:not(.el-empty) {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 10px;
        align-items: center;
        min-height: 20px;
      }

      span {
        display: flex;
        gap: 7px;
        align-items: center;
        min-width: 0;
        font-size: 12px;
      }

      i {
        width: 7px;
        height: 7px;
        background: var(--el-color-primary);
        border-radius: 50%;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      small {
        min-width: 57px;
        font-size: 10px;
        color: var(--el-text-color-placeholder);
        text-align: right;
      }

      .is-unused {
        i {
          background: transparent;
          border: 1px solid var(--el-color-primary-light-5);
        }

        strong,
        small {
          color: var(--el-text-color-placeholder);
        }
      }
    }

    &__feature-list-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 10px;
      align-items: center;
      padding-bottom: 3px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      span,
      strong,
      small {
        font-size: 10px;
        font-weight: 500;
        color: var(--el-text-color-placeholder);
      }
    }

    &__health {
      display: grid;
      grid-template-columns: minmax(210px, 0.7fr) minmax(240px, 0.8fr) minmax(320px, 1.5fr);
      gap: 20px;
      align-items: center;
      padding: 19px 24px;
    }

    &__health-title {
      gap: 12px;

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      h2 {
        margin: 3px 0 0;
        font-size: 16px;
        color: var(--el-text-color-primary);
      }
    }

    &__health-icon {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
    }

    &__feedback {
      gap: 10px;

      > div {
        flex: 1;
        gap: 6px;
        padding: 10px 12px;
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);
      }

      span {
        flex: 1;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 15px;
        color: var(--el-text-color-primary);
      }
    }

    &__errors {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      min-width: 0;
      overflow: hidden;

      > div {
        display: flex;
        gap: 7px;
        align-items: center;
        min-width: 0;
        padding: 8px 10px;
        background: var(--el-color-danger-light-9);
        border-radius: var(--el-border-radius-small);
      }

      code {
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        color: var(--el-color-danger);
        white-space: nowrap;
      }

      span {
        flex-shrink: 0;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__errors &__healthy {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }

    &__table {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: clamp(560px, 70vh, 820px);
    }

    @media (width <= 1200px) {
      &__quality-metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__quality-content {
        grid-template-columns: 1fr;
      }

      &__insights {
        grid-template-columns: 1fr;
      }

      &__health {
        grid-template-columns: 1fr 1fr;
      }

      &__errors {
        grid-column: 1 / -1;
        justify-content: flex-start;
      }

      &__workspace-nav {
        align-items: flex-start;

        &-scrollbar {
          max-width: 68%;
        }
      }
    }

    @media (width <= 720px) {
      &__workspace-nav {
        position: static;
        flex-direction: column;

        &-scrollbar {
          width: 100%;
          max-width: none;
        }

        :deep(.el-segmented) {
          width: max-content;
        }
      }

      &__quality {
        padding: 18px;
      }

      &__quality-header {
        align-items: flex-start;
      }

      &__trend .ai-operations__card-header,
      &__quality-trend > header {
        flex-direction: column;
        align-items: flex-start;
      }

      &__trend-actions {
        flex-wrap: wrap;
        justify-content: space-between;
        width: 100%;
      }

      &__quality-metrics {
        grid-template-columns: 1fr;
      }

      &__field-list > div {
        grid-template-columns: minmax(120px, 1fr) 76px 44px;
      }

      &__feature-content {
        grid-template-rows: 210px minmax(250px, 1fr);
        grid-template-columns: 1fr;
      }

      &__trend {
        height: 390px;
      }

      &__features {
        height: 610px;
      }

      &__health {
        grid-template-columns: 1fr;
      }

      &__errors {
        flex-wrap: wrap;
        grid-column: auto;
      }
    }
  }
</style>
