import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'
import { createFriendlySupabaseFunctionError } from '@/utils/supabase/error'
import type {
  AiAssistantChatRequest,
  AiAssistantChatResponse,
  AiAssistantFeedbackRequest
} from '@/types/ai-assistant'

export async function chatWithAiAssistant(
  params: AiAssistantChatRequest
): Promise<AiAssistantChatResponse> {
  const { data, error } = await invokeSupabaseFunctionWithSessionRecovery<AiAssistantChatResponse>(
    'ai-assistant',
    { body: { ...params, action: 'chat' } }
  )
  if (error) throw await normalizeFunctionError(error)
  if (!data?.message || !data.conversationId || !data.runId) {
    throw new Error('AI 助手返回了无效结果')
  }
  return data
}

export async function submitAiAssistantFeedback(params: AiAssistantFeedbackRequest): Promise<void> {
  const { error } = await invokeSupabaseFunctionWithSessionRecovery('ai-assistant', {
    body: { ...params, action: 'feedback' }
  })
  if (error) throw await normalizeFunctionError(error)
}

export async function normalizeFunctionError(error: unknown): Promise<Error> {
  return await createFriendlySupabaseFunctionError(error, 'AI 助手暂时不可用，请稍后重试')
}
