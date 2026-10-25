import { copyTextToClipboard } from '@/utils/file/clipboard'
import { computed, onBeforeUnmount, reactive, type Ref } from 'vue'
import { useDebounceFn, useIntervalFn } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import {
  chatWithProjectAssistant,
  fetchProjectAssistantCapabilities,
  fetchProjectAssistantConversation,
  fetchProjectAssistantHistory,
  renameProjectAssistantConversation
} from '@/api/supabase-ai-assistant'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
import { downloadBlob } from '@/utils/file'
import { formatDateTimeValue, formatDurationMs } from '@/utils/ui/format'
import type {
  ProjectAssistantCapabilities,
  ProjectAssistantConversationSummary,
  ProjectAssistantSafetyMode,
  ProjectDatabaseObject,
  ProjectOverview
} from '@/types/supabase-ai-assistant'
import {
  getProjectAssistantChatPhase,
  getProjectAssistantFailureMessage,
  getProjectAssistantQuickActions,
  getProjectAssistantStatusLabel,
  getProjectAssistantSuggestions,
  mapProjectAssistantConversationMessages,
  type ProjectAssistantChatMessage,
  type ProjectAssistantObjectAiAction
} from './project-assistant-presenter'

interface UseProjectAssistantChatOptions {
  assistantMode: Ref<ProjectAssistantSafetyMode>
  overview: Ref<ProjectOverview | null>
  selectedObject: Ref<ProjectDatabaseObject | null>
  scrollToBottom: () => void
}

export interface ProjectAssistantChatState {
  input: string
  sending: boolean
  startedAt: number
  elapsedMs: number
  conversationId?: string
  contextLocked: boolean
  contextObject: ProjectDatabaseObject | null
  messages: ProjectAssistantChatMessage[]
}

export interface ProjectAssistantHistoryState {
  restoringId: string
  loading: boolean
  query: string
  error: string
  items: ProjectAssistantConversationSummary[]
}

export interface ProjectAssistantCapabilityState {
  loading: boolean
  online: boolean
  capabilities: ProjectAssistantCapabilities | null
}

export function useProjectAssistantChat(options: UseProjectAssistantChatOptions) {
  const chat = reactive<ProjectAssistantChatState>({
    input: '',
    sending: false,
    startedAt: 0,
    elapsedMs: 0,
    conversationId: undefined,
    contextLocked: false,
    contextObject: null,
    messages: []
  })
  const history = reactive<ProjectAssistantHistoryState>({
    restoringId: '',
    loading: false,
    query: '',
    error: '',
    items: []
  })
  const assistantStatus = reactive<ProjectAssistantCapabilityState>({
    loading: true,
    online: false,
    capabilities: null
  })
  let activeChatRequest = 0
  let activeHistoryRequest = 0
  let chatAbortController: AbortController | undefined

  const { pause: pauseElapsedTimer, resume: resumeElapsedTimer } = useIntervalFn(
    () => {
      chat.elapsedMs = Math.max(0, Date.now() - chat.startedAt)
    },
    250,
    { immediate: false }
  )

  const activeChatObject = computed(() =>
    chat.contextLocked ? chat.contextObject : options.selectedObject.value
  )
  const canUseControlledWrite = computed(
    () => assistantStatus.capabilities?.access?.controlledWrite === true
  )
  const chatPhase = computed(() => getProjectAssistantChatPhase(chat.elapsedMs))
  const assistantStatusLabel = computed(() =>
    getProjectAssistantStatusLabel(assistantStatus, options.assistantMode.value)
  )
  const quickActions = computed(() => getProjectAssistantQuickActions(activeChatObject.value))
  const chatSuggestions = computed(() =>
    getProjectAssistantSuggestions(options.selectedObject.value)
  )

  function resetChat(): void {
    activeChatRequest += 1
    chatAbortController?.abort()
    chatAbortController = undefined
    pauseElapsedTimer()
    Object.assign(chat, {
      input: '',
      sending: false,
      startedAt: 0,
      elapsedMs: 0,
      conversationId: undefined,
      messages: []
    })
  }

  function toggleContextLock(): void {
    if (chat.contextLocked) {
      chat.contextLocked = false
      chat.contextObject = options.selectedObject.value
      ElMessage.info('已解除对象上下文锁定')
      return
    }
    if (!options.selectedObject.value) return
    chat.contextObject = options.selectedObject.value
    chat.contextLocked = true
    ElMessage.success(
      `已锁定 ${options.selectedObject.value.schemaName}.${options.selectedObject.value.objectName}`
    )
  }

  async function copyMessage(content: string): Promise<void> {
    try {
      await copyTextToClipboard(content)

      ElMessage.success('回答已复制')
    } catch {
      ElMessage.warning('复制失败，请手动选择文字复制')
    }
  }

  function retryMessage(messageId: string): void {
    const messageIndex = chat.messages.findIndex((item) => item.id === messageId)
    for (let index = messageIndex - 1; index >= 0; index -= 1) {
      if (chat.messages[index].role === 'user') {
        chat.input = chat.messages[index].content
        void sendMessage()
        return
      }
    }
  }

  function exportConversation(): void {
    if (!chat.messages.length) return
    const exportedAt = new Date()
    const content = [
      '# Supabase AI 助手会话',
      '',
      `- 导出时间：${formatDateTimeValue(exportedAt)}`,
      `- 项目：${options.overview.value?.projectRef || 'ckbftoopuyophiebamwy'}`,
      `- 安全模式：${options.assistantMode.value === 'controlled_write' ? '管理员受控变更' : '只读'}`,
      '',
      ...chat.messages.flatMap((message) => [
        `## ${message.role === 'user' ? '用户' : '项目助手'}`,
        '',
        message.content,
        '',
        ...(message.runId
          ? [
              `> Run: ${message.runId} · ${message.model || '-'} · ${formatDurationMs(message.latencyMs)}`,
              ''
            ]
          : [])
      ])
    ].join('\n')
    downloadBlob(
      new Blob([content], { type: 'text/markdown;charset=utf-8' }),
      `supabase-ai-${formatDateTimeValue(exportedAt, { format: 'YYYY-MM-DD' })}.md`
    )
    ElMessage.success('会话已导出为 Markdown')
  }

  async function loadHistory(): Promise<void> {
    const requestId = ++activeHistoryRequest
    history.loading = true
    history.error = ''
    try {
      const result = await fetchProjectAssistantHistory(history.query, 30)
      if (requestId !== activeHistoryRequest) return
      history.items = result.conversations
    } catch (error) {
      if (requestId !== activeHistoryRequest) return
      history.error = getFriendlySupabaseErrorMessage(error, '会话历史加载失败，请稍后重试')
    } finally {
      if (requestId === activeHistoryRequest) history.loading = false
    }
  }

  const scheduleHistorySearch = useDebounceFn(() => {
    void loadHistory()
  }, 320)

  async function loadAssistantCapabilities(): Promise<void> {
    assistantStatus.loading = true
    try {
      const capabilities = await fetchProjectAssistantCapabilities()
      Object.assign(assistantStatus, { online: true, capabilities })
      if (!capabilities.allowedSafetyModes?.includes(options.assistantMode.value)) {
        options.assistantMode.value = 'read_only'
      }
    } catch {
      Object.assign(assistantStatus, { online: false, capabilities: null })
    } finally {
      assistantStatus.loading = false
    }
  }

  async function restoreConversation(conversationId: string): Promise<boolean> {
    if (history.restoringId || chat.sending) return false
    if (chat.conversationId === conversationId) return true
    history.restoringId = conversationId
    try {
      const result = await fetchProjectAssistantConversation(conversationId)
      chat.conversationId = result.conversation.id
      chat.messages = mapProjectAssistantConversationMessages(result)
      options.scrollToBottom()
      ElMessage.success('已恢复历史会话')
      return true
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '会话恢复失败'))
      return false
    } finally {
      history.restoringId = ''
    }
  }

  async function renameConversation(
    item: ProjectAssistantConversationSummary,
    title: string
  ): Promise<void> {
    await renameProjectAssistantConversation(item.id, title)
    item.title = title
    ElMessage.success('会话标题已更新')
  }

  function sendSuggestion(content: string): void {
    chat.input = content
    void sendMessage()
  }

  function analyzePlatformCapability(prompt: string): void {
    chat.contextLocked = false
    chat.contextObject = null
    sendSuggestion(prompt)
  }

  function runObjectAnalysis(action?: ProjectAssistantObjectAiAction): void {
    if (!action || !options.selectedObject.value || chat.sending) return
    chat.contextObject = options.selectedObject.value
    chat.contextLocked = true
    sendSuggestion(action.prompt)
  }

  function stopGeneration(): void {
    if (!chat.sending) return
    activeChatRequest += 1
    chatAbortController?.abort()
    chatAbortController = undefined
    chat.sending = false
    pauseElapsedTimer()
    ElMessage.info('已停止等待，你可以调整问题后重新发送')
  }

  async function sendMessage(): Promise<void> {
    const content = chat.input.trim()
    if (!content || chat.sending) return
    const requestId = ++activeChatRequest
    const controller = new AbortController()
    chatAbortController = controller
    chat.messages.push({ id: crypto.randomUUID(), role: 'user', content })
    chat.input = ''
    chat.sending = true
    chat.startedAt = Date.now()
    chat.elapsedMs = 0
    resumeElapsedTimer()
    options.scrollToBottom()

    try {
      const response = await chatWithProjectAssistant(
        {
          conversationId: chat.conversationId,
          safetyMode: options.assistantMode.value,
          context: {
            routeName: 'SupabaseAiAssistant',
            routePath: '/data-center/supabase-ai-assistant',
            pageTitle: 'Supabase AI 助手',
            ...(activeChatObject.value ? { query: { selectedObject: activeChatObject.value } } : {})
          },
          messages: chat.messages.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent
          }))
        },
        { signal: controller.signal }
      )
      if (requestId !== activeChatRequest) return
      chat.conversationId = response.conversationId
      chat.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        runId: response.runId,
        model: response.model,
        promptVersion: response.promptVersion,
        latencyMs: response.latencyMs,
        tools: response.tools,
        usage: response.usage
      })
    } catch (error) {
      if (controller.signal.aborted || requestId !== activeChatRequest) return
      const errorMessage = getFriendlySupabaseErrorMessage(error, '操作失败，请稍后重试')
      chat.messages.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `暂时无法完成这次请求：${getProjectAssistantFailureMessage(errorMessage)}`
      })
    } finally {
      if (requestId === activeChatRequest) {
        chatAbortController = undefined
        chat.sending = false
        pauseElapsedTimer()
        options.scrollToBottom()
      }
    }
  }

  onBeforeUnmount(() => {
    activeChatRequest += 1
    activeHistoryRequest += 1
    chatAbortController?.abort()
  })

  return {
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
    renameConversation,
    resetChat,
    restoreConversation,
    retryMessage,
    runObjectAnalysis,
    scheduleHistorySearch,
    sendMessage,
    sendSuggestion,
    stopGeneration,
    toggleContextLock
  }
}
