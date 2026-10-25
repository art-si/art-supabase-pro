import { copyTextToClipboard } from '@/utils/file/clipboard'
import { computed, reactive, ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  fetchAiPlannerCapabilities,
  fetchAiPlannerState,
  generateAiSuggestions,
  recordAiSuggestionEvent
} from '@/api/ai-project-planner'
import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
import type {
  AiPlannerCapabilities,
  AiPlannerEffort,
  AiPlannerState,
  AiProjectSuggestion,
  AiSuggestionCategory,
  AiSuggestionEventType,
  AiSuggestionStatus
} from '@/types/ai-project-planner'
import type { SuggestionPendingAction } from './project-planner-view-model'

export type ProjectPlannerWorkflowEvent = Extract<
  AiSuggestionEventType,
  'accepted' | 'completed' | 'dismissed' | 'restored'
>

export interface ProjectPlannerControls {
  focus: 'balanced' | AiSuggestionCategory
  effort: AiPlannerEffort
}

interface UseProjectPlannerWorkflowOptions {
  isPlatformSuper: Ref<boolean>
}

function createInitialPlannerState(): AiPlannerState {
  return {
    latestBatch: null,
    suggestions: [],
    preferenceSummary: {
      totalSignals: 0,
      categoryScores: {
        product: 0,
        business: 0,
        ui_ux: 0,
        security: 0,
        performance: 0,
        quality: 0,
        developer_experience: 0
      },
      preferredCategories: [],
      avoidedCategories: []
    },
    statusCounts: { active: 0, accepted: 0, completed: 0, dismissed: 0, expired: 0 },
    snapshot: { schemaVersion: '', generatedAt: '', sourceHash: '', sourceVersion: '' }
  }
}

export function useProjectPlannerWorkflow(options: UseProjectPlannerWorkflowOptions) {
  const capabilities = ref<AiPlannerCapabilities | null>(null)
  const state = reactive<AiPlannerState>(createInitialPlannerState())
  const controls = reactive<ProjectPlannerControls>({ focus: 'balanced', effort: 'mixed' })
  const loading = reactive({ state: false, generate: false })
  const pendingActions = reactive<Record<string, SuggestionPendingAction | undefined>>({})
  const expandedTracked = new Set<string>()
  let activeStateRequest = 0
  let activeLoadingRequest = 0

  const canManageWorkflow = computed(
    () => capabilities.value?.access?.canManageWorkflow ?? options.isPlatformSuper.value
  )

  function assignState(next: AiPlannerState): void {
    Object.assign(state, next)
  }

  function isSuggestionPending(suggestionId: string): boolean {
    return Boolean(pendingActions[suggestionId])
  }

  function applySuggestionStatus(
    suggestion: AiProjectSuggestion,
    nextStatus: Extract<AiSuggestionStatus, 'active' | 'accepted' | 'completed' | 'dismissed'>
  ): void {
    const previousStatus = suggestion.status
    if (previousStatus === nextStatus) return
    state.statusCounts[previousStatus] = Math.max(0, state.statusCounts[previousStatus] - 1)
    state.statusCounts[nextStatus] += 1
    suggestion.status = nextStatus
    const changedAt = new Date().toISOString()
    if (nextStatus === 'accepted') suggestion.acceptedAt = changedAt
    if (nextStatus === 'completed') suggestion.completedAt = changedAt
    if (nextStatus === 'dismissed') suggestion.dismissedAt = changedAt
    if (nextStatus === 'active') suggestion.dismissedAt = null
    suggestion.updateTime = changedAt
  }

  async function syncStateSilently(): Promise<void> {
    const requestId = ++activeStateRequest
    try {
      const next = await fetchAiPlannerState()
      if (requestId === activeStateRequest) assignState(next)
    } catch {
      // The completed write is authoritative; a later refresh will reconcile a transient read failure.
    }
  }

  async function loadState(showMessage = false, notifyOnError = true): Promise<boolean> {
    const requestId = ++activeStateRequest
    const loadingRequestId = ++activeLoadingRequest
    loading.state = true
    try {
      const next = await fetchAiPlannerState()
      if (requestId !== activeStateRequest) return false
      assignState(next)
      if (showMessage) ElMessage.success('建议已刷新')
      return true
    } catch (error) {
      if (requestId === activeStateRequest && notifyOnError) {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '加载建议失败，请稍后重试'))
      }
      return false
    } finally {
      if (loadingRequestId === activeLoadingRequest) loading.state = false
    }
  }

  async function loadCapabilities(notifyOnError = true): Promise<boolean> {
    try {
      capabilities.value = await fetchAiPlannerCapabilities()
      return true
    } catch (error) {
      if (notifyOnError) {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '读取 AI 能力失败，请稍后重试'))
      }
      return false
    }
  }

  async function generateSuggestions(): Promise<boolean> {
    if (loading.generate) return false
    const requestId = ++activeStateRequest
    loading.generate = true
    try {
      const next = await generateAiSuggestions(controls)
      if (requestId !== activeStateRequest) return false
      assignState(next)
      ElMessage.success('新一批项目建议已生成')
      return true
    } catch (error) {
      if (requestId === activeStateRequest) {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '生成建议失败，请稍后重试'))
      }
      return false
    } finally {
      loading.generate = false
    }
  }

  async function copySuggestion(suggestion: AiProjectSuggestion): Promise<void> {
    if (isSuggestionPending(suggestion.id)) return
    pendingActions[suggestion.id] = 'copied'
    try {
      await copyTextToClipboard(suggestion.prompt)
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '复制失败，请检查浏览器剪贴板权限'))
      delete pendingActions[suggestion.id]
      return
    }

    ElMessage.success('提示词已复制，可以直接粘贴到 Codex')
    try {
      await recordAiSuggestionEvent({ suggestionId: suggestion.id, eventType: 'copied' })
      suggestion.feedback.copied += 1
      void syncStateSilently()
    } catch {
      ElMessage.warning('提示词已复制，但偏好记录暂未同步')
    } finally {
      delete pendingActions[suggestion.id]
    }
  }

  async function submitFeedback(
    suggestion: AiProjectSuggestion,
    eventType: 'liked' | 'disliked',
    reason?: string
  ): Promise<void> {
    if (isSuggestionPending(suggestion.id)) return
    pendingActions[suggestion.id] = eventType
    try {
      await recordAiSuggestionEvent({ suggestionId: suggestion.id, eventType, reason })
      suggestion.feedback.sentiment = eventType === 'liked' ? 1 : -1
      ElMessage.success(eventType === 'liked' ? '已记住你的偏好' : '已记录，本类建议会降低权重')
      void syncStateSilently()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '反馈提交失败，请稍后重试'))
    } finally {
      delete pendingActions[suggestion.id]
    }
  }

  async function updateWorkflow(
    suggestion: AiProjectSuggestion,
    eventType: ProjectPlannerWorkflowEvent
  ): Promise<void> {
    if (!canManageWorkflow.value) {
      ElMessage.warning('仅平台超级管理员可以推进建议状态')
      return
    }
    if (isSuggestionPending(suggestion.id)) return
    pendingActions[suggestion.id] = eventType
    try {
      const result = await recordAiSuggestionEvent({ suggestionId: suggestion.id, eventType })
      const statusByEvent = {
        accepted: 'accepted',
        completed: 'completed',
        dismissed: 'dismissed',
        restored: 'active'
      } as const
      const resolvedStatus = ['active', 'accepted', 'completed', 'dismissed'].includes(
        String(result.status)
      )
        ? (result.status as 'active' | 'accepted' | 'completed' | 'dismissed')
        : statusByEvent[eventType]
      applySuggestionStatus(suggestion, resolvedStatus)
      const messages: Record<ProjectPlannerWorkflowEvent, string> = {
        accepted: '建议已采纳',
        completed: '建议已标记完成',
        dismissed: '建议已暂不考虑',
        restored: '建议已恢复到待评估'
      }
      ElMessage.success(messages[eventType])
      void syncStateSilently()
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '状态更新失败，请稍后重试'))
    } finally {
      delete pendingActions[suggestion.id]
    }
  }

  function trackExpand(suggestion: AiProjectSuggestion, names: unknown): void {
    const opened = Array.isArray(names) ? names.includes('prompt') : names === 'prompt'
    if (!opened || expandedTracked.has(suggestion.id)) return
    expandedTracked.add(suggestion.id)
    void recordAiSuggestionEvent({ suggestionId: suggestion.id, eventType: 'expanded' }).catch(
      () => {
        expandedTracked.delete(suggestion.id)
      }
    )
  }

  async function initialize(): Promise<void> {
    const [capabilitiesLoaded, stateLoaded] = await Promise.all([
      loadCapabilities(false),
      loadState(false, false)
    ])
    if (capabilitiesLoaded && stateLoaded) return
    if (!capabilitiesLoaded && !stateLoaded) {
      ElMessage.error('AI 项目规划台加载失败，请稍后重试')
    } else if (!capabilitiesLoaded) {
      ElMessage.warning('AI 能力读取失败，部分功能暂不可用')
    } else {
      ElMessage.warning('建议读取失败，请稍后重试')
    }
  }

  return {
    canManageWorkflow,
    capabilities,
    controls,
    copySuggestion,
    generateSuggestions,
    initialize,
    loadState,
    loading,
    pendingActions,
    state,
    submitFeedback,
    trackExpand,
    updateWorkflow
  }
}
