<template>
  <article
    :class="{ 'is-processing': isPending }"
    class="ai-planner__suggestion art-card-xs"
    :aria-busy="isPending"
  >
    <ArtOverlayLoading
      v-if="isPending"
      loading
      overlay
      size="compact"
      text="正在更新建议…"
      description=""
    />
    <header>
      <div class="ai-planner__rank">{{ displayIndex + 1 }}</div>
      <div class="ai-planner__title">
        <div>
          <ElTag :type="categoryTagType" effect="light">{{ categoryLabel }}</ElTag>
          <ElTag :type="statusTagType" effect="plain">{{ statusLabel }}</ElTag>
        </div>
        <h2>{{ suggestion.title }}</h2>
        <p>{{ suggestion.summary }}</p>
      </div>
      <div class="ai-planner__scores">
        <span>
          <ArtSvgIcon icon="ri:bar-chart-box-line" />
          影响 <strong>{{ suggestion.impact }}/5</strong>
        </span>
        <span>
          <ArtSvgIcon icon="ri:time-line" />
          工作量 <strong>{{ effortLabel }}</strong>
        </span>
        <span>
          <ArtSvgIcon icon="ri:shield-check-line" />
          置信度 <strong>{{ Math.round(suggestion.confidence * 100) }}%</strong>
        </span>
      </div>
    </header>

    <div class="ai-planner__context">
      <div class="is-opportunity">
        <span class="art-icon-label"><ArtSvgIcon icon="ri:flashlight-line" />为什么现在做</span>
        <p>{{ suggestion.whyNow }}</p>
      </div>
      <div class="is-evidence">
        <span class="art-icon-label"><ArtSvgIcon icon="ri:code-box-line" />项目证据</span>
        <ul>
          <li v-for="item in suggestion.evidence" :key="`${item.path}-${item.fact}`">
            <code>{{ item.path }}</code> {{ item.fact }}
          </li>
        </ul>
      </div>
      <div class="is-risk">
        <span class="art-icon-label"><ArtSvgIcon icon="ri:error-warning-line" />主要风险</span>
        <p>{{ suggestion.risk }}</p>
      </div>
    </div>

    <ElCollapse class="ai-planner__collapse" @change="emit('expand', suggestion, $event)">
      <ElCollapseItem name="prompt">
        <template #title>
          <span class="ai-planner__prompt-toggle">
            <ArtSvgIcon icon="ri:terminal-box-line" />
            查看可复制的 Codex 提示词
            <small>{{ suggestion.acceptanceCriteria.length }} 项验收标准</small>
          </span>
        </template>
        <ElScrollbar max-height="460px" class="ai-planner__prompt-scroll">
          <pre>{{ suggestion.prompt }}</pre>
        </ElScrollbar>
        <div class="ai-planner__criteria">
          <strong>验收标准</strong>
          <ol>
            <li v-for="item in suggestion.acceptanceCriteria" :key="item">{{ item }}</li>
          </ol>
        </div>
      </ElCollapseItem>
    </ElCollapse>

    <footer>
      <div class="ai-planner__action-group">
        <span class="ai-planner__action-label">反馈与复用</span>
        <div class="ai-planner__feedback">
          <ArtTooltip content="复制完整提示词">
            <ElButton
              :loading="isActionPending('copied')"
              :disabled="isPending"
              @click="emit('copy', suggestion)"
            >
              <ArtSvgIcon icon="ri:file-copy-line" />
              复制{{ suggestion.feedback.copied ? ` · ${suggestion.feedback.copied}` : '' }}
            </ElButton>
          </ArtTooltip>
          <ElButton
            :type="suggestion.feedback.sentiment === 1 ? 'success' : ''"
            :loading="isActionPending('liked')"
            :disabled="isPending"
            @click="emit('feedback', suggestion, 'liked')"
          >
            <ArtSvgIcon icon="ri:thumb-up-line" />
            有帮助
          </ElButton>
          <ElDropdown trigger="click" :disabled="isPending" @command="handleDislike">
            <ElButton
              :type="suggestion.feedback.sentiment === -1 ? 'danger' : ''"
              :loading="isActionPending('disliked')"
              :disabled="isPending"
            >
              <ArtSvgIcon icon="ri:thumb-down-line" />
              不合适
            </ElButton>
            <template #dropdown>
              <ElDropdownMenu>
                <ElDropdownItem
                  v-for="item in feedbackReasonOptions"
                  :key="String(item.value)"
                  :command="item.value"
                >
                  {{ item.label }}
                </ElDropdownItem>
              </ElDropdownMenu>
            </template>
          </ElDropdown>
        </div>
      </div>

      <div v-if="canManageWorkflow" class="ai-planner__action-group is-workflow">
        <span class="ai-planner__action-label">推进决策</span>
        <div class="ai-planner__workflow">
          <ElButton
            v-if="suggestion.status === 'active'"
            v-auth="'System:AiProjectPlanner:ManageWorkflow'"
            :loading="isActionPending('dismissed')"
            :disabled="isPending"
            @click="emit('workflow', suggestion, 'dismissed')"
          >
            <ArtSvgIcon icon="ri:inbox-archive-line" />
            暂不考虑
          </ElButton>
          <ElButton
            v-if="suggestion.status === 'active'"
            v-auth="'System:AiProjectPlanner:ManageWorkflow'"
            type="primary"
            :loading="isActionPending('accepted')"
            :disabled="isPending"
            @click="emit('workflow', suggestion, 'accepted')"
          >
            <ArtSvgIcon icon="ri:check-line" />
            采纳
          </ElButton>
          <ElButton
            v-if="suggestion.status === 'active' || suggestion.status === 'accepted'"
            v-auth="'System:AiProjectPlanner:ManageWorkflow'"
            type="success"
            :loading="isActionPending('completed')"
            :disabled="isPending"
            @click="emit('workflow', suggestion, 'completed')"
          >
            <ArtSvgIcon icon="ri:verified-badge-line" />
            标记完成
          </ElButton>
          <div v-if="suggestion.status === 'dismissed'" class="ai-planner__status-note">
            <ArtSvgIcon icon="ri:inbox-archive-line" />已暂不考虑
          </div>
          <ElButton
            v-if="suggestion.status === 'dismissed'"
            v-auth="'System:AiProjectPlanner:ManageWorkflow'"
            type="primary"
            plain
            :loading="isActionPending('restored')"
            :disabled="isPending"
            @click="emit('workflow', suggestion, 'restored')"
          >
            <ArtSvgIcon icon="ri:arrow-go-back-line" />
            恢复评估
          </ElButton>
          <div
            v-else-if="suggestion.status === 'completed'"
            class="ai-planner__status-note is-completed"
          >
            <ArtSvgIcon icon="ri:verified-badge-line" />已完成
          </div>
        </div>
      </div>

      <div v-else class="ai-planner__read-only-note">
        <ArtSvgIcon icon="ri:shield-check-line" />
        <span>只读模式：可查看、反馈和复制建议；建议状态由管理员推进</span>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
  import type { DictMap } from '@/types/store'
  import type { AiProjectSuggestion, AiSuggestionEventType } from '@/types/ai-project-planner'
  import {
    getProjectPlannerDictLabel,
    getProjectPlannerDictTagType,
    type SuggestionPendingAction
  } from './project-planner-view-model'

  type WorkflowEvent = Extract<
    AiSuggestionEventType,
    'accepted' | 'completed' | 'dismissed' | 'restored'
  >

  interface Props {
    suggestion: AiProjectSuggestion
    displayIndex: number
    pendingAction?: SuggestionPendingAction
    canManageWorkflow: boolean
    dictMap: DictMap
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{
    copy: [suggestion: AiProjectSuggestion]
    feedback: [suggestion: AiProjectSuggestion, eventType: 'liked' | 'disliked', reason?: string]
    workflow: [suggestion: AiProjectSuggestion, eventType: WorkflowEvent]
    expand: [suggestion: AiProjectSuggestion, names: unknown]
  }>()

  const isPending = computed(() => Boolean(props.pendingAction))
  const categoryLabel = computed(() =>
    getProjectPlannerDictLabel(props.dictMap, 'aiSuggestionCategory', props.suggestion.category)
  )
  const categoryTagType = computed(() =>
    getProjectPlannerDictTagType(props.dictMap, 'aiSuggestionCategory', props.suggestion.category)
  )
  const statusLabel = computed(() =>
    getProjectPlannerDictLabel(props.dictMap, 'aiSuggestionStatus', props.suggestion.status)
  )
  const statusTagType = computed(() =>
    getProjectPlannerDictTagType(props.dictMap, 'aiSuggestionStatus', props.suggestion.status)
  )
  const effortLabel = computed(() =>
    getProjectPlannerDictLabel(props.dictMap, 'aiSuggestionEffort', props.suggestion.effort)
  )
  const feedbackReasonOptions = computed(() => props.dictMap.aiSuggestionFeedbackReason ?? [])

  function isActionPending(action: SuggestionPendingAction): boolean {
    return props.pendingAction === action
  }

  function handleDislike(reason: unknown): void {
    emit('feedback', props.suggestion, 'disliked', String(reason))
  }
</script>

<style scoped lang="scss">
  .ai-planner {
    &__suggestion {
      position: relative;
      padding: 20px;
      overflow: hidden;
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;

      & + & {
        margin-top: 16px;
      }

      &:hover:not(.is-processing) {
        box-shadow: var(--el-box-shadow-light);
        transform: translateY(-1px);
      }

      &.is-processing {
        box-shadow: 0 0 0 1px var(--el-color-primary-light-7);
      }

      header {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) auto;
        gap: 14px;
      }

      footer {
        display: flex;
        gap: 16px;
        align-items: flex-end;
        justify-content: space-between;
        padding: 15px 20px 16px;
        margin: 14px -20px -20px;
        background: color-mix(in srgb, var(--default-box-color) 96%, var(--el-color-primary));
        border-top: 1px solid var(--el-border-color-lighter);
      }
    }

    &__rank {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      font-weight: 700;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: 50%;
    }

    &__title {
      min-width: 0;

      > div {
        display: flex;
        gap: 6px;
      }

      h2 {
        margin: 9px 0 5px;
        font-size: 18px;
        color: var(--el-text-color-primary);
      }

      p {
        line-height: 1.7;
        color: var(--el-text-color-secondary);
      }
    }

    &__scores {
      display: flex;
      gap: 8px;
      align-items: flex-start;

      span {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        padding: 6px 9px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        background: var(--default-box-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: 999px;

        :deep(svg) {
          width: 14px;
          height: 14px;
          color: var(--el-color-primary);
        }
      }

      strong {
        color: var(--el-text-color-primary);
      }
    }

    &__context {
      display: grid;
      grid-template-columns: 1fr 1.4fr 1fr;
      gap: 10px;
      margin: 18px 0 6px 48px;

      > div {
        position: relative;
        min-width: 0;
        padding: 14px 15px;
        background: color-mix(in srgb, var(--default-box-color) 97%, var(--el-color-primary));
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);

        &.is-opportunity {
          border-top-color: var(--el-color-primary-light-5);
        }

        &.is-evidence {
          border-top-color: var(--el-color-success-light-5);
        }

        &.is-risk {
          border-top-color: var(--el-color-warning-light-5);
        }
      }

      span {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        font-size: 12px;
        font-weight: 700;
        color: var(--el-text-color-secondary);

        :deep(svg) {
          width: 15px;
          height: 15px;
          color: var(--el-color-primary);
        }
      }

      p,
      ul {
        margin: 7px 0 0;
        line-height: 1.65;
        color: var(--el-text-color-regular);
      }

      ul {
        padding-left: 18px;

        li + li {
          margin-top: 6px;
        }
      }

      code {
        color: var(--el-color-primary);
        overflow-wrap: anywhere;
      }
    }

    &__collapse {
      margin: 4px 0 0 48px;
      border-bottom: 0;

      :deep(.el-collapse-item__header) {
        height: 48px;
        color: var(--el-color-primary);
        border-bottom-color: var(--el-border-color-lighter);
      }

      :deep(.el-collapse-item__wrap) {
        border-bottom: 0;
      }

      pre {
        min-height: 100%;
        padding: 16px;
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        line-height: 1.7;
        color: var(--el-text-color-primary);
        white-space: pre-wrap;
        background: var(--default-box-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);
      }
    }

    &__prompt-toggle {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      font-weight: 600;

      :deep(svg) {
        width: 16px;
        height: 16px;
      }

      small {
        padding: 2px 7px;
        font-size: 11px;
        font-weight: 500;
        color: var(--el-text-color-secondary);
        background: var(--default-box-color);
        border-radius: 999px;
      }
    }

    &__prompt-scroll {
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      pre {
        border: 0;
        border-radius: 0;
      }
    }

    &__criteria {
      margin-top: 14px;
      color: var(--el-text-color-regular);

      ol {
        padding-left: 22px;
        margin: 8px 0 0;
        line-height: 1.8;
      }
    }

    &__action-group {
      display: grid;
      gap: 7px;

      &.is-workflow {
        justify-items: end;
      }
    }

    &__action-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--el-text-color-secondary);
      letter-spacing: 0.04em;
    }

    &__feedback,
    &__workflow {
      display: flex;
      gap: 8px;
      align-items: center;

      :deep(.el-button + .el-button) {
        margin-left: 0;
      }
    }

    &__workflow {
      justify-content: flex-end;
    }

    &__status-note {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 32px;
      padding: 0 11px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      &.is-completed {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      :deep(svg) {
        width: 15px;
        height: 15px;
      }
    }

    &__read-only-note {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      align-self: flex-end;
      max-width: 360px;
      padding: 8px 11px;
      font-size: 12px;
      line-height: 1.5;
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: var(--el-border-radius-base);

      :deep(svg) {
        flex: 0 0 auto;
        width: 15px;
        height: 15px;
      }
    }
  }

  @media (width <= 1100px) {
    .ai-planner {
      &__suggestion footer {
        flex-direction: column;
        align-items: flex-start;
      }

      &__context {
        grid-template-columns: 1fr;
      }

      &__action-group {
        width: 100%;

        &.is-workflow {
          justify-items: start;
        }
      }

      &__read-only-note {
        align-self: flex-start;
        max-width: 100%;
      }

      &__suggestion header {
        grid-template-columns: 34px minmax(0, 1fr);
      }

      &__scores {
        grid-column: 2;
      }
    }
  }

  @media (width <= 680px) {
    .ai-planner {
      &__workflow {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }

      &__context,
      &__collapse {
        margin-left: 0;
      }

      &__scores,
      &__feedback {
        flex-wrap: wrap;
      }
    }
  }
</style>
