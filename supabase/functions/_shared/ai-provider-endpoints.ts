import type { AiRuntimeConfig } from './ai-runtime-config.ts'

export interface AiProviderEndpoint {
  id: 'openai' | 'openai_compatible'
  label: string
  apiKey: string
  baseUrl: string
  model: string
  fallbackModel: string | null
}

interface ResolveAiProviderOptions {
  openAiModel?: string | null
  defaultOpenAiModel?: string
}

function value(name: string): string | null {
  const normalized = Deno.env.get(name)?.trim()
  return normalized || null
}

export function resolveAiProviderEndpoints(
  config: Pick<AiRuntimeConfig, 'model' | 'fallbackModel'> &
    Partial<Pick<AiRuntimeConfig, 'provider'>>,
  options: ResolveAiProviderOptions = {}
): AiProviderEndpoint[] {
  const endpoints: AiProviderEndpoint[] = []
  const openAiApiKey = value('OPENAI_API_KEY')
  if (openAiApiKey) {
    endpoints.push({
      id: 'openai',
      label: 'OpenAI',
      apiKey: openAiApiKey,
      baseUrl: (value('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model:
        options.openAiModel ||
        value('OPENAI_MODEL') ||
        options.defaultOpenAiModel ||
        'gpt-4.1-mini',
      fallbackModel: null
    })
  }

  const compatibleApiKey = value('AI_API_KEY')
  if (compatibleApiKey) {
    const baseUrl = (value('AI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')
    endpoints.push({
      id: 'openai_compatible',
      label: /integrate\.api\.nvidia\.com/i.test(baseUrl) ? 'NVIDIA' : 'OpenAI Compatible',
      apiKey: compatibleApiKey,
      baseUrl,
      model: config.model,
      fallbackModel: config.fallbackModel
    })
  }

  const uniqueEndpoints = endpoints.filter(
    (endpoint, index, source) =>
      source.findIndex(
        (candidate) =>
          candidate.apiKey === endpoint.apiKey &&
          candidate.baseUrl === endpoint.baseUrl &&
          candidate.model === endpoint.model
      ) === index
  )

  const preferredProvider =
    config.provider === 'openai' || config.provider === 'openai_compatible'
      ? config.provider
      : null
  if (!preferredProvider) return uniqueEndpoints

  return uniqueEndpoints.sort(
    (left, right) =>
      Number(right.id === preferredProvider) - Number(left.id === preferredProvider)
  )
}
