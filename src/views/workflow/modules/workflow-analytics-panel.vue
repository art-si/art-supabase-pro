<template>
  <div class="workflow-analytics">
    <section class="workflow-analytics__toolbar">
      <div>
        <strong>统计周期</strong>
        <ElSegmented
          v-model="state.days"
          aria-label="统计周期"
          :options="periodOptions"
          @change="loadData"
        />
      </div>
      <ElButton type="primary" plain :disabled="!exportReady" @click="exportCsv">
        <ArtSvgIcon icon="ri:download-2-line" />{{ exportLabel }}
      </ElButton>
    </section>

    <ArtAsyncState
      v-if="state.loading || state.error"
      :loading="!externalLoading && state.loading"
      :loading-mode="externalLoading ? 'mask' : 'skeleton'"
      :skeleton-rows="5"
      :error="state.error"
      error-title="审批运营分析加载失败"
      :min-height="280"
      @retry="loadData"
    />

    <ElTabs v-else-if="state.data && state.bottleneck" v-model="state.activeTab">
      <ElTabPane label="经营概览" name="overview">
        <section class="workflow-analytics__metrics">
          <article v-for="metric in metrics" :key="metric.label" class="art-card-xs">
            <small>{{ metric.label }}</small>
            <strong>{{ metric.value }}</strong>
            <span>{{ metric.hint }}</span>
          </article>
        </section>

        <ArtSectionCard
          class="workflow-analytics__trend"
          :empty="!recentDaily.length"
          empty-title="当前周期暂无发起记录"
          empty-description="调整统计周期，或在发起审批后查看每日趋势。"
          preserve-content-structure
        >
          <template #header
            ><div class="workflow-analytics__heading">
              <div>
                <ArtSectionTitle :show-line="false">近 14 日发起趋势</ArtSectionTitle>
                <p>柱高按当前区间最大日发起量归一化，仅用于快速识别峰值。</p>
              </div>
              <span>生成于 {{ formatDate(state.data.generatedAt) }}</span>
            </div></template
          >
          <ElScrollbar>
            <div class="workflow-analytics__bars" aria-label="审批每日发起趋势">
              <article v-for="item in recentDaily" :key="item.date">
                <div>
                  <span
                    :style="{ height: `${(item.startedCount / dailyMax) * 100}%` }"
                    :title="`${item.date}：发起 ${item.startedCount}`"
                  />
                </div>
                <strong>{{ item.startedCount }}</strong>
                <small>{{ dayjs(item.date).format('MM-DD') }}</small>
              </article>
            </div>
          </ElScrollbar>
        </ArtSectionCard>

        <ArtSectionCard class="workflow-analytics__business" preserve-content-structure>
          <template #header
            ><div class="workflow-analytics__heading">
              <div>
                <ArtSectionTitle :show-line="false">按业务类型分析</ArtSectionTitle>
                <p>通过率只计算已有明确通过/驳回结论的实例。</p>
              </div>
              <ElTag effect="plain" round>{{ state.data.businessTypes.length }} 类业务</ElTag>
            </div></template
          >

          <ArtEmptyState
            v-if="!state.data.businessTypes.length"
            title="当前周期暂无审批数据"
            description="调整统计周期后可重新查看。"
            icon="ri:bar-chart-box-line"
          />
          <div v-else class="workflow-analytics__business-list">
            <article v-for="item in state.data.businessTypes" :key="item.businessType">
              <div class="workflow-analytics__business-name">
                <strong>{{ getWorkflowBusinessTypeLabel(item.businessType) }}</strong>
                <small>审批业务</small>
              </div>
              <div
                ><small>实例数</small><strong>{{ item.totalCount }}</strong></div
              >
              <div
                ><small>通过率</small><strong>{{ item.approvalRate }}%</strong></div
              >
              <div
                ><small>平均耗时</small><strong>{{ item.averageDurationHours }}h</strong></div
              >
              <div>
                <small>超时</small>
                <strong :class="{ 'is-danger': item.overdueCount > 0 }">{{
                  item.overdueCount
                }}</strong>
              </div>
            </article>
          </div>
        </ArtSectionCard>
      </ElTabPane>

      <ElTabPane label="瓶颈治理" name="governance">
        <div class="workflow-analytics__governance">
          <div class="workflow-analytics__notice">
            <ArtSvgIcon icon="ri:information-line" />
            <p>
              用于识别流程容量、SLA 与协作风险；样本少于
              {{ state.bottleneck.minimumSampleSize }} 条仅展示数据，不直接形成绩效结论。
            </p>
          </div>

          <section class="workflow-analytics__metrics workflow-analytics__metrics--governance">
            <article v-for="metric in governanceMetrics" :key="metric.label" class="art-card-xs">
              <small>{{ metric.label }}</small>
              <strong :class="metric.tone ? `is-${metric.tone}` : ''">{{ metric.value }}</strong>
              <span>{{ metric.hint }}</span>
            </article>
          </section>

          <ArtSectionCard class="workflow-analytics__governance-card" preserve-content-structure>
            <template #header
              ><div class="workflow-analytics__heading">
                <div>
                  <ArtSectionTitle :show-line="false">节点瓶颈</ArtSectionTitle>
                  <p>按逾期、SLA 违约、待办量与 P90 耗时排序，优先处理影响面更大的节点。</p>
                </div>
                <ElTag effect="plain" round>{{ attentionNodeCount }} 个需关注</ElTag>
              </div></template
            >

            <ArtEmptyState
              v-if="!state.bottleneck.nodes.length"
              title="当前周期暂无节点数据"
              description="流程运行后会在这里形成节点级治理依据。"
              icon="ri:flow-chart"
            />
            <ElScrollbar v-else max-height="min(360px, 42vh)">
              <div class="workflow-analytics__node-list">
                <article
                  v-for="item in state.bottleneck.nodes"
                  :key="`${item.definitionId}:${item.nodeKey}`"
                >
                  <div class="workflow-analytics__node-main">
                    <div>
                      <ElTag :type="riskMeta[item.riskLevel].type" effect="light" size="small">
                        {{ riskMeta[item.riskLevel].label }}
                      </ElTag>
                      <strong>{{ item.nodeName }}</strong>
                    </div>
                    <span>{{ item.definitionName }}</span>
                    <small v-if="item.slaMeasuredCount < state.bottleneck.minimumSampleSize">
                      样本 {{ item.slaMeasuredCount }} 条，暂不评级
                    </small>
                  </div>
                  <div
                    ><small>待办</small><strong>{{ item.pendingCount }}</strong></div
                  >
                  <div
                    ><small>逾期待办</small
                    ><strong :class="{ 'is-danger': item.overduePendingCount > 0 }">{{
                      item.overduePendingCount
                    }}</strong></div
                  >
                  <div
                    ><small>SLA 达标</small><strong>{{ item.slaComplianceRate }}%</strong></div
                  >
                  <div
                    ><small>P90 耗时</small><strong>{{ item.p90HandleHours }}h</strong></div
                  >
                </article>
              </div>
            </ElScrollbar>
          </ArtSectionCard>

          <ArtSectionCard class="workflow-analytics__governance-card" preserve-content-structure>
            <template #header
              ><div class="workflow-analytics__heading">
                <div>
                  <ArtSectionTitle :show-line="false">审批负载</ArtSectionTitle>
                  <p>用于发现工作量集中和代办承接压力，建议结合岗位与排班共同判断。</p>
                </div>
                <ElTag effect="plain" round>{{ state.bottleneck.approvers.length }} 位审批人</ElTag>
              </div></template
            >

            <ArtEmptyState
              v-if="!state.bottleneck.approvers.length"
              title="当前周期暂无审批人数据"
              description="产生审批任务后会展示租户范围内的负载分布。"
              icon="ri:team-line"
            />
            <ElScrollbar v-else max-height="min(360px, 42vh)">
              <div class="workflow-analytics__approver-list">
                <article v-for="item in state.bottleneck.approvers" :key="item.assigneeUserId">
                  <div class="workflow-analytics__approver-name">
                    <span>{{ getInitial(item.assigneeName) }}</span>
                    <div>
                      <strong>{{ item.assigneeName || '未命名审批人' }}</strong>
                      <small v-if="item.delegatedCount || item.transferredCount">
                        委托 {{ item.delegatedCount }} · 转交 {{ item.transferredCount }}
                      </small>
                      <small v-else>直接分配</small>
                    </div>
                  </div>
                  <div
                    ><small>当前待办</small><strong>{{ item.pendingCount }}</strong></div
                  >
                  <div
                    ><small>已处理</small><strong>{{ item.handledCount }}</strong></div
                  >
                  <div
                    ><small>SLA 达标</small><strong>{{ item.slaComplianceRate }}%</strong></div
                  >
                  <ElTag :type="riskMeta[item.riskLevel].type" effect="plain" size="small">
                    {{ riskMeta[item.riskLevel].label }}
                  </ElTag>
                </article>
              </div>
            </ElScrollbar>
          </ArtSectionCard>
        </div>
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<script setup lang="ts">
  import { createDateTimeFormatter } from '@/utils/ui/format'

  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { downloadBlob } from '@/utils/file'
  import { createFriendlySupabaseError } from '@/utils/supabase'
  import dayjs from 'dayjs'
  import { useAsyncState } from '@vueuse/core'
  import { ElMessage } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import {
    fetchWorkflowBottleneckAnalytics,
    fetchWorkflowOperationalAnalytics
  } from '@/api/workflow'
  import { getWorkflowBusinessTypeLabel } from './workflow-business-contracts'

  defineOptions({ name: 'WorkflowAnalyticsPanel' })
  withDefaults(defineProps<{ externalLoading?: boolean }>(), { externalLoading: false })
  const emit = defineEmits<{ loadingChange: [loading: boolean] }>()

  const periodOptions = [
    { label: '7 天', value: 7 },
    { label: '30 天', value: 30 },
    { label: '90 天', value: 90 },
    { label: '180 天', value: 180 }
  ]
  const request = useAsyncState(
    async (days: number) => {
      const [data, bottleneck] = await Promise.all([
        fetchWorkflowOperationalAnalytics(days),
        fetchWorkflowBottleneckAnalytics(days)
      ])
      return { days, data, bottleneck }
    },
    null,
    {
      immediate: false,
      // The inline state below owns recoverable errors; no duplicate global report.
      onError: () => undefined
    }
  )
  const state = reactive({
    days: 30,
    activeTab: 'overview' as 'overview' | 'governance',
    loading: request.isLoading,
    error: computed(() =>
      request.error.value
        ? createFriendlySupabaseError(request.error.value, '审批运营分析加载失败，请稍后重试')
        : null
    ),
    data: computed(() => request.state.value?.data ?? null),
    bottleneck: computed(() => request.state.value?.bottleneck ?? null)
  })

  watch(
    () => state.loading,
    (loading) => emit('loadingChange', loading),
    { immediate: true }
  )

  const riskMeta: Record<
    Api.Workflow.WorkflowAnalyticsRiskLevel,
    { label: string; type: 'success' | 'warning' | 'danger' }
  > = {
    normal: { label: '运行平稳', type: 'success' },
    warning: { label: '建议关注', type: 'warning' },
    critical: { label: '优先治理', type: 'danger' }
  }

  const metrics = computed(() => {
    const summary = state.data?.summary
    return [
      {
        label: '审批实例',
        value: summary?.totalCount ?? 0,
        hint: `${state.days} 天内发起`
      },
      {
        label: '当前运行',
        value: summary?.runningCount ?? 0,
        hint: '尚未形成最终结论'
      },
      {
        label: '已通过',
        value: summary?.approvedCount ?? 0,
        hint: '已完成业务回写'
      },
      {
        label: '超时实例',
        value: summary?.overdueCount ?? 0,
        hint: '存在逾期待办'
      },
      {
        label: '平均耗时',
        value: `${summary?.averageDurationHours ?? 0}h`,
        hint: '仅统计已结束实例'
      }
    ]
  })
  const recentDaily = computed(() => state.data?.daily.slice(-14) ?? [])
  const dailyMax = computed(() =>
    Math.max(1, ...recentDaily.value.map((item) => item.startedCount))
  )
  const governanceMetrics = computed(() => {
    const summary = state.bottleneck?.summary
    return [
      {
        label: 'SLA 达标率',
        value: summary?.slaMeasuredCount ? `${summary.slaComplianceRate}%` : '—',
        hint: `${summary?.slaMeasuredCount ?? 0} 条纳入 SLA`,
        tone: (summary?.slaComplianceRate ?? 100) < 90 ? 'warning' : ''
      },
      {
        label: 'P90 处理耗时',
        value: summary?.handledCount ? `${summary.p90HandleHours}h` : '—',
        hint: summary?.handledCount ? '90% 已处理任务不超过该值' : '暂无已处理任务',
        tone: ''
      },
      {
        label: '逾期待办',
        value: summary?.overduePendingCount ?? 0,
        hint: `${summary?.pendingCount ?? 0} 条当前待办`,
        tone: (summary?.overduePendingCount ?? 0) > 0 ? 'danger' : ''
      },
      {
        label: '协作流转',
        value: (summary?.delegatedCount ?? 0) + (summary?.transferredCount ?? 0),
        hint: `委托 ${summary?.delegatedCount ?? 0} · 转交 ${summary?.transferredCount ?? 0}`,
        tone: ''
      }
    ]
  })
  const attentionNodeCount = computed(
    () => state.bottleneck?.nodes.filter((item) => item.riskLevel !== 'normal').length ?? 0
  )
  const exportReady = computed(
    () =>
      !state.loading &&
      !state.error &&
      request.state.value?.days === state.days &&
      Boolean(state.data && state.bottleneck)
  )
  const exportLabel = computed(() =>
    state.activeTab === 'overview' ? '导出业务汇总' : '导出瓶颈明细'
  )

  const formatDate = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm' })

  async function loadData(): Promise<void> {
    await request.executeImmediate(state.days)
  }

  function escapeCsv(value: unknown): string {
    return `"${String(value ?? '').replaceAll('"', '""')}"`
  }

  function exportCsv(): void {
    if (!exportReady.value || !state.data || !state.bottleneck) return
    const isOverview = state.activeTab === 'overview'
    const header = isOverview
      ? [
          '业务类型',
          '实例数',
          '运行中',
          '已通过',
          '已驳回',
          '已中断',
          '超时',
          '通过率(%)',
          '平均耗时(小时)'
        ]
      : [
          '流程定义',
          '节点',
          '风险等级',
          '任务数',
          '待办数',
          '逾期待办',
          'SLA样本数',
          'SLA达标率(%)',
          '平均处理耗时(小时)',
          'P90处理耗时(小时)'
        ]
    const rows = isOverview
      ? state.data.businessTypes.map((item) => [
          getWorkflowBusinessTypeLabel(item.businessType),
          item.totalCount,
          item.runningCount,
          item.approvedCount,
          item.rejectedCount,
          item.interruptedCount,
          item.overdueCount,
          item.approvalRate,
          item.averageDurationHours
        ])
      : state.bottleneck.nodes.map((item) => [
          item.definitionName,
          item.nodeName,
          riskMeta[item.riskLevel].label,
          item.taskCount,
          item.pendingCount,
          item.overduePendingCount,
          item.slaMeasuredCount,
          item.slaComplianceRate,
          item.averageHandleHours,
          item.p90HandleHours
        ])
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n')
    downloadBlob(
      new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
      `${isOverview ? '审批运营汇总' : '审批瓶颈明细'}_${state.days}天_${dayjs().format('YYYYMMDD_HHmm')}.csv`
    )
    ElMessage.success(`${isOverview ? '审批运营汇总' : '审批瓶颈明细'}已导出`)
  }

  function getInitial(name?: string | null): string {
    return name?.trim().slice(0, 1).toUpperCase() || '审'
  }

  onMounted(() => void loadData())
</script>

<style scoped lang="scss">
  .workflow-analytics {
    display: grid;
    gap: 14px;
    min-width: 0;

    &__toolbar,
    &__heading {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
    }

    &__toolbar,
    &__metrics,
    &__trend,
    &__business {
      width: 100%;
      min-width: 0;
    }

    &__toolbar {
      padding: 12px 14px;
      background: var(--art-gray-50);
      border-radius: var(--el-border-radius-base);

      > div {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      strong {
        font-size: 13px;
        color: var(--art-gray-700);
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;

      article {
        display: grid;
        gap: 4px;
        padding: 13px;
      }

      small,
      span {
        font-size: 11px;
        color: var(--art-gray-600);
      }

      strong {
        font-size: 23px;
        line-height: 1.15;
        color: var(--art-gray-900);
      }
    }

    &__trend,
    &__business {
      padding: 15px;
    }

    &__heading {
      align-items: flex-start;
      margin-bottom: 14px;

      > div {
        display: grid;
        gap: 3px;
      }

      p,
      > span {
        margin: 0;
        font-size: 11px;
        color: var(--art-gray-600);
      }
    }

    &__bars {
      display: grid;
      grid-template-columns: repeat(14, minmax(24px, 1fr));
      gap: 7px;
      min-width: 427px;

      article {
        display: grid;
        grid-template-rows: 100px auto auto;
        gap: 4px;
        min-width: 24px;
        text-align: center;
      }

      article > div {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        border-bottom: 1px solid var(--art-gray-200);
      }

      article > div span {
        width: min(20px, 70%);
        background: linear-gradient(
          180deg,
          var(--el-color-primary),
          var(--el-color-primary-light-5)
        );
        border-radius: var(--el-border-radius-small) var(--el-border-radius-small) 0 0;
      }

      strong {
        font-size: 11px;
        color: var(--art-gray-800);
      }

      small {
        font-size: 9px;
        color: var(--art-gray-600);
      }
    }

    &__business-list {
      display: grid;
      gap: 7px;
    }

    &__business-list article {
      display: grid;
      grid-template-columns: minmax(180px, 1.6fr) repeat(4, minmax(76px, 0.7fr));
      gap: 12px;
      align-items: center;
      padding: 11px 12px;
      background: var(--art-gray-50);
      border-radius: var(--el-border-radius-base);

      > div {
        display: grid;
        gap: 3px;
        min-width: 0;
      }

      small {
        font-size: 10px;
        color: var(--art-gray-600);
      }

      strong {
        font-size: 13px;
        color: var(--art-gray-800);
      }

      strong.is-danger {
        color: var(--el-color-danger);
      }
    }

    &__business-name {
      :deep(.art-dict-display) {
        font-weight: 600;
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    :deep(.el-tabs),
    :deep(.el-tab-pane) {
      min-width: 0;
    }

    :deep(.el-tab-pane) {
      display: grid;
      gap: 14px;
    }

    &__governance {
      display: grid;
      gap: 14px;
      min-width: 0;
    }

    &__notice {
      display: flex;
      gap: 9px;
      align-items: flex-start;
      padding: 11px 13px;
      color: var(--el-color-primary-dark-2);
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--el-border-radius-base);

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.65;
      }

      :deep(svg) {
        flex: 0 0 auto;
        margin-top: 2px;
      }
    }

    &__metrics--governance {
      grid-template-columns: repeat(4, minmax(0, 1fr));

      strong.is-danger {
        color: var(--el-color-danger);
      }

      strong.is-warning {
        color: var(--el-color-warning-dark-2);
      }
    }

    &__governance-card {
      min-width: 0;
      padding: 15px;
    }

    &__node-list,
    &__approver-list {
      display: grid;
      gap: 7px;
      padding-right: 8px;
    }

    &__node-list article {
      display: grid;
      grid-template-columns: minmax(220px, 1.6fr) repeat(4, minmax(74px, 0.65fr));
      gap: 12px;
      align-items: center;
      padding: 11px 12px;
      background: var(--art-gray-50);
      border-radius: var(--el-border-radius-base);

      > div:not(.workflow-analytics__node-main) {
        display: grid;
        gap: 3px;
      }

      small {
        font-size: 10px;
        color: var(--art-gray-600);
      }

      strong {
        font-size: 13px;
        color: var(--art-gray-800);
      }

      strong.is-danger {
        color: var(--el-color-danger);
      }
    }

    &__node-main {
      display: grid;
      gap: 3px;
      min-width: 0;

      > div {
        display: flex;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }

      > span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--art-gray-600);
        white-space: nowrap;
      }
    }

    &__approver-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &__approver-list article {
      display: grid;
      grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(58px, 0.55fr)) auto;
      gap: 10px;
      align-items: center;
      padding: 11px 12px;
      background: var(--art-gray-50);
      border-radius: var(--el-border-radius-base);

      > div:not(.workflow-analytics__approver-name) {
        display: grid;
        gap: 3px;
      }

      small {
        font-size: 10px;
        color: var(--art-gray-600);
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--art-gray-800);
        white-space: nowrap;
      }
    }

    &__approver-name {
      display: flex;
      gap: 9px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 32px;
        place-items: center;
        width: 32px;
        height: 32px;
        font-size: 12px;
        font-weight: 700;
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-8);
        border-radius: 50%;
      }

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;
      }
    }
  }

  @media only screen and (width <= 900px) {
    .workflow-analytics {
      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__business-list article {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__business-name {
        grid-column: 1 / -1;
      }

      &__metrics--governance {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__node-list article {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__node-main {
        grid-column: 1 / -1;
      }

      &__approver-list {
        grid-template-columns: 1fr;
      }
    }
  }

  @media only screen and (width <= 620px) {
    .workflow-analytics {
      &__toolbar {
        align-items: stretch;
      }

      &__toolbar,
      &__toolbar > div {
        flex-direction: column;
        width: 100%;
        min-width: 0;
      }

      &__toolbar :deep(.el-segmented) {
        width: 100%;
      }

      &__metrics {
        grid-template-columns: 1fr;
      }

      &__metrics--governance {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__business-list article {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__business-name {
        grid-column: 1 / -1;
      }

      &__node-list article {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__node-main {
        grid-column: 1 / -1;
      }

      &__approver-list article {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        > .workflow-analytics__approver-name {
          grid-column: 1 / -1;
        }
      }
    }
  }
</style>
