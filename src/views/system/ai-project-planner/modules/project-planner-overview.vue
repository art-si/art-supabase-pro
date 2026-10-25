<template>
  <BusinessWorkspaceHeader
    eyebrow="PROJECT NEXT STEP"
    title="AI 项目规划台"
    description="结合当前代码、Supabase 能力与历史反馈，生成可直接交给 Codex 的下一步提示词。"
    icon="ri:compass-3-line"
    :tags="workspaceTags"
    :metrics="workspaceMetrics"
  >
    <template #actions>
      <div class="ai-planner__controls">
        <ElSelect v-model="focus" class="ai-planner__select" placeholder="关注方向">
          <ElOption label="综合平衡" value="balanced" />
          <ElOption
            v-for="item in categoryOptions"
            :key="String(item.value)"
            :label="String(item.label)"
            :value="String(item.value)"
          />
        </ElSelect>
        <ElSelect v-model="effort" class="ai-planner__select" placeholder="工作量">
          <ElOption
            v-for="item in effortOptions"
            :key="String(item.value)"
            :label="String(item.label)"
            :value="String(item.value)"
          />
        </ElSelect>
        <ElButton
          type="primary"
          :loading="generating"
          :disabled="capabilities !== null && !capabilities.providerConfigured"
          @click="emit('generate')"
        >
          <ArtSvgIcon icon="ri:sparkling-2-line" />
          生成下一步
        </ElButton>
      </div>
    </template>
  </BusinessWorkspaceHeader>

  <ElAlert
    v-if="capabilities && !capabilities.providerConfigured"
    class="ai-planner__alert"
    title="尚未配置 AI 模型服务"
    description="请在 Supabase Edge Function Secrets 中设置 AI_API_KEY、AI_BASE_URL 和 AI_MODEL。密钥只保存在服务端，不会进入浏览器或数据库。"
    type="warning"
    show-icon
    :closable="false"
  />

  <section v-if="prioritySuggestion" class="ai-planner__priority art-card-xs">
    <div class="ai-planner__priority-main">
      <div class="ai-planner__priority-icon"><ArtSvgIcon icon="ri:focus-3-line" /></div>
      <div>
        <span class="ai-planner__priority-eyebrow">AI PRIORITY</span>
        <strong>建议优先推进：{{ prioritySuggestion.title }}</strong>
        <p>{{ prioritySuggestion.summary }}</p>
      </div>
    </div>
    <div class="ai-planner__priority-score">
      <div>
        <span>影响力</span>
        <strong>{{ prioritySuggestion.impact }}/5</strong>
      </div>
      <div>
        <span>置信度</span>
        <strong>{{ Math.round(prioritySuggestion.confidence * 100) }}%</strong>
      </div>
      <div>
        <span>投入</span>
        <strong>{{ effortLabel }}</strong>
      </div>
    </div>
    <div class="ai-planner__priority-actions">
      <ElButton
        :loading="pendingAction === 'copied'"
        :disabled="Boolean(pendingAction)"
        @click="emit('copy', prioritySuggestion)"
      >
        <ArtSvgIcon icon="ri:file-copy-line" />复制 Prompt
      </ElButton>
      <ElButton
        v-if="canManageWorkflow"
        v-auth="'System:AiProjectPlanner:ManageWorkflow'"
        type="primary"
        :loading="pendingAction === 'accepted'"
        :disabled="Boolean(pendingAction)"
        @click="emit('accept', prioritySuggestion)"
      >
        <ArtSvgIcon icon="ri:check-line" />采纳优先建议
      </ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import type { DictMap } from '@/types/store'
  import type {
    AiPlannerCapabilities,
    AiPlannerEffort,
    AiProjectSuggestion,
    AiSuggestionCategory
  } from '@/types/ai-project-planner'
  import {
    getProjectPlannerDictLabel,
    type ProjectPlannerMetric,
    type SuggestionPendingAction
  } from './project-planner-view-model'

  interface Props {
    capabilities: AiPlannerCapabilities | null
    canManageWorkflow: boolean
    generating: boolean
    prioritySuggestion?: AiProjectSuggestion
    pendingAction?: SuggestionPendingAction
    metrics: ProjectPlannerMetric[]
    dictMap: DictMap
  }

  const props = defineProps<Props>()
  const focus = defineModel<'balanced' | AiSuggestionCategory>('focus', { required: true })
  const effort = defineModel<AiPlannerEffort>('effort', { required: true })
  const emit = defineEmits<{
    generate: []
    copy: [suggestion: AiProjectSuggestion]
    accept: [suggestion: AiProjectSuggestion]
  }>()

  const categoryOptions = computed(() => props.dictMap.aiSuggestionCategory ?? [])
  const effortOptions = computed(() => props.dictMap.aiSuggestionEffort ?? [])
  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    {
      label: props.canManageWorkflow
        ? '管理员规划模式 · 可推进建议状态'
        : '普通用户只读分析 · 不修改业务数据',
      type: props.canManageWorkflow ? 'primary' : 'success',
      effect: 'light'
    }
  ])
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() =>
    props.metrics.map((metric) => ({
      label: metric.label,
      value: metric.value,
      description: metric.hint,
      icon: metric.icon,
      tone: metric.tone
    }))
  )
  const effortLabel = computed(() =>
    props.prioritySuggestion
      ? getProjectPlannerDictLabel(
          props.dictMap,
          'aiSuggestionEffort',
          props.prioritySuggestion.effort
        )
      : '—'
  )
</script>

<style scoped lang="scss">
  .ai-planner {
    &__controls {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    &__select {
      width: 142px;
    }

    &__alert {
      margin: 0;
    }

    &__priority {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      gap: 24px;
      align-items: center;
      padding: 18px 20px;
      background:
        radial-gradient(circle at 78% 0%, rgb(99 102 241 / 10%), transparent 34%),
        linear-gradient(110deg, var(--el-color-primary-light-9), var(--default-box-color) 46%);
      border-color: var(--el-color-primary-light-8);
    }

    &__priority-main,
    &__priority-score,
    &__priority-actions {
      display: flex;
      align-items: center;
    }

    &__priority-main {
      min-width: 0;

      > div:last-child {
        min-width: 0;
      }

      strong,
      p,
      span {
        display: block;
      }

      strong {
        margin: 2px 0 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 15px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      p {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__priority-icon {
      display: grid;
      flex: 0 0 42px;
      place-items: center;
      width: 42px;
      height: 42px;
      margin-right: 13px;
      color: white;
      background: linear-gradient(145deg, var(--el-color-primary), #7c3aed);
      border-radius: var(--el-border-radius-base);

      :deep(svg) {
        width: 21px;
        height: 21px;
      }
    }

    &__priority-eyebrow {
      font-size: 10px;
      font-weight: 700;
      color: var(--el-color-primary);
      letter-spacing: 0.12em;
    }

    &__priority-score {
      gap: 18px;

      > div {
        display: grid;
        gap: 2px;
        min-width: 54px;
      }

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }
    }

    &__priority-actions {
      gap: 8px;

      :deep(.el-button + .el-button) {
        margin-left: 0;
      }
    }
  }

  @media (width <= 1100px) {
    .ai-planner {
      &__priority {
        grid-template-columns: minmax(0, 1fr);
        gap: 14px;
      }
    }
  }

  @media (width <= 680px) {
    .ai-planner {
      &__controls,
      &__priority-actions {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }

      &__select {
        width: 100%;
      }

      &__priority-score {
        flex-wrap: wrap;
      }
    }
  }
</style>
