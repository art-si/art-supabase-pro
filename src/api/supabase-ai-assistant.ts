import { useSupabase } from '@/hooks/core/useSupabase'
import { normalizeFunctionError } from './ai-assistant'
import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'
import {
  isProjectCatalogResult,
  isRecord,
  type ProjectCatalogResultMap
} from '@/api/contracts/ai-client-contracts'
import type {
  ProjectAssistantChatRequest,
  ProjectAssistantChatResponse,
  ProjectAssistantCapabilities,
  ProjectAssistantFeedbackRequest,
  ProjectAssistantHistoryDetailResponse,
  ProjectAssistantHistoryListResponse,
  ProjectCatalogRequest,
  ProjectObjectDescriptionUpdateRequest,
  ProjectObjectDescriptionUpdateResponse
} from '@/types/supabase-ai-assistant'

const { keysToCamelDeep } = useSupabase()

export async function fetchProjectAssistantCapabilities(): Promise<ProjectAssistantCapabilities> {
  const { data, error } =
    await invokeSupabaseFunctionWithSessionRecovery<ProjectAssistantCapabilities>(
      'ai-project-assistant',
      { body: { action: 'capabilities' } }
    )
  if (error) throw await normalizeFunctionError(error)
  if (!data?.version || !isRecord(data.features) || !isRecord(data.access)) {
    throw new Error('助手能力信息返回了无效结果')
  }
  return keysToCamelDeep<ProjectAssistantCapabilities>(data)
}

export async function chatWithProjectAssistant(
  params: ProjectAssistantChatRequest,
  options: { signal?: AbortSignal } = {}
): Promise<ProjectAssistantChatResponse> {
  const { data, error } =
    await invokeSupabaseFunctionWithSessionRecovery<ProjectAssistantChatResponse>(
      'ai-project-assistant',
      { body: { ...params, action: 'chat' }, signal: options.signal }
    )
  if (error) throw await normalizeFunctionError(error)
  if (!data?.message || !data.conversationId || !data.runId) {
    throw new Error('Supabase 管理助手返回了无效结果')
  }
  return data
}

export async function submitProjectAssistantFeedback(
  params: ProjectAssistantFeedbackRequest
): Promise<void> {
  const { error } = await invokeSupabaseFunctionWithSessionRecovery('ai-project-assistant', {
    body: { ...params, action: 'feedback' }
  })
  if (error) throw await normalizeFunctionError(error)
}

export async function fetchProjectCatalog<TAction extends ProjectCatalogRequest['catalogAction']>(
  params: ProjectCatalogRequest & { catalogAction: TAction }
): Promise<ProjectCatalogResultMap[TAction]> {
  const { data, error } = await invokeSupabaseFunctionWithSessionRecovery<{ data: unknown }>(
    'ai-project-assistant',
    { body: { ...params, action: 'catalog' } }
  )
  if (error) throw await normalizeFunctionError(error)
  if (!data || !('data' in data)) throw new Error('项目目录返回了无效结果')
  const result: unknown = keysToCamelDeep(data.data)
  if (!isProjectCatalogResult(params.catalogAction, result)) {
    throw new Error('项目目录返回了无效结果')
  }
  // catalogAction 与上方运行时校验共同收窄结果；断言只保留在 Function 传输边界。
  return result as ProjectCatalogResultMap[TAction]
}

export async function updateProjectObjectDescription(
  params: ProjectObjectDescriptionUpdateRequest
): Promise<ProjectObjectDescriptionUpdateResponse> {
  const { data, error } =
    await invokeSupabaseFunctionWithSessionRecovery<ProjectObjectDescriptionUpdateResponse>(
      'ai-project-assistant',
      { body: { ...params, action: 'catalog_update_description' } }
    )
  if (error) throw await normalizeFunctionError(error)
  if (!data?.ok || !data.object) throw new Error('对象说明更新返回了无效结果')
  return keysToCamelDeep<ProjectObjectDescriptionUpdateResponse>(data)
}

export async function fetchProjectAssistantHistory(
  query = '',
  limit = 30
): Promise<ProjectAssistantHistoryListResponse> {
  const { data, error } =
    await invokeSupabaseFunctionWithSessionRecovery<ProjectAssistantHistoryListResponse>(
      'ai-project-assistant',
      { body: { action: 'history_list', query, limit } }
    )
  if (error) throw await normalizeFunctionError(error)
  if (!Array.isArray(data?.conversations) || !Number.isFinite(data.total)) {
    throw new Error('会话历史返回了无效结果')
  }
  return keysToCamelDeep<ProjectAssistantHistoryListResponse>(data)
}

export async function fetchProjectAssistantConversation(
  conversationId: string
): Promise<ProjectAssistantHistoryDetailResponse> {
  const { data, error } =
    await invokeSupabaseFunctionWithSessionRecovery<ProjectAssistantHistoryDetailResponse>(
      'ai-project-assistant',
      { body: { action: 'history_detail', conversationId } }
    )
  if (error) throw await normalizeFunctionError(error)
  if (!isRecord(data?.conversation) || !Array.isArray(data.messages) || !Array.isArray(data.runs)) {
    throw new Error('会话详情返回了无效结果')
  }
  return keysToCamelDeep<ProjectAssistantHistoryDetailResponse>(data)
}

export async function renameProjectAssistantConversation(
  conversationId: string,
  title: string
): Promise<void> {
  const { data, error } = await invokeSupabaseFunctionWithSessionRecovery<{
    conversation?: { id: string }
  }>('ai-project-assistant', { body: { action: 'history_rename', conversationId, title } })
  if (error) throw await normalizeFunctionError(error)
  if (!data?.conversation?.id) throw new Error('会话重命名返回了无效结果')
}
