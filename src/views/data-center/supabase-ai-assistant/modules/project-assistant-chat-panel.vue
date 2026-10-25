<template>
  <aside class="project-assistant__chat art-card-xs">
    <div class="project-assistant__panel-title project-assistant__chat-header">
      <div class="project-assistant__assistant-heading">
        <span class="project-assistant__assistant-avatar">
          <ArtSvgIcon icon="ri:sparkling-2-fill" />
        </span>
        <span>
          <strong>项目助手</strong>
          <small>
            <i :class="{ 'is-offline': !assistantStatus.online }"></i>
            {{ assistantStatusLabel }}
          </small>
        </span>
      </div>
      <div class="project-assistant__chat-actions">
        <ArtTooltip content="会话历史" placement="bottom">
          <ArtIconButton icon="ri:history-line" label="会话历史" @click="emit('open-history')" />
        </ArtTooltip>
        <ArtTooltip content="导出当前会话" placement="bottom">
          <ArtIconButton
            icon="ri:download-2-line"
            label="导出当前会话"
            :disabled="!chat.messages.length"
            @click="emit('export-conversation')"
          />
        </ArtTooltip>
        <ElButton text type="primary" @click="emit('reset')">
          <ArtSvgIcon icon="ri:chat-new-line" /> 新对话
        </ElButton>
      </div>
    </div>

    <div v-if="activeChatObject" class="project-assistant__chat-context">
      <ArtSvgIcon :icon="getObjectIcon(activeChatObject.objectType)" />
      <span>正在分析</span>
      <strong>{{ activeChatObject.schemaName }}.{{ activeChatObject.objectName }}</strong>
      <ArtTooltip :content="chat.contextLocked ? '解除上下文锁定' : '锁定当前对象上下文'">
        <ArtIconButton
          class="size-6.5! text-base!"
          :class="{ 'is-active': chat.contextLocked }"
          :icon="chat.contextLocked ? 'ri:pushpin-fill' : 'ri:pushpin-line'"
          :label="chat.contextLocked ? '解除上下文锁定' : '锁定当前对象上下文'"
          @click="emit('toggle-context')"
        />
      </ArtTooltip>
    </div>

    <ElScrollbar ref="chatScrollbarRef" class="project-assistant__messages">
      <div v-if="!chat.messages.length" class="project-assistant__chat-welcome">
        <div class="project-assistant__welcome-mark">
          <span><ArtSvgIcon icon="ri:sparkling-2-fill" /></span>
        </div>
        <small>PROJECT INTELLIGENCE</small>
        <h3>询问这个 Supabase 项目</h3>
        <p>
          {{
            assistantMode === 'controlled_write'
              ? '超级管理员受控变更已开启；执行前仍需明确确认，并记录完整审计。'
              : '基于项目实时元数据提供分析建议，全程只读，不执行 SQL 或修改项目。'
          }}
        </p>
        <ElButton
          v-for="suggestion in chatSuggestions"
          :key="suggestion"
          text
          @click="emit('suggest', suggestion)"
        >
          <span>{{ suggestion }}</span>
          <ArtSvgIcon icon="ri:arrow-right-up-line" />
        </ElButton>
      </div>

      <article
        v-for="message in chat.messages"
        :key="message.id"
        :class="['project-assistant__message', `is-${message.role}`]"
      >
        <span>
          <ArtSvgIcon
            :icon="message.role === 'assistant' ? 'ri:sparkling-2-fill' : 'ri:user-3-line'"
          />
        </span>
        <div>
          <div class="project-assistant__message-content">{{ message.content }}</div>
          <div
            v-if="message.role === 'assistant' && (message.runId || message.tools?.length)"
            class="project-assistant__message-trace"
          >
            <span v-if="message.model">{{ message.model }}</span>
            <span v-if="message.latencyMs != null">{{ formatDurationMs(message.latencyMs) }}</span>
            <span v-if="message.usage">
              {{ (message.usage.inputTokens || 0) + (message.usage.outputTokens || 0) }} tokens
            </span>
            <ElTag
              v-for="tool in message.tools"
              :key="`${message.id}:${tool.name}`"
              size="small"
              :type="tool.status === 'succeeded' ? 'success' : 'danger'"
              effect="plain"
            >
              {{ getToolLabel(tool.name) }}
            </ElTag>
          </div>
          <div v-if="message.role === 'assistant'" class="project-assistant__message-actions">
            <ElButton text size="small" @click="emit('copy-message', message.content)">
              <ArtSvgIcon icon="ri:file-copy-line" /> 复制
            </ElButton>
            <ElButton text size="small" @click="emit('retry-message', message.id)">
              <ArtSvgIcon icon="ri:refresh-line" /> 重试
            </ElButton>
            <ArtAiFeedback
              v-if="message.runId"
              :run-id="message.runId"
              context-label="Supabase AI 项目助手"
              compact
              @submitted="emit('feedback', message, $event.rating)"
            />
          </div>
        </div>
      </article>

      <article v-if="chat.sending" class="project-assistant__message is-assistant">
        <span><ArtSvgIcon icon="ri:sparkling-2-fill" /></span>
        <div class="project-assistant__typing">
          <i></i><i></i><i></i>
          <small>{{ chatPhase }} · {{ formatDurationMs(chat.elapsedMs) }}</small>
        </div>
      </article>
    </ElScrollbar>

    <footer class="project-assistant__composer">
      <ElScrollbar v-if="chat.messages.length" class="project-assistant__quick-scrollbar">
        <div class="project-assistant__quick-actions">
          <button
            v-for="action in quickActions"
            :key="action.label"
            type="button"
            :disabled="chat.sending"
            @click="emit('suggest', action.prompt)"
          >
            <ArtSvgIcon :icon="action.icon" /> {{ action.label }}
          </button>
        </div>
      </ElScrollbar>
      <div class="project-assistant__composer-box">
        <ElInput
          :model-value="chat.input"
          type="textarea"
          resize="none"
          :autosize="{ minRows: 3, maxRows: 6 }"
          maxlength="4000"
          placeholder="向项目助手提问…"
          @update:model-value="emit('update-input', $event)"
          @keydown.enter.exact.prevent="emit('send')"
        />
        <div>
          <button
            v-if="canUseControlledWrite"
            type="button"
            class="project-assistant__safety-toggle"
            :class="{ 'is-write-mode': assistantMode === 'controlled_write' }"
            @click="emit('toggle-mode')"
          >
            <ArtSvgIcon
              :icon="
                assistantMode === 'controlled_write' ? 'ri:admin-fill' : 'ri:shield-check-line'
              "
            />
            {{ assistantMode === 'controlled_write' ? '受控变更模式' : '只读安全模式' }}
          </button>
          <span class="art-icon-label" v-else
            ><ArtSvgIcon icon="ri:shield-check-line" /> 只读安全模式</span
          >
          <span class="project-assistant__send-actions">
            <small>Enter 发送</small>
            <ArtIconButton
              class="project-assistant__send-button"
              :icon="chat.sending ? 'ri:stop-fill' : 'ri:arrow-up-line'"
              :tone="chat.sending ? 'danger' : 'theme'"
              variant="solid"
              :disabled="!chat.sending && !chat.input.trim()"
              :label="chat.sending ? '停止等待' : '发送消息'"
              @click="handlePrimaryAction"
            />
          </span>
        </div>
      </div>
    </footer>
  </aside>
</template>

<script setup lang="ts">
  import type { ScrollbarInstance } from 'element-plus'
  import { formatDurationMs } from '@/utils/ui/format'
  import ArtAiFeedback from '@/components/core/base/art-ai-feedback/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type {
    ProjectAssistantSafetyMode,
    ProjectDatabaseObject
  } from '@/types/supabase-ai-assistant'
  import {
    getProjectAssistantToolLabel as getToolLabel,
    getProjectObjectIcon as getObjectIcon,
    type ProjectAssistantChatMessage,
    type ProjectAssistantStatusState
  } from './project-assistant-presenter'
  import type { ProjectAssistantChatState } from './use-project-assistant-chat'

  interface QuickAction {
    label: string
    icon: string
    prompt: string
  }

  interface Props {
    chat: ProjectAssistantChatState
    activeChatObject: ProjectDatabaseObject | null
    assistantStatus: ProjectAssistantStatusState
    assistantStatusLabel: string
    assistantMode: ProjectAssistantSafetyMode
    canUseControlledWrite: boolean
    chatPhase: string
    chatSuggestions: string[]
    quickActions: QuickAction[]
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{
    'open-history': []
    'export-conversation': []
    reset: []
    'toggle-context': []
    suggest: [prompt: string]
    'copy-message': [content: string]
    'retry-message': [messageId: string]
    feedback: [message: ProjectAssistantChatMessage, rating: -1 | 1]
    'update-input': [value: string]
    'toggle-mode': []
    send: []
    stop: []
  }>()
  const chatScrollbarRef = ref<ScrollbarInstance>()

  function scrollToBottom(): void {
    nextTick(() => chatScrollbarRef.value?.setScrollTop(Number.MAX_SAFE_INTEGER))
  }

  function handlePrimaryAction(): void {
    if (props.chat.sending) emit('stop')
    else emit('send')
  }

  defineExpose({ scrollToBottom })
</script>

<style scoped lang="scss">
  .project-assistant {
    &__chat {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background:
        linear-gradient(180deg, var(--el-color-primary-light-9), transparent 110px),
        var(--default-box-color);
    }

    &__panel-title {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      min-height: 62px;
      padding: 12px 15px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      strong,
      small {
        display: block;
      }

      small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__chat-header {
      min-height: 68px;
      background: rgb(255 255 255 / 38%);
      backdrop-filter: blur(10px);
    }

    &__assistant-heading {
      display: flex;
      gap: 10px;
      align-items: center;

      > span:last-child {
        min-width: 0;
      }

      small {
        display: flex;
        gap: 5px;
        align-items: center;

        i {
          box-sizing: content-box;
          width: 7px;
          height: 7px;
          background: var(--el-color-success);
          border: 2px solid var(--el-color-success-light-8);
          border-radius: 50%;

          &.is-offline {
            background: var(--el-color-warning);
            border-color: var(--el-color-warning-light-8);
          }
        }
      }
    }

    &__assistant-avatar {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: white;
      background: linear-gradient(145deg, var(--el-color-primary-light-3), var(--el-color-primary));
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 8px 18px rgb(64 128 255 / 24%);
    }

    &__chat-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 2px;
      align-items: center;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    &__chat-context {
      display: flex;
      flex: 0 0 auto;
      gap: 6px;
      align-items: center;
      min-width: 0;
      padding: 8px 14px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-extra-light);
      border-bottom: 1px solid var(--el-border-color-extra-light);

      > svg {
        flex: 0 0 auto;
        color: var(--el-color-primary);
      }

      strong {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-regular);
        white-space: nowrap;
      }

      .is-active {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      }

      .art-icon-button {
        flex: 0 0 auto;
        margin-left: auto;
      }
    }

    &__messages {
      flex: 1;
      min-height: 0;
      padding: 15px;
      background:
        radial-gradient(circle at 100% 0, var(--el-color-primary-light-9), transparent 34%),
        var(--el-fill-color-extra-light);
    }

    &__chat-welcome {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      padding: 30px 8px 18px;
      text-align: center;
    }

    &__welcome-mark {
      display: grid;
      place-items: center;
      width: 70px;
      height: 70px;
      margin: 0 auto 11px;
      background: radial-gradient(circle, var(--el-color-primary-light-8), transparent 70%);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: 50%;

      span {
        display: grid;
        place-items: center;
        width: 45px;
        height: 45px;
        font-size: 20px;
        color: white;
        background: linear-gradient(
          145deg,
          var(--el-color-primary-light-3),
          var(--el-color-primary)
        );
        border-radius: var(--el-border-radius-base);
        box-shadow: 0 10px 22px rgb(64 128 255 / 28%);
      }
    }

    &__chat-welcome > small {
      font-size: 10px;
      font-weight: 700;
      color: var(--el-color-primary);
      letter-spacing: 1.4px;
    }

    &__chat-welcome h3 {
      margin: 7px 0 5px;
      font-size: 17px;
    }

    &__chat-welcome p {
      max-width: 330px;
      margin: 0 auto 18px;
      font-size: 12px;
      line-height: 1.7;
      color: var(--el-text-color-secondary);
    }

    &__chat-welcome .el-button {
      justify-content: space-between;
      width: 100%;
      height: auto;
      min-height: 42px;
      padding: 9px 12px;
      margin: 4px 0;
      color: var(--el-text-color-regular);
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-extra-light);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 4px 12px rgb(0 0 0 / 3%);
      transition:
        color 0.18s ease,
        border-color 0.18s ease,
        transform 0.18s ease,
        box-shadow 0.18s ease;

      span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: left;
        white-space: nowrap;
      }

      &:hover {
        color: var(--el-color-primary);
        border-color: var(--el-color-primary-light-7);
        box-shadow: 0 8px 18px rgb(64 128 255 / 10%);
        transform: translateY(-1px);
      }
    }

    &__message {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-bottom: 14px;
    }

    &__message > span {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 28px;
      height: 28px;
      font-size: 14px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 4px 12px rgb(64 128 255 / 10%);
    }

    &__message > div {
      max-width: calc(100% - 42px);
      padding: 9px 11px;
      line-height: 1.65;
      white-space: pre-wrap;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 5px 16px rgb(0 0 0 / 4%);
    }

    &__message.is-user {
      flex-direction: row-reverse;
    }

    &__message.is-user > div {
      color: white;
      background: linear-gradient(145deg, var(--el-color-primary-light-3), var(--el-color-primary));
      border-color: var(--el-color-primary);
    }

    &__message.is-user > span {
      color: var(--el-text-color-regular);
      background: var(--el-fill-color);
      box-shadow: none;
    }

    &__message-content {
      white-space: pre-wrap;
    }

    &__message-trace {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      align-items: center;
      padding-top: 8px;
      margin-top: 8px;
      font-size: 10px;
      color: var(--el-text-color-secondary);
      border-top: 1px solid var(--el-border-color-extra-light);

      > span {
        padding: 2px 6px;
        background: var(--el-fill-color-light);
        border-radius: 999px;
      }

      :deep(.el-tag) {
        height: 20px;
        font-size: 10px;
        border-radius: 999px;
      }
    }

    &__message-actions {
      display: flex;
      align-items: center;
      min-height: 24px;
      margin: 6px -5px -5px;
      opacity: 0;
      transition: opacity 0.18s ease;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    &__message:hover &__message-actions,
    &__message:focus-within &__message-actions {
      opacity: 1;
    }

    &__typing {
      display: flex;
      gap: 4px;
      align-items: center;
      color: var(--el-text-color-secondary);

      i {
        width: 5px;
        height: 5px;
        background: var(--el-color-primary-light-3);
        border-radius: 50%;
        animation: project-assistant-typing 1.2s ease-in-out infinite;

        &:nth-child(2) {
          animation-delay: 0.16s;
        }

        &:nth-child(3) {
          animation-delay: 0.32s;
        }
      }

      small {
        margin-left: 4px;
      }
    }

    &__composer {
      flex: 0 0 auto;
      padding: 11px;
      background: var(--el-bg-color);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__quick-actions {
      display: flex;
      gap: 6px;
      width: max-content;
      padding-bottom: 8px;

      button {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 4px;
        align-items: center;
        padding: 5px 8px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        cursor: pointer;
        background: var(--el-fill-color-extra-light);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: 999px;
        transition:
          color 0.18s ease,
          background-color 0.18s ease,
          border-color 0.18s ease;

        &:hover:not(:disabled) {
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-7);
        }

        &:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
      }
    }

    &__composer-box {
      padding: 7px 8px 8px;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--el-border-color-light);
      border-radius: var(--el-border-radius-base);
      transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease;

      &:focus-within {
        border-color: var(--el-color-primary-light-5);
        box-shadow: 0 0 0 3px var(--el-color-primary-light-9);
      }

      :deep(.el-textarea__inner) {
        min-height: 62px !important;
        padding: 5px 4px;
        background: transparent;
        border: 0;
        box-shadow: none;
      }

      > div {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__safety-toggle {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 3px 7px;
      font-size: 11px;
      color: var(--el-color-success);
      cursor: pointer;
      background: var(--el-color-success-light-9);
      border: 1px solid var(--el-color-success-light-7);
      border-radius: 999px;

      &.is-write-mode {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-color: var(--el-color-warning-light-7);
      }
    }

    &__send-actions {
      display: flex;
      gap: 8px;
      align-items: center;

      small {
        color: var(--el-text-color-placeholder);
      }

      .project-assistant__send-button {
        width: 32px;
        height: 32px;
        margin: 0;
      }
    }

    @media (width <= 640px) {
      &__chat-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .project-assistant__typing i {
      animation: none;
    }
  }

  @keyframes project-assistant-typing {
    0%,
    60%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }

    30% {
      opacity: 1;
      transform: translateY(-2px);
    }
  }
</style>
