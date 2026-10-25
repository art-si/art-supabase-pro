export interface AiRuntimeConfig {
  enabled: boolean
  provider: string
  model: string
  visionModel: string | null
  fallbackModel: string | null
  timeoutMs: number
  maxRetries: number
  temperature: number
  maxTokens: number
  rateLimitPerMinute: number
  rateLimitPerDay: number
  promptVersion: string
}

/**
 * Ordinary tenants inherit the platform AI configuration when they do not
 * provide an explicit tenant override. Platform users only read platform data.
 */
export function resolveAiConfigTenantScope(
  tenantId: string,
  platformTenantId: string
): string[] {
  return tenantId === platformTenantId ? [tenantId] : [tenantId, platformTenantId]
}

/**
 * AI capabilities fail closed when tenant-level governance is unavailable.
 * Provider defaults remain available for administrators to seed a reviewed config later.
 */
export function disableAiRuntimeConfig(defaults: AiRuntimeConfig): AiRuntimeConfig {
  return { ...defaults, enabled: false }
}
