<template>
  <ArtPageShell
    class="project-assistant-shell"
    :loading="initialLoading"
    loading-mode="skeleton"
    :error="pageError"
    full-height
    @retry="loadInitialData"
  >
    <div
      class="project-assistant business-workspace-page art-full-height"
      :class="[{ 'is-focus-mode': focusMode }, `is-mobile-panel-${mobilePanel}`]"
    >
      <BusinessWorkspaceHeader
        v-if="!focusMode"
        density="compact"
        eyebrow="SUPABASE PROJECT COPILOT"
        title="Supabase AI 助手"
        description="统一洞察 Database、RLS、Auth、Storage、Realtime 与 Edge Functions，并生成可审计的治理方案。"
        icon="ri:database-2-line"
        :tags="[
          {
            label: assistantMode === 'controlled_write' ? '管理员受控变更' : '只读安全模式',
            type: assistantMode === 'controlled_write' ? 'warning' : 'success',
            effect: 'light'
          },
          { label: `项目：${overview?.projectRef || 'ckbftoopuyophiebamwy'}`, type: 'info' }
        ]"
      >
        <template #actions>
          <ElButton plain type="primary" @click="openCapabilityCenter">
            <ArtSvgIcon icon="ri:radar-line" /> 全域能力
          </ElButton>
        </template>
      </BusinessWorkspaceHeader>

      <section v-if="!focusMode" class="project-assistant__stats art-card-xs">
        <ElScrollbar>
          <div class="project-assistant__stats-list">
            <button
              v-for="stat in stats"
              :key="stat.type"
              type="button"
              :class="{ 'is-active': filters.objectType === stat.type }"
              :aria-pressed="filters.objectType === stat.type"
              @click="selectStat(stat.type)"
            >
              <span><ArtSvgIcon :icon="stat.icon" /></span>
              <div
                ><strong>{{ stat.value }}</strong
                ><small>{{ stat.label }}</small></div
              >
            </button>
          </div>
        </ElScrollbar>
      </section>

      <nav class="project-assistant__mobile-nav art-card-xs" aria-label="AI 助手工作区">
        <button
          v-for="item in mobilePanels"
          :key="item.key"
          type="button"
          :class="{ 'is-active': mobilePanel === item.key }"
          :disabled="item.key === 'detail' && !selectedObject"
          :aria-pressed="mobilePanel === item.key"
          :title="item.key === 'detail' && !selectedObject ? '请先选择数据库对象' : undefined"
          @click="mobilePanel = item.key"
        >
          <ArtSvgIcon :icon="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <section class="project-assistant__workspace">
        <ElSplitter class="project-assistant__splitter" lazy>
          <ElSplitterPanel
            class="project-assistant__object-panel"
            size="280px"
            min="240px"
            max="400px"
            collapsible
          >
            <ProjectAssistantObjectBrowser
              :focus-mode="focusMode"
              :schemas="schemas"
              :objects="objects"
              :selected-object="selectedObject"
              :filters="filters"
              :loading="loading.objects"
              :load-source="objectLoadSource"
              :error="errors.objects"
              @toggle-focus="toggleFocusMode"
              @refresh="loadObjects('refresh')"
              @filter="loadObjects('filter')"
              @select="handleObjectSelect"
              @update:keyword="filters.keyword = $event"
              @update:schema="filters.schema = $event"
              @update:object-type="filters.objectType = $event"
            />
          </ElSplitterPanel>

          <ElSplitterPanel
            v-if="selectedObject"
            class="project-assistant__detail-panel"
            min="380px"
          >
            <ProjectAssistantObjectDetail
              :selected-object="selectedObject"
              :detail="detail"
              :relationships="relationships"
              :loading="loading"
              :errors="errors"
              :assistant-mode="assistantMode"
              :can-edit-description="canEditSelectedDescription"
              :chat-sending="chat.sending"
              @analyze="handleObjectAnalysis"
              @edit-description="editObjectDescription"
              @copy-ddl="copyDdl"
              @retry="handleObjectSelect"
            />
          </ElSplitterPanel>

          <ElSplitterPanel
            class="project-assistant__chat-panel"
            :size="selectedObject ? '390px' : undefined"
            min="320px"
            max="540px"
            collapsible
          >
            <ProjectAssistantChatPanel
              ref="chatPanelRef"
              :chat="chat"
              :active-chat-object="activeChatObject"
              :assistant-status="assistantStatus"
              :assistant-status-label="assistantStatusLabel"
              :assistant-mode="assistantMode"
              :can-use-controlled-write="canUseControlledWrite"
              :chat-phase="chatPhase"
              :chat-suggestions="chatSuggestions"
              :quick-actions="quickActions"
              @open-history="openHistory"
              @export-conversation="exportConversation"
              @reset="resetChat"
              @toggle-context="toggleContextLock"
              @suggest="sendSuggestion"
              @copy-message="copyMessage"
              @retry-message="retryMessage"
              @feedback="handleMessageFeedback"
              @update-input="chat.input = $event"
              @toggle-mode="toggleAssistantMode"
              @send="sendMessage"
              @stop="stopGeneration"
            />
          </ElSplitterPanel>
        </ElSplitter>
      </section>

      <ArtAssistantHistoryDrawer
        ref="historyDrawerRef"
        v-model:query="history.query"
        :loading="history.loading"
        :selecting-id="history.restoringId"
        :error="history.error"
        :items="history.items"
        :active-id="chat.conversationId"
        @search="scheduleHistorySearch"
        @retry="loadHistory"
        @select="restoreConversation"
        @rename="renameConversation"
      />

      <ProjectCapabilityCenterDrawer
        ref="capabilityCenterRef"
        @analyze="analyzePlatformCapability"
      />
    </div>
  </ArtPageShell>
</template>

<script setup lang="ts">
  import { copyTextToClipboard } from '@/utils/file/clipboard'

  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { useEventListener, useMediaQuery, useStorage } from '@vueuse/core'
  import { ElMessage } from 'element-plus'
  import { updateProjectObjectDescription } from '@/api/supabase-ai-assistant'
  import type {
    ProjectAssistantConversationSummary,
    ProjectDatabaseObject,
    ProjectAssistantSafetyMode,
    ProjectEdgeFunctionResult,
    ProjectObjectType
  } from '@/types/supabase-ai-assistant'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ProjectCapabilityCenterDrawer from './modules/capability-center-drawer.vue'
  import ProjectAssistantChatPanel from './modules/project-assistant-chat-panel.vue'
  import ArtAssistantHistoryDrawer from '@/components/core/layouts/art-assistant-history-drawer/index.vue'
  import ProjectAssistantObjectBrowser from './modules/project-assistant-object-browser.vue'
  import ProjectAssistantObjectDetail from './modules/project-assistant-object-detail.vue'
  import {
    getProjectAssistantStats,
    type ProjectAssistantChatMessage,
    type ProjectAssistantObjectAiAction
  } from './modules/project-assistant-presenter'
  import { useProjectAssistantCatalog } from './modules/use-project-assistant-catalog'
  import { useProjectAssistantChat } from './modules/use-project-assistant-chat'

  defineOptions({ name: 'SupabaseAiAssistant' })

  const { promptText, confirmAction } = useArtFeedback()

  interface CapabilityCenterExpose {
    handleOpen: (data: { edgeFunctions: ProjectEdgeFunctionResult | null }) => Promise<void>
  }

  interface HistoryDrawerExpose {
    handleOpen: () => Promise<void>
    handleClose: () => void
  }

  interface ChatPanelExpose {
    scrollToBottom: () => void
  }

  type MobilePanel = 'objects' | 'detail' | 'chat'

  const {
    detail,
    edgeFunctions,
    errors,
    filters,
    initialLoading,
    loadInitialData,
    loadObjects,
    loading,
    objectLoadSource,
    objects,
    overview,
    pageError,
    relationships,
    schemas,
    selectedObject,
    selectObject
  } = useProjectAssistantCatalog()
  const chatPanelRef = ref<ChatPanelExpose>()
  const historyDrawerRef = ref<HistoryDrawerExpose>()
  const capabilityCenterRef = ref<CapabilityCenterExpose>()
  const isCompactWorkspace = useMediaQuery('(width <= 900px)')
  const mobilePanel = ref<MobilePanel>('objects')
  const focusMode = useStorage('supabase-ai-assistant:focus-mode', false)
  const assistantMode = useStorage<ProjectAssistantSafetyMode>(
    'supabase-ai-assistant:safety-mode',
    'read_only'
  )
  const {
    activeChatObject,
    analyzePlatformCapability,
    assistantStatus,
    assistantStatusLabel,
    canUseControlledWrite,
    chat,
    chatPhase,
    chatSuggestions,
    copyMessage,
    exportConversation,
    history,
    loadAssistantCapabilities,
    loadHistory,
    quickActions,
    renameConversation: renameConversationTitle,
    resetChat,
    restoreConversation: restoreHistoryConversation,
    retryMessage,
    runObjectAnalysis,
    scheduleHistorySearch,
    sendMessage,
    sendSuggestion,
    stopGeneration,
    toggleContextLock
  } = useProjectAssistantChat({
    assistantMode,
    overview,
    selectedObject,
    scrollToBottom: scrollChatToBottom
  })
  const canEditSelectedDescription = computed(
    () =>
      canUseControlledWrite.value &&
      ['table', 'view', 'materialized_view'].includes(selectedObject.value?.objectType || '')
  )
  const stats = computed(() => getProjectAssistantStats(overview.value, edgeFunctions.value))
  const mobilePanels: Array<{ key: MobilePanel; label: string; icon: string }> = [
    { key: 'objects', label: '对象', icon: 'ri:database-2-line' },
    { key: 'detail', label: '详情', icon: 'ri:file-search-line' },
    { key: 'chat', label: '助手', icon: 'ri:sparkling-2-line' }
  ]

  function selectStat(type: ProjectObjectType): void {
    if (type === 'all') {
      if (isCompactWorkspace.value) mobilePanel.value = 'chat'
      chat.input = '列出项目 Edge Functions，并指出未启用 JWT 校验的函数'
      void sendMessage()
      return
    }
    if (isCompactWorkspace.value) mobilePanel.value = 'objects'
    filters.objectType = type
    void loadObjects('filter')
  }

  function handleObjectSelect(item: ProjectDatabaseObject): void {
    if (isCompactWorkspace.value) mobilePanel.value = 'detail'
    void selectObject(item)
  }

  function handleObjectAnalysis(action?: ProjectAssistantObjectAiAction): void {
    runObjectAnalysis(action)
    if (action && isCompactWorkspace.value) mobilePanel.value = 'chat'
  }

  async function toggleAssistantMode(): Promise<boolean> {
    if (assistantMode.value === 'controlled_write') {
      assistantMode.value = 'read_only'
      ElMessage.success('已切换为只读安全模式')
      return false
    }
    if (!canUseControlledWrite.value) {
      ElMessage.warning('仅平台超级管理员可开启受控变更模式')
      return false
    }
    try {
      await confirmAction(
        '受控变更模式允许执行已确认的白名单操作，并会记录操作者、SQL、结果与耗时。是否继续？',
        '开启管理员受控变更',
        {
          type: 'warning',
          confirmButtonText: '确认开启',
          cancelButtonText: '保持只读'
        }
      )
      assistantMode.value = 'controlled_write'
      ElMessage.success('受控变更模式已开启')
      return true
    } catch {
      // 用户取消后保持只读模式。
      return false
    }
  }

  async function editObjectDescription(): Promise<void> {
    const target = selectedObject.value
    if (!target || !canEditSelectedDescription.value) return
    if (assistantMode.value !== 'controlled_write') {
      const enabled = await toggleAssistantMode()
      if (!enabled) return
    }
    try {
      const description = await promptText(
        `为 ${target.schemaName}.${target.objectName} 填写数据库对象说明；留空将清除 COMMENT。`,
        '编辑对象说明',
        {
          allowEmpty: true,
          initialValue: detail.value?.description || target.description || '',
          maxLength: 500,
          maxLengthMessage: '对象说明不能超过 500 个字符',
          multiline: true,
          placeholder: '请输入对象用途、数据范围或业务含义',
          confirmButtonText: '下一步',
          type: 'info'
        }
      )
      await confirmAction(
        `即将写入 ${target.schemaName}.${target.objectName} 的数据库 COMMENT，此操作会记录审计日志。`,
        '确认执行变更',
        {
          type: 'warning',
          confirmButtonText: '确认写入',
          cancelButtonText: '返回检查'
        }
      )
      const response = await updateProjectObjectDescription({
        objectType: target.objectType as 'table' | 'view' | 'materialized_view',
        schema: target.schemaName,
        name: target.objectName,
        description: description || null,
        safetyMode: 'controlled_write',
        confirmed: true
      })
      target.description = response.object.description
      if (detail.value) detail.value.description = response.object.description
      ElMessage.success('对象说明已写入数据库并记录审计')
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '对象说明更新失败'))
      }
    }
  }

  async function copyDdl(): Promise<void> {
    if (!detail.value?.ddl) return
    try {
      await copyTextToClipboard(detail.value.ddl)

      ElMessage.success('DDL 已复制')
    } catch {
      ElMessage.warning('复制失败，请手动选择文字复制')
    }
  }

  async function openHistory(): Promise<void> {
    await historyDrawerRef.value?.handleOpen()
    await loadHistory()
  }

  async function restoreConversation(conversationId: string): Promise<void> {
    if (await restoreHistoryConversation(conversationId)) historyDrawerRef.value?.handleClose()
  }

  async function renameConversation(item: ProjectAssistantConversationSummary): Promise<void> {
    try {
      const title = await promptText('请输入新的会话标题', '重命名会话', {
        initialValue: item.title,
        maxLength: 80,
        maxLengthMessage: '会话标题不能超过 80 个字符',
        emptyMessage: '会话标题不能为空',
        placeholder: '请输入会话标题',
        type: 'info'
      })
      await renameConversationTitle(item, title)
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '会话重命名失败'))
      }
    }
  }

  function openCapabilityCenter(): void {
    void capabilityCenterRef.value?.handleOpen({ edgeFunctions: edgeFunctions.value })
  }

  function handleMessageFeedback(message: ProjectAssistantChatMessage, rating: -1 | 1): void {
    message.feedback = rating
  }

  function scrollChatToBottom(): void {
    chatPanelRef.value?.scrollToBottom()
  }

  function toggleFocusMode(): void {
    focusMode.value = !focusMode.value
    nextTick(() => window.dispatchEvent(new Event('resize')))
  }

  function exitFocusMode(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !focusMode.value) return
    event.preventDefault()
    toggleFocusMode()
  }

  useEventListener(document, 'keydown', exitFocusMode)

  onMounted(async () => {
    await Promise.all([loadInitialData(), loadAssistantCapabilities()])
  })
</script>

<style scoped lang="scss">
  .project-assistant-shell {
    height: var(--art-full-height);
    min-height: 0;

    :deep(> .art-async-state) {
      height: 100%;
    }
  }

  .project-assistant {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: hidden;
    background: var(--default-box-color);

    &__stats {
      padding: 7px;

      button {
        position: relative;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 10px 13px;
        text-align: left;
        touch-action: manipulation;
        cursor: pointer;
        background: transparent;
        border: 0;
        border-radius: var(--el-border-radius-base);
        transition:
          color 0.2s ease,
          background-color 0.2s ease,
          transform 0.2s ease;

        &:hover {
          background: var(--el-color-primary-light-9);
          transform: translateY(-1px);
        }

        &:focus-visible {
          outline: 2px solid var(--el-color-primary-light-3);
          outline-offset: 1px;
        }

        &.is-active {
          color: var(--el-color-primary);
          background: linear-gradient(135deg, var(--el-color-primary-light-9), transparent);

          &::after {
            position: absolute;
            right: 14px;
            bottom: 5px;
            left: 14px;
            height: 2px;
            content: '';
            background: linear-gradient(90deg, var(--el-color-primary), transparent);
            border-radius: 999px;
          }
        }

        > span {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-radius: var(--el-border-radius-base);
        }

        strong,
        small {
          display: block;
        }

        strong {
          font-size: 17px;
          font-variant-numeric: tabular-nums;
        }

        small {
          margin-top: 2px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__stats-list {
      display: grid;
      grid-template-columns: repeat(6, minmax(110px, 1fr));
    }

    &__workspace {
      flex: 1;
      min-height: 0;
    }

    &__mobile-nav {
      display: none;
    }

    &.is-focus-mode {
      gap: 8px;
    }

    &__splitter {
      height: 100%;

      :deep(.el-splitter-panel) {
        min-width: 0;
        overflow: hidden;
      }

      :deep(.el-splitter-bar) {
        width: 14px;
        cursor: col-resize;
      }

      :deep(.el-splitter-bar::before) {
        position: absolute;
        top: 12px;
        bottom: 12px;
        left: 50%;
        width: 1px;
        content: '';
        background: var(--el-border-color-lighter);
        transform: translateX(-50%);
        transition: background-color 0.18s ease;
      }

      :deep(.el-splitter-bar__dragger) {
        width: 14px;
        height: 64px;
        border-radius: 999px;
        transition:
          background-color 0.18s ease,
          box-shadow 0.18s ease;
      }

      :deep(.el-splitter-bar__dragger::before) {
        width: 3px;
        height: 30px;
        background: var(--el-border-color);
        border-radius: 999px;
      }

      :deep(.el-splitter-bar:hover::before),
      :deep(.el-splitter-bar:has(.el-splitter-bar__dragger-active)::before) {
        background: var(--el-color-primary-light-6);
      }

      :deep(.el-splitter-bar:hover .el-splitter-bar__dragger),
      :deep(.el-splitter-bar__dragger-active) {
        background: var(--el-color-primary-light-9);
        box-shadow: 0 4px 14px rgb(64 128 255 / 16%);
      }

      :deep(.el-splitter-bar:hover .el-splitter-bar__dragger::before),
      :deep(.el-splitter-bar__dragger-active::before) {
        background: var(--el-color-primary);
      }

      :deep(.el-splitter-bar__collapse-icon) {
        width: 20px;
        height: 30px;
        color: var(--el-text-color-secondary);
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-small);
        box-shadow: 0 5px 14px rgb(0 0 0 / 8%);
        opacity: 0.9;
        transition:
          color 0.18s ease,
          background-color 0.18s ease,
          border-color 0.18s ease,
          opacity 0.18s ease;
      }

      :deep(.el-splitter-bar__collapse-icon:hover) {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
        border-color: var(--el-color-primary-light-6);
        opacity: 1;
      }
    }

    @media (width <= 1280px) {
      &__stats-list {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (width <= 900px) {
      min-height: auto;
      overflow: visible;

      &__stats-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__workspace {
        height: auto;
      }

      &__mobile-nav {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--art-space-1);
        padding: var(--art-space-1);

        button {
          display: inline-flex;
          gap: var(--art-space-2);
          align-items: center;
          justify-content: center;
          min-width: 0;
          min-height: 44px;
          padding-inline: var(--art-space-2);
          font: inherit;
          color: var(--el-text-color-secondary);
          cursor: pointer;
          background: transparent;
          border: 0;
          border-radius: var(--art-control-radius);
          transition:
            color 0.18s ease,
            background-color 0.18s ease,
            box-shadow 0.18s ease;

          &:hover {
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 6%, transparent);
          }

          &:focus-visible {
            outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
            outline-offset: 1px;
          }

          &:disabled {
            color: var(--el-text-color-placeholder);
            cursor: not-allowed;
            background: transparent;
            opacity: 0.64;
          }

          &.is-active {
            font-weight: 600;
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
            box-shadow: inset 0 -2px 0 var(--theme-color);
          }
        }
      }

      &__splitter {
        display: block;
        height: auto;

        :deep(.el-splitter-panel) {
          display: none;
          width: 100% !important;
          height: min(680px, calc(100dvh - 132px));
          min-height: 520px;
          margin: 0;
          overflow: hidden;
        }

        :deep(.el-splitter-bar) {
          display: none;
        }
      }

      &.is-mobile-panel-objects :deep(.project-assistant__object-panel),
      &.is-mobile-panel-detail :deep(.project-assistant__detail-panel),
      &.is-mobile-panel-chat :deep(.project-assistant__chat-panel) {
        display: block;
      }
    }

    @media (width <= 640px) {
      gap: var(--art-space-3);

      &__stats {
        padding: var(--art-space-2);
      }

      &__stats-list {
        display: flex;
        gap: var(--art-space-1);
        width: max-content;

        button {
          flex: 0 0 112px;
          min-width: 112px;
          min-height: 56px;
          padding-inline: var(--art-space-2);

          > span {
            flex: 0 0 auto;
            width: 28px;
            height: 28px;
          }

          > div {
            min-width: 0;

            small {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__mobile-nav button {
        transition: none;
      }
    }
  }

  @media (width <= 900px) {
    .project-assistant-shell {
      height: auto;
      min-height: 0;
    }
  }

  @media (width <= 640px) {
    .project-assistant-shell {
      height: auto;
      min-height: 0;
    }
  }
</style>
