import type { AiProviderEndpoint } from './ai-provider-endpoints.ts'

export class AiProviderRequestError extends Error {
  constructor(readonly status: number) {
    super(`AI provider request failed with HTTP ${status}`)
    this.name = 'AiProviderRequestError'
  }
}

/** Keep the preferred provider failure when every fallback also fails. */
export async function requestAiProviderWithFallback<T>(
  endpoints: AiProviderEndpoint[],
  request: (endpoint: AiProviderEndpoint) => Promise<T>
): Promise<{ endpoint: AiProviderEndpoint; result: T }> {
  let primaryError: Error | undefined
  for (const endpoint of endpoints) {
    try {
      return { endpoint, result: await request(endpoint) }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('AI provider request failed', { cause: error })
      primaryError ??= failure
      console.warn('AI provider fallback', endpoint.label, failure.message)
    }
  }
  throw primaryError ?? new Error('AI provider is not configured')
}

export function getAiProviderFailure(error: unknown): { code: string; message: string } | null {
  if (!(error instanceof AiProviderRequestError)) return null
  if (error.status === 404 || error.status === 410) {
    return { code: 'provider_model_unavailable', message: '当前配置的模型已下线或不可用，请联系平台管理员在 AI 配置中切换可用模型' }
  }
  if (error.status === 401 || error.status === 403) {
    return { code: 'provider_auth_failed', message: '模型服务鉴权失败，请联系平台管理员核对服务密钥与接口地址' }
  }
  if (error.status === 429) {
    return { code: 'provider_rate_limited', message: '模型服务请求较多，请稍后重试' }
  }
  return { code: 'provider_request_failed', message: '模型服务暂时不可用，请稍后重试' }
}
