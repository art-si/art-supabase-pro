import { normalizeFunctionError } from './ai-assistant'
import { useSupabase } from '@/hooks/core/useSupabase'
import { invokeSupabaseFunctionWithSessionRecovery } from '@/utils/supabase/functions'
import {
  isPlannerCapabilities,
  isPlannerState,
  isSuggestionEventResponse
} from '@/api/contracts/ai-client-contracts'
import type {
  AiPlannerCapabilities,
  AiPlannerState,
  AiSuggestionStatus,
  GenerateAiSuggestionsRequest,
  RecordAiSuggestionEventRequest,
  RecordAiSuggestionEventResponse
} from '@/types/ai-project-planner'

const { keysToCamelDeep } = useSupabase()
const FUNCTION_NAME = 'ai-project-planner'

async function invokePlanner<T>(
  body: Record<string, unknown>,
  validate: (value: unknown) => value is T
): Promise<T> {
  const { data, error } = await invokeSupabaseFunctionWithSessionRecovery<unknown>(FUNCTION_NAME, {
    body
  })
  if (error) throw await normalizeFunctionError(error)
  if (!data) throw new Error('AI 项目规划台返回了无效结果')
  const result: unknown = keysToCamelDeep(data)
  if (!validate(result)) throw new Error('AI 项目规划台返回了无效结果')
  return result
}

export async function fetchAiPlannerCapabilities(): Promise<AiPlannerCapabilities> {
  return await invokePlanner({ action: 'capabilities' }, isPlannerCapabilities)
}

export async function fetchAiPlannerState(
  status: AiSuggestionStatus | 'all' = 'all'
): Promise<AiPlannerState> {
  return await invokePlanner({ action: 'list', status }, isPlannerState)
}

export async function generateAiSuggestions(
  params: GenerateAiSuggestionsRequest
): Promise<AiPlannerState> {
  return await invokePlanner({ action: 'generate', ...params }, isPlannerState)
}

export async function recordAiSuggestionEvent(
  params: RecordAiSuggestionEventRequest
): Promise<RecordAiSuggestionEventResponse> {
  return await invokePlanner({ action: 'event', ...params }, isSuggestionEventResponse)
}
