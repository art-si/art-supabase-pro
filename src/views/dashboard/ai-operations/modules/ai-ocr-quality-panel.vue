<template>
  <ArtSectionCard class="ocr-quality" preserve-content-structure>
    <template #header>
      <header class="ocr-quality__header">
        <div class="ocr-quality__header-copy">
          <span class="ocr-quality__eyebrow"><i />OCR QUALITY OPERATIONS</span>
          <h2>OCR 质量与复核阈值</h2>
          <p>统一观察发票、签收回单、收付款凭证及银行流水匹配质量。</p>
        </div>
        <div class="ocr-quality__actions">
          <ElTag :type="isPlatformSuper ? 'primary' : 'info'" effect="plain" round>
            <ArtSvgIcon
              :icon="isPlatformSuper ? 'ri:equalizer-2-line' : 'ri:eye-line'"
              aria-hidden="true"
            />
            {{ isPlatformSuper ? '阈值可调' : '只读观察' }}
          </ElTag>
          <ArtTooltip content="刷新 OCR 质量" placement="bottom">
            <ArtIconButton
              icon="ri:refresh-line"
              label="刷新 OCR 质量"
              :loading="state.loading"
              @click="loadData"
            />
          </ArtTooltip>
        </div>
      </header>
    </template>

    <div class="ocr-quality__metrics">
      <article v-for="metric in metrics" :key="metric.key">
        <span :class="['ocr-quality__metric-icon', `is-${metric.tone}`]" aria-hidden="true">
          <ArtSvgIcon :icon="metric.icon" />
        </span>
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.hint }}</small>
        </div>
      </article>
    </div>

    <ArtAsyncState
      :loading="state.loading"
      loading-mode="skeleton"
      :error="state.error"
      :empty="!state.data.features.length"
      empty-text="暂无 OCR 质量样本；完成识别并人工确认后将自动累计"
      empty-description="完成识别与人工确认后，可在此查看准确率和纠错情况。"
      :min-height="240"
      @retry="loadData"
    >
      <div class="ocr-quality__list">
        <article
          v-for="item in state.data.features"
          :key="item.feature"
          :class="['ocr-quality__item', { 'is-empty': !item.artifacts }]"
        >
          <header>
            <div>
              <span class="ocr-quality__feature-icon" aria-hidden="true">
                <ArtSvgIcon :icon="featureIcon(item.feature)" />
              </span>
              <div>
                <strong>{{ item.label }}</strong>
                <small>{{ item.artifacts }} 个样本 · {{ item.reviewed }} 个已复核</small>
              </div>
            </div>
            <ElTag :type="qualityType(item.acceptanceRate)" effect="light" round>
              {{ item.artifacts ? `采纳率 ${item.acceptanceRate.toFixed(1)}%` : '等待样本' }}
            </ElTag>
          </header>
          <div class="ocr-quality__item-grid">
            <div>
              <small>平均置信度</small>
              <strong>{{ item.averageConfidence.toFixed(1) }}%</strong>
            </div>
            <div>
              <small>低置信样本</small><strong>{{ item.lowConfidence }}</strong>
            </div>
            <div class="is-threshold">
              <small>当前阈值</small><strong>{{ item.threshold.toFixed(1) }}%</strong>
            </div>
            <div class="is-threshold">
              <small>建议阈值</small>
              <strong :class="{ 'is-changed': item.recommendedThreshold !== item.threshold }">
                {{ item.recommendedThreshold.toFixed(1) }}%
              </strong>
            </div>
          </div>
          <div class="ocr-quality__progress">
            <div>
              <span
                >字段直接采纳 <strong>{{ item.acceptedFields }}</strong></span
              >
              <small
                >人工修正 <strong>{{ item.correctedFields }}</strong></small
              >
            </div>
            <ElProgress
              :percentage="item.acceptanceRate"
              :stroke-width="8"
              :show-text="false"
              :color="progressColor(item.acceptanceRate)"
            />
          </div>
          <footer>
            <div>
              <ArtSvgIcon
                :icon="item.artifacts < 5 ? 'ri:information-2-line' : 'ri:lightbulb-flash-line'"
                aria-hidden="true"
              />
              <small>{{ recommendationText(item) }}</small>
            </div>
            <ElButton
              v-if="isPlatformSuper"
              type="primary"
              link
              :disabled="item.artifacts < 5 || item.recommendedThreshold === item.threshold"
              @click="applyRecommendation(item)"
              >应用建议阈值</ElButton
            >
          </footer>
        </article>
      </div>
    </ArtAsyncState>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { createFriendlySupabaseError } from '@/utils/supabase'
  import { ElMessage } from 'element-plus'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import {
    applyAiOcrQualityThreshold,
    fetchAiOcrQualityOverview,
    type AiOcrFeatureQuality,
    type AiOcrQualityOverview
  } from '@/api/ai-operations'
  import { useUserStore } from '@/store/modules/user'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'

  defineOptions({ name: 'AiOcrQualityPanel' })
  const props = withDefaults(defineProps<{ days?: number }>(), { days: 30 })
  const { isPlatformSuper } = storeToRefs(useUserStore())
  const { promptReason } = useArtFeedback()
  const emptyData = (): AiOcrQualityOverview => ({
    days: props.days,
    canManage: false,
    totalArtifacts: 0,
    reviewedArtifacts: 0,
    lowConfidenceArtifacts: 0,
    acceptedFields: 0,
    correctedFields: 0,
    features: []
  })
  const state = reactive<{ loading: boolean; error: Error | null; data: AiOcrQualityOverview }>({
    loading: false,
    error: null,
    data: emptyData()
  })
  const metrics = computed(() => {
    const totalFields = state.data.acceptedFields + state.data.correctedFields
    const acceptance = totalFields ? (state.data.acceptedFields * 100) / totalFields : 0
    return [
      {
        key: 'samples',
        label: 'OCR 样本',
        value: state.data.totalArtifacts,
        hint: `近 ${props.days} 天`,
        icon: 'ri:scan-2-line',
        tone: 'primary'
      },
      {
        key: 'reviewed',
        label: '已人工复核',
        value: state.data.reviewedArtifacts,
        hint: '形成质量闭环',
        icon: 'ri:user-follow-line',
        tone: 'success'
      },
      {
        key: 'low-confidence',
        label: '低置信样本',
        value: state.data.lowConfidenceArtifacts,
        hint: '低于当前复核阈值',
        icon: 'ri:error-warning-line',
        tone: 'warning'
      },
      {
        key: 'acceptance',
        label: '字段直接采纳率',
        value: `${acceptance.toFixed(1)}%`,
        hint: `${state.data.correctedFields} 次人工修正`,
        icon: 'ri:checkbox-circle-line',
        tone: 'purple'
      }
    ]
  })
  function featureIcon(feature: string) {
    return (
      (
        {
          invoice_ocr: 'ri-bill-line',
          waybill_receipt_ocr: 'ri-file-check-line',
          cash_voucher_ocr: 'ri-bank-card-line',
          bank_statement_batch_match: 'ri-file-excel-2-line'
        } as Record<string, string>
      )[feature] || 'ri-scan-2-line'
    )
  }
  function qualityType(rate: number): 'success' | 'warning' | 'danger' | 'info' {
    return rate >= 90 ? 'success' : rate >= 75 ? 'warning' : rate ? 'danger' : 'info'
  }
  function progressColor(rate: number) {
    return rate >= 90
      ? 'var(--el-color-success)'
      : rate >= 75
        ? 'var(--el-color-warning)'
        : 'var(--el-color-danger)'
  }
  function recommendationText(item: AiOcrFeatureQuality) {
    if (item.artifacts < 5) return '样本不足 5 个，暂不建议自动调整阈值。'
    if (item.recommendedThreshold > item.threshold)
      return '人工修正偏多，建议提高复核阈值以降低漏审。'
    if (item.recommendedThreshold < item.threshold)
      return '采纳率稳定，可适度降低阈值以减少人工复核。'
    return '当前阈值与近期质量表现匹配，建议保持。'
  }
  async function loadData() {
    state.loading = true
    state.error = null
    try {
      state.data = await fetchAiOcrQualityOverview(props.days)
    } catch (error) {
      state.error = createFriendlySupabaseError(error, 'OCR 质量数据加载失败，请稍后重试')
    } finally {
      state.loading = false
    }
  }
  async function applyRecommendation(item: AiOcrFeatureQuality) {
    try {
      const reason = await promptReason(
        `将 ${item.label} 的复核阈值从 ${item.threshold.toFixed(1)}% 调整为 ${item.recommendedThreshold.toFixed(1)}%。该配置会影响所有启用租户，请填写变更原因。`,
        '应用 OCR 质量建议',
        {
          confirmButtonText: '确认应用',
          placeholder: '例如：近 30 天字段采纳率下降，提升人工复核覆盖',
          emptyMessage: '请填写阈值调整原因'
        }
      )
      await applyAiOcrQualityThreshold({
        feature: item.feature,
        threshold: item.recommendedThreshold / 100,
        reason
      })
      ElMessage.success('OCR 复核阈值已更新并写入审计记录')
      await loadData()
    } catch {
      /* 用户取消或接口层已提示 */
    }
  }
  watch(() => props.days, loadData)
  onMounted(loadData)
  defineExpose({ loadData })
</script>

<style scoped lang="scss">
  .ocr-quality {
    display: grid;
    gap: 20px;
    min-width: 0;
    padding: 24px;
    overflow: hidden;
    border-top: 3px solid var(--el-color-primary);

    &__header,
    &__actions,
    &__item header,
    &__item header > div,
    &__item footer,
    &__item footer > div,
    &__progress > div {
      display: flex;
      align-items: center;
    }

    &__header {
      gap: 18px;
      justify-content: space-between;
      min-width: 0;
    }

    &__header-copy {
      min-width: 0;

      h2 {
        margin: 4px 0;
        font-size: 19px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__eyebrow {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 10px;
      font-weight: 700;
      color: var(--el-color-primary);
      letter-spacing: 0.12em;

      i {
        width: 5px;
        height: 5px;
        background: currentcolor;
        border-radius: 50%;
      }
    }

    &__actions {
      flex: none;
      gap: 9px;

      .el-tag {
        gap: 5px;
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;

      article {
        display: flex;
        gap: 12px;
        align-items: center;
        min-width: 0;
        padding: 15px;
        background: var(--el-fill-color-extra-light);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: var(--el-border-radius-base);

        > div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        > div > span,
        small {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        strong {
          font-size: 23px;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
          color: var(--el-text-color-primary);
        }
      }
    }

    &__metric-icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 42px;
      height: 42px;
      font-size: 20px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);

      &.is-success {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-warning {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }

      &.is-purple {
        color: #7259e7;
        background: color-mix(in srgb, #7259e7 10%, var(--el-bg-color));
      }
    }

    &__list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    &__item {
      min-width: 0;
      padding: 18px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 1px 2px rgb(0 0 0 / 3%);

      &.is-empty {
        background: linear-gradient(145deg, var(--el-bg-color), var(--el-fill-color-extra-light));
      }

      header,
      footer {
        gap: 12px;
        justify-content: space-between;
      }

      header > div {
        gap: 10px;
        min-width: 0;

        > div {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
      }

      header strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 15px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      header small,
      footer small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      footer {
        align-items: flex-start;
        padding-top: 13px;
        border-top: 1px dashed var(--el-border-color);

        > div {
          gap: 7px;
          align-items: flex-start;
          min-width: 0;

          .art-svg-icon {
            flex: none;
            margin-top: 2px;
            color: var(--el-color-primary);
          }
        }

        small {
          max-width: 100%;
          line-height: 1.55;
        }

        .el-button {
          flex: none;
        }
      }
    }

    &__feature-icon {
      display: grid;
      flex: 0 0 40px;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: 19px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
    }

    &__item-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin: 16px 0;

      div {
        display: grid;
        gap: 5px;
        min-width: 0;
        padding: 10px;
        background: var(--el-fill-color-extra-light);
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-small);

        &.is-threshold {
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-8);
        }
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      strong {
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);

        &.is-changed {
          color: var(--el-color-primary);
        }
      }
    }

    &__progress {
      margin-bottom: 14px;

      > div {
        justify-content: space-between;
        margin-bottom: 7px;
        font-size: 11px;

        span,
        small {
          color: var(--el-text-color-secondary);
        }

        strong {
          color: var(--el-text-color-primary);
        }
      }
    }

    @media (width <= 1100px) {
      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__list {
        grid-template-columns: 1fr;
      }
    }

    @media (width <= 720px) {
      padding: 16px;

      &__header,
      &__item footer {
        flex-direction: column;
        align-items: flex-start;
      }

      &__metrics,
      &__item-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__actions {
        justify-content: space-between;
        width: 100%;
      }
    }

    @media (width <= 480px) {
      &__metrics {
        grid-template-columns: 1fr;
      }
    }
  }
</style>
