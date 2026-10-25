<template>
  <ArtSectionCard class="ai-feedback-quality" preserve-content-structure>
    <template #header>
      <header class="ai-feedback-quality__header">
        <div class="ai-feedback-quality__identity">
          <div class="ai-feedback-quality__identity-icon">
            <ArtSvgIcon icon="ri:loop-right-line" />
          </div>
          <div>
            <span>QUALITY GOVERNANCE</span>
            <h2>AI 质量评估与反馈闭环</h2>
            <p>用评价覆盖率、正向率和问题关闭率衡量 AI 是否真正可用。</p>
          </div>
        </div>
        <div class="ai-feedback-quality__header-status">
          <ElTag :type="data.canManageFeedback ? 'primary' : 'info'" effect="plain" round>
            {{ data.canManageFeedback ? '管理员处理模式' : '只读观察模式' }}
          </ElTag>
          <span>{{ data.days }} 天评估周期</span>
        </div>
      </header>
    </template>

    <ElAlert
      v-if="data.totalRuns > 0 && data.feedbackCoverageRate < 20"
      :title="`当前只有 ${data.feedbackCoverageRate.toFixed(1)}% 的 AI 运行获得评价，质量结论仍缺少足够样本。`"
      description="建议在所有 AI 结果页统一展示有帮助 / 需改进，并在负面评价后引导填写原因。"
      type="warning"
      show-icon
      :closable="false"
    />

    <div class="ai-feedback-quality__metrics">
      <article v-for="metric in metricCards" :key="metric.key">
        <div :class="['ai-feedback-quality__metric-icon', `is-${metric.tone}`]">
          <ArtSvgIcon :icon="metric.icon" />
        </div>
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.hint }}</small>
        </div>
      </article>
    </div>

    <div class="ai-feedback-quality__content">
      <article class="ai-feedback-quality__features">
        <header>
          <div>
            <span>按能力评估</span>
            <strong>反馈覆盖与稳定性</strong>
          </div>
          <small>优先治理低覆盖或存在未关闭问题的能力</small>
        </header>
        <ElScrollbar max-height="360px">
          <ArtAsyncState
            :empty="!data.featureQuality.length"
            empty-text="当前周期暂无 AI 运行数据"
            empty-description="开始使用 AI 能力后，这里会汇总各能力的运行质量。"
            :empty-image-size="64"
            :min-height="220"
          >
            <div class="ai-feedback-quality__feature-list">
              <div v-for="item in data.featureQuality" :key="item.feature">
                <div class="ai-feedback-quality__feature-title">
                  <ArtDictDisplay dict-code="aiRunFeature" :value="item.feature" display="text" />
                  <ElTag v-if="item.openIssues" type="danger" effect="light" size="small">
                    {{ item.openIssues }} 个待处理
                  </ElTag>
                  <span v-else>运行成功率 {{ item.successRate.toFixed(1) }}%</span>
                </div>
                <div class="ai-feedback-quality__feature-progress">
                  <ElProgress
                    :percentage="item.feedbackCoverageRate"
                    :stroke-width="8"
                    :show-text="false"
                    :color="progressColor(item.feedbackCoverageRate)"
                  />
                  <strong>{{ item.feedbackCoverageRate.toFixed(1) }}%</strong>
                </div>
                <small>
                  {{ item.feedbackCount }} / {{ item.totalRuns }} 次获得评价 · 正向
                  {{ item.positiveFeedback }} · 负向 {{ item.negativeFeedback }}
                </small>
              </div>
            </div>
          </ArtAsyncState>
        </ElScrollbar>
      </article>

      <article class="ai-feedback-quality__queue">
        <header>
          <div>
            <span>负面反馈队列</span>
            <strong>需要核查与闭环</strong>
          </div>
          <ElTag :type="data.openFeedbackIssues ? 'danger' : 'success'" effect="light" round>
            {{ data.openFeedbackIssues ? `${data.openFeedbackIssues} 个未关闭` : '已全部闭环' }}
          </ElTag>
        </header>
        <ElScrollbar max-height="360px">
          <ArtAsyncState
            :empty="!data.feedbackQueue.length"
            empty-text="当前周期没有负面反馈，继续关注评价覆盖率是否足够。"
            empty-description="继续关注评价覆盖率，确保质量指标具有代表性。"
            :empty-image-size="64"
            :min-height="220"
          >
            <div class="ai-feedback-quality__queue-list">
              <article v-for="item in data.feedbackQueue" :key="item.feedbackId">
                <div class="ai-feedback-quality__queue-main">
                  <div>
                    <ArtDictDisplay dict-code="aiRunFeature" :value="item.feature" display="text" />
                    <ArtDictDisplay
                      dict-code="aiFeedbackResolutionStatus"
                      :value="item.status"
                      display="tag"
                    />
                  </div>
                  <strong>{{ item.comment || '用户未填写具体说明' }}</strong>
                  <span>{{ item.model }} · {{ formatDateTime(item.feedbackTime) }}</span>
                  <p v-if="item.resolutionNote">处理记录：{{ item.resolutionNote }}</p>
                </div>
                <div class="ai-feedback-quality__queue-actions">
                  <ElButton link @click="emit('viewRun', item.runId)">查看运行</ElButton>
                  <ElButton
                    v-if="data.canManageFeedback"
                    type="primary"
                    plain
                    size="small"
                    @click="emit('resolve', item)"
                  >
                    {{ isClosed(item.status) ? '查看 / 重开' : '处理反馈' }}
                  </ElButton>
                </div>
              </article>
            </div>
          </ArtAsyncState>
        </ElScrollbar>
      </article>
    </div>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { createDateTimeFormatter } from '@/utils/ui/format'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type {
    AiFeedbackQualityOverview,
    AiFeedbackQueueItem,
    AiFeedbackResolutionStatus
  } from '@/api/ai-operations'

  defineOptions({ name: 'AiFeedbackQualityPanel' })

  type MetricTone = 'primary' | 'success' | 'warning' | 'danger'

  interface MetricCard {
    key: string
    label: string
    value: string
    hint: string
    icon: string
    tone: MetricTone
  }

  const props = defineProps<{
    data: AiFeedbackQualityOverview
  }>()

  const emit = defineEmits<{
    resolve: [item: AiFeedbackQueueItem]
    viewRun: [runId: string]
  }>()

  const metricCards = computed<MetricCard[]>(() => [
    {
      key: 'coverage',
      label: '评价覆盖率',
      value: `${props.data.feedbackCoverageRate.toFixed(1)}%`,
      hint: `${props.data.totalFeedback} 条评价 · ${props.data.unratedRuns} 次未评价`,
      icon: 'ri:survey-line',
      tone: props.data.feedbackCoverageRate >= 30 ? 'success' : 'warning'
    },
    {
      key: 'positive',
      label: '正向评价率',
      value: `${props.data.positiveRate.toFixed(1)}%`,
      hint: `${props.data.positiveFeedback} 条有帮助 · ${props.data.negativeFeedback} 条需改进`,
      icon: 'ri:thumb-up-line',
      tone: props.data.positiveRate >= 80 ? 'success' : 'warning'
    },
    {
      key: 'resolution',
      label: '负面反馈关闭率',
      value: `${props.data.resolutionRate.toFixed(1)}%`,
      hint: `${props.data.closedFeedbackIssues} 条已关闭`,
      icon: 'ri:checkbox-circle-line',
      tone: props.data.resolutionRate >= 90 ? 'success' : 'warning'
    },
    {
      key: 'open',
      label: '待处理问题',
      value: String(props.data.openFeedbackIssues),
      hint: props.data.openFeedbackIssues ? '需要管理员核查并记录结论' : '当前没有遗留问题',
      icon: 'ri:alarm-warning-line',
      tone: props.data.openFeedbackIssues ? 'danger' : 'primary'
    }
  ])

  function isClosed(status: AiFeedbackResolutionStatus): boolean {
    return status === 'resolved' || status === 'dismissed'
  }

  function progressColor(rate: number): string {
    if (rate >= 30) return 'var(--el-color-success)'
    if (rate >= 15) return 'var(--el-color-warning)'
    return 'var(--el-color-danger)'
  }

  const formatDateTime = createDateTimeFormatter({ format: 'MM-DD HH:mm' })
</script>

<style scoped lang="scss">
  .ai-feedback-quality {
    display: grid;
    gap: var(--art-space-3);
    min-width: 0;
    padding: 22px 24px;

    &__header,
    &__identity,
    &__header-status,
    &__feature-title,
    &__queue-actions {
      display: flex;
      align-items: center;
    }

    &__header {
      gap: var(--art-space-3);
      justify-content: space-between;
    }

    &__identity {
      gap: 13px;
      min-width: 0;

      > div:last-child {
        min-width: 0;
      }

      span {
        font-size: 10px;
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.12em;
      }

      h2 {
        margin: 3px 0;
        font-size: 18px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__identity-icon {
      display: grid;
      flex: 0 0 44px;
      place-items: center;
      width: 44px;
      height: 44px;
      font-size: 21px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
    }

    &__header-status {
      flex-shrink: 0;
      gap: 10px;

      > span:last-child {
        font-size: 11px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__metrics {
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

    &__metric-icon {
      display: grid;
      flex: 0 0 40px;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: 19px;
      border-radius: var(--el-border-radius-base);

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

      &.is-danger {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }
    }

    &__content {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--art-space-3);
      min-width: 0;
    }

    &__features,
    &__queue {
      min-width: 0;
      padding: 16px 18px;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > header {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
        min-height: 40px;
        margin-bottom: 12px;

        > div {
          display: grid;
          gap: 2px;
        }

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

    &__feature-list,
    &__queue-list {
      display: grid;
      gap: 10px;
      padding-right: 10px;
    }

    &__feature-list > div {
      display: grid;
      gap: 7px;
      padding: 12px;
      background: var(--el-fill-color-lighter);
      border-radius: var(--el-border-radius-base);

      > small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        color: var(--el-text-color-placeholder);
        white-space: nowrap;
      }
    }

    &__feature-title {
      gap: 8px;
      justify-content: space-between;
      min-width: 0;

      > span:last-child {
        flex-shrink: 0;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }
    }

    &__feature-progress {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 48px;
      gap: 10px;
      align-items: center;

      strong {
        font-size: 11px;
        color: var(--el-text-color-secondary);
        text-align: right;
      }
    }

    &__queue-list > article {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;
      padding: 12px;
      border: 1px solid var(--el-border-color-extra-light);
      border-radius: var(--el-border-radius-base);
    }

    &__queue-main {
      display: grid;
      flex: 1;
      gap: 6px;
      min-width: 0;

      > div {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      strong,
      p {
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-primary);
        overflow-wrap: anywhere;
      }

      > span,
      p {
        margin: 0;
        font-size: 10px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__queue-actions {
      flex: 0 0 auto;
      gap: 4px;
    }

    @media (width <= 1200px) {
      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__content {
        grid-template-columns: 1fr;
      }
    }

    @media (width <= 720px) {
      padding: 18px;

      &__header,
      &__queue-list > article {
        flex-direction: column;
        align-items: flex-start;
      }

      &__header-status {
        justify-content: space-between;
        width: 100%;
      }

      &__metrics {
        grid-template-columns: 1fr;
      }

      &__features > header small {
        display: none;
      }

      &__queue-actions {
        justify-content: flex-end;
        width: 100%;
      }
    }
  }
</style>
