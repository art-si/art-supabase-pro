import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AiProviderRequestError,
  getAiProviderFailure,
  requestAiProviderWithFallback
} from '../../supabase/functions/_shared/ai-provider-request'
import type { AiProviderEndpoint } from '../../supabase/functions/_shared/ai-provider-endpoints'

const endpoints: AiProviderEndpoint[] = [
  {
    id: 'openai_compatible',
    label: 'NVIDIA',
    apiKey: 'test',
    baseUrl: 'https://example.test',
    model: 'primary',
    fallbackModel: null
  },
  {
    id: 'openai',
    label: 'OpenAI',
    apiKey: 'test',
    baseUrl: 'https://example.test',
    model: 'backup',
    fallbackModel: null
  }
]

test('retired primary model remains the reported failure after fallback authentication fails', async () => {
  const retired = new AiProviderRequestError(410)
  await assert.rejects(
    requestAiProviderWithFallback(endpoints, async (endpoint) => {
      throw endpoint.id === 'openai_compatible' ? retired : new AiProviderRequestError(401)
    }),
    (error) => error === retired
  )
  assert.equal(getAiProviderFailure(retired)?.code, 'provider_model_unavailable')
})

test('a successful backup still recovers the request', async () => {
  const result = await requestAiProviderWithFallback(endpoints, async (endpoint) => {
    if (endpoint.id === 'openai_compatible') throw new AiProviderRequestError(410)
    return 'recovered'
  })
  assert.equal(result.endpoint.id, 'openai')
  assert.equal(result.result, 'recovered')
})

test('provider HTTP failures use stable codes and actionable Chinese messages', () => {
  for (const [status, code] of [
    [401, 'provider_auth_failed'],
    [403, 'provider_auth_failed'],
    [404, 'provider_model_unavailable'],
    [410, 'provider_model_unavailable'],
    [429, 'provider_rate_limited'],
    [502, 'provider_request_failed']
  ] as const) {
    const failure = getAiProviderFailure(new AiProviderRequestError(status))
    assert.equal(failure?.code, code)
    assert.doesNotMatch(failure?.message ?? '', /HTTP|stack|Bearer/)
  }
  assert.equal(getAiProviderFailure(new DOMException('timed out', 'AbortError')), null)
  assert.equal(getAiProviderFailure(new Error('database failure')), null)
})
