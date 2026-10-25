<template>
  <div class="ai-model-selector">
    <ElSelect
      :model-value="modelValue || undefined"
      :loading="loading"
      :clearable="clearable"
      filterable
      allow-create
      default-first-option
      :placeholder="placeholder"
      popper-class="ai-model-select-popper"
      placement="bottom-start"
      :fallback-placements="['bottom-start', 'top-start']"
      @change="handleChange"
      @clear="emit('update:modelValue', null)"
    >
      <template #label="{ value }">
        <span class="ai-model-selector__selected-label">{{ value }}</span>
      </template>

      <template #header>
        <div class="ai-model-selector__catalog-head">
          <div>
            <strong>模型目录</strong>
            <span>{{ sortedModels.length }} 个可选模型</span>
          </div>
          <span v-if="benchmarkCount">已测速 {{ benchmarkCount }} 个</span>
          <span v-else>输入关键词可快速筛选</span>
        </div>
      </template>

      <ElOption v-for="item in sortedModels" :key="item.id" :label="item.label" :value="item.id">
        <div class="ai-model-selector__option">
          <div class="ai-model-selector__option-main">
            <div class="ai-model-selector__option-title">
              <strong>{{ item.id }}</strong>
              <ElTag
                v-if="fastestModelId === item.id"
                size="small"
                type="success"
                effect="light"
                round
              >
                当前最快
              </ElTag>
            </div>
            <div class="ai-model-selector__option-meta">
              <span>{{ getOwnerLabel(item) }}</span>
              <i aria-hidden="true"></i>
              <span>{{ item.capability }}</span>
              <template v-if="item.parameterScale">
                <i aria-hidden="true"></i>
                <span>{{ item.parameterScale }}</span>
              </template>
              <ElTag size="small" :type="getProfileTagType(item.performanceProfile)" effect="plain">
                {{ getProfileLabel(item.performanceProfile) }}
              </ElTag>
            </div>
          </div>

          <div class="ai-model-selector__option-side" @mousedown.stop.prevent @click.stop>
            <div v-if="getBenchmark(item.id)" class="ai-model-selector__option-latency is-success">
              <span>首包延迟</span>
              <strong>{{ formatDurationMs(getBenchmark(item.id)?.firstResponseMs) }}</strong>
            </div>
            <div
              v-else-if="getBenchmarkError(item.id)"
              class="ai-model-selector__option-latency is-error"
            >
              <span>测速状态</span>
              <strong>失败</strong>
            </div>
            <ArtTooltip
              :content="
                item.benchmarkable
                  ? getBenchmarkError(item.id)
                    ? '上次测速失败，点击重试'
                    : '真实调用一次当前模型进行测速'
                  : '该模型不是对话生成模型，不能使用 /chat/completions 测速'
              "
              placement="left"
            >
              <ElButton
                type="primary"
                plain
                size="small"
                :disabled="!item.benchmarkable || Boolean(testingModelId)"
                :loading="testingModelId === item.id"
                @click.stop="requestBenchmark(item.id)"
              >
                {{ getBenchmarkError(item.id) ? '重试' : '测速' }}
              </ElButton>
            </ArtTooltip>
          </div>
        </div>
      </ElOption>

      <template #empty>
        <ArtPickerEmpty title="没有匹配的目录模型" description="可直接回车使用当前输入的模型 ID" />
      </template>
    </ElSelect>

    <section v-if="showDetails && modelValue" class="ai-model-selector__insight">
      <div class="ai-model-selector__insight-head">
        <div>
          <span>MODEL INSIGHT</span>
          <strong>{{ selectedCatalogModel?.capability || '自定义模型' }}</strong>
        </div>
        <ElButton
          type="primary"
          plain
          size="small"
          :disabled="!canBenchmarkSelected || Boolean(testingModelId)"
          :loading="testingModelId === modelValue"
          @click="requestBenchmark(modelValue)"
        >
          <ArtSvgIcon icon="ri:speed-up-line" />
          {{ selectedBenchmark || selectedBenchmarkError ? '重新测速' : '测试当前模型' }}
        </ElButton>
      </div>

      <p>
        {{
          selectedCatalogModel?.performanceHint ||
          '目录中没有该模型的能力元数据，可先测速，并结合真实任务验证质量。'
        }}
      </p>

      <div v-if="selectedCatalogModel" class="ai-model-selector__fit">
        <span>擅长</span>
        <ElTag
          v-for="strength in selectedCatalogModel.strengths"
          :key="strength"
          size="small"
          effect="light"
        >
          {{ strength }}
        </ElTag>
        <span>适合</span>
        <ElTag
          v-for="scene in selectedCatalogModel.recommendedFor"
          :key="scene"
          size="small"
          type="success"
          effect="light"
        >
          {{ scene }}
        </ElTag>
      </div>

      <div v-if="selectedBenchmark" class="ai-model-selector__metrics">
        <article>
          <span>连接耗时</span>
          <strong>{{ formatDurationMs(selectedBenchmark.connectionMs) }}</strong>
        </article>
        <article>
          <span>首包延迟</span>
          <strong>{{ formatDurationMs(selectedBenchmark.firstResponseMs) }}</strong>
        </article>
        <article>
          <span>总耗时</span>
          <strong>{{ formatDurationMs(selectedBenchmark.totalMs) }}</strong>
        </article>
        <article>
          <span>响应模式</span>
          <strong>{{ selectedBenchmark.streaming ? '流式' : '非流式' }}</strong>
        </article>
      </div>
      <div v-else-if="selectedBenchmarkError" class="ai-model-selector__benchmark-error">
        <ArtSvgIcon icon="ri:error-warning-line" />
        <div>
          <strong>测速未完成</strong>
          <span>{{ selectedBenchmarkError }}</span>
        </div>
      </div>
      <ArtEmptyState
        v-else
        title="尚未测速"
        description="点击“测试当前模型”获取当前线路的真实响应数据。"
        size="compact"
        :visual-size="60"
      />

      <small>
        能力说明基于模型命名和远端目录推断；测速会真实调用一次 /chat/completions，并消耗少量额度。
      </small>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { formatDurationMs } from '@/utils/ui/format'
  import type { TagProps } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'
  import type { AiModelBenchmark, AiProviderModel } from '@/api/ai-configuration'

  interface Props {
    modelValue?: string | null
    models?: AiProviderModel[]
    benchmarkResults?: Map<string, AiModelBenchmark>
    benchmarkErrors?: Map<string, string>
    testingModelId?: string | null
    loading?: boolean
    clearable?: boolean
    showDetails?: boolean
    placeholder?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    modelValue: null,
    models: () => [],
    benchmarkResults: () => new Map<string, AiModelBenchmark>(),
    benchmarkErrors: () => new Map<string, string>(),
    testingModelId: null,
    loading: false,
    clearable: true,
    showDetails: false,
    placeholder: '请选择或输入模型 ID'
  })
  const emit = defineEmits<{
    'update:modelValue': [value: string | null]
    benchmark: [modelId: string]
  }>()

  const benchmarkCount = computed(() => props.benchmarkResults?.size ?? 0)
  const selectedCatalogModel = computed(() =>
    props.models.find((item) => item.id === props.modelValue)
  )
  const selectedBenchmark = computed(() =>
    props.modelValue ? props.benchmarkResults.get(props.modelValue) : undefined
  )
  const selectedBenchmarkError = computed(() =>
    props.modelValue ? props.benchmarkErrors.get(props.modelValue) : undefined
  )
  const fastestModelId = computed(() => {
    let fastest: AiModelBenchmark | undefined
    for (const item of props.models) {
      const result = props.benchmarkResults.get(item.id)
      if (!result || (fastest && result.firstResponseMs >= fastest.firstResponseMs)) continue
      fastest = result
    }
    return fastest?.model ?? null
  })
  const sortedModels = computed(() =>
    [...props.models].sort((left, right) => {
      const leftBenchmark = props.benchmarkResults.get(left.id)
      const rightBenchmark = props.benchmarkResults.get(right.id)
      if (leftBenchmark && rightBenchmark) {
        return leftBenchmark.firstResponseMs - rightBenchmark.firstResponseMs
      }
      if (leftBenchmark) return -1
      if (rightBenchmark) return 1
      return left.id.localeCompare(right.id, 'en')
    })
  )
  const canBenchmarkSelected = computed(() => selectedCatalogModel.value?.benchmarkable !== false)

  function handleChange(value: unknown): void {
    emit('update:modelValue', typeof value === 'string' && value.trim() ? value.trim() : null)
  }

  function requestBenchmark(modelId: string | null): void {
    if (!modelId?.trim() || props.testingModelId) return
    emit('benchmark', modelId.trim())
  }

  function getBenchmark(modelId: string): AiModelBenchmark | undefined {
    return props.benchmarkResults.get(modelId)
  }

  function getBenchmarkError(modelId: string): string | undefined {
    return props.benchmarkErrors.get(modelId)
  }

  function getOwnerLabel(model: AiProviderModel): string {
    const labelOwner = model.label.split('·')[1]?.trim()
    return labelOwner || model.ownedBy?.trim() || model.id.split('/')[0] || '远端服务'
  }

  function getProfileLabel(profile: AiProviderModel['performanceProfile']): string {
    const labels: Record<AiProviderModel['performanceProfile'], string> = {
      speed: '低延迟倾向',
      balanced: '均衡',
      quality: '质量优先',
      specialized: '专用模型',
      unknown: '待验证'
    }
    return labels[profile]
  }

  function getProfileTagType(profile: AiProviderModel['performanceProfile']): TagProps['type'] {
    const typeMap: Record<AiProviderModel['performanceProfile'], TagProps['type']> = {
      speed: 'success',
      balanced: 'primary',
      quality: 'warning',
      specialized: 'info',
      unknown: 'info'
    }
    return typeMap[profile]
  }
</script>

<style scoped lang="scss">
  .ai-model-selector {
    display: grid;
    gap: 10px;
    width: 100%;
    min-width: 0;

    :deep(.el-select) {
      width: 100%;
    }

    &__selected-label {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__option {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;
      padding: 8px 2px;
      line-height: 1.4;
    }

    &__option-main {
      display: grid;
      flex: 1;
      gap: 5px;
      min-width: 0;
    }

    &__option-title,
    &__option-meta,
    &__fit,
    &__insight-head {
      display: flex;
      align-items: center;
    }

    &__option-title {
      gap: 8px;
      min-width: 0;

      strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__option-meta {
      gap: 6px;
      min-width: 0;
      overflow: hidden;

      > span {
        flex-shrink: 0;
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      > i {
        width: 3px;
        height: 3px;
        background: var(--el-text-color-placeholder);
        border-radius: 50%;
      }

      > .el-tag {
        flex-shrink: 0;
        margin-left: 2px;
      }
    }

    &__option-side {
      display: flex;
      flex-shrink: 0;
      gap: 10px;
      align-items: center;

      .el-button {
        min-width: 56px;
      }
    }

    &__option-latency {
      display: grid;
      gap: 1px;
      width: 66px;
      text-align: right;

      span {
        font-size: 9px;
        color: var(--el-text-color-placeholder);
      }

      strong {
        font-size: 11px;
        font-weight: 600;
      }

      &.is-success strong {
        color: var(--el-color-success);
      }

      &.is-error strong {
        color: var(--el-color-danger);
      }
    }

    &__catalog-head {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 2px 4px;

      > div {
        display: flex;
        gap: 8px;
        align-items: baseline;
        min-width: 0;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__insight {
      display: grid;
      gap: 10px;
      min-width: 0;
      padding: 13px 14px;
      background: color-mix(in srgb, var(--el-fill-color-light) 88%, var(--theme-color));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      p,
      small {
        margin: 0;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }

      p {
        font-size: 12px;
      }

      small {
        font-size: 11px;
      }
    }

    &__insight-head {
      gap: 12px;
      justify-content: space-between;

      > div {
        display: grid;
        gap: 2px;

        span {
          font-size: 9px;
          font-weight: 700;
          color: var(--el-color-primary);
          letter-spacing: 0.12em;
        }

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }
      }
    }

    &__fit {
      flex-wrap: wrap;
      gap: 5px;

      > span {
        margin-right: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;

      article {
        display: grid;
        gap: 3px;
        min-width: 0;
        padding: 8px 10px;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-small);

        span {
          font-size: 10px;
          color: var(--el-text-color-secondary);
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 13px;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }
      }
    }

    &__benchmark-error {
      display: flex;
      gap: 7px;
      align-items: center;
      padding: 9px 10px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
      background: var(--el-bg-color);
      border: 1px dashed var(--el-border-color);
      border-radius: var(--el-border-radius-small);

      svg {
        flex-shrink: 0;
        font-size: 15px;
        color: var(--el-color-primary);
      }
    }

    &__benchmark-error {
      background: var(--el-color-danger-light-9);
      border-color: var(--el-color-danger-light-7);
      border-style: solid;

      > svg {
        font-size: 17px;
        color: var(--el-color-danger);
      }

      > div {
        display: grid;
        gap: 2px;
        min-width: 0;

        strong {
          font-size: 11px;
          color: var(--el-color-danger);
        }

        span {
          line-height: 1.45;
          overflow-wrap: anywhere;
        }
      }
    }

    @media (width <= 680px) {
      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__insight-head {
        align-items: flex-start;
      }

      &__option-latency {
        display: none;
      }
    }
  }
</style>

<style lang="scss">
  .ai-model-select-popper {
    max-width: calc(100vw - 32px);

    .el-select-dropdown__header {
      padding: 8px 10px;
      background: var(--el-fill-color-lighter);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

    .el-select-dropdown__wrap {
      max-height: 216px;
    }

    .el-select-dropdown__item {
      height: auto;
      min-height: 72px;
      padding: 2px 12px;
      line-height: 1.4;

      &.is-hovering,
      &.is-selected {
        background: color-mix(in srgb, var(--theme-color) 8%, var(--el-bg-color));
      }
    }
  }

  [data-box-mode='border-mode'] .ai-model-select-popper .el-select-dropdown__item.is-selected {
    box-shadow: inset 3px 0 0 var(--theme-color);
  }

  [data-box-mode='shadow-mode'] .ai-model-select-popper .el-select-dropdown__item.is-selected {
    box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-color) 18%, transparent);
  }
</style>
