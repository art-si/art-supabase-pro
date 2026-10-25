export type ApiProvider = 'supabase' | 'java'

const DEFAULT_API_PROVIDER: ApiProvider = 'supabase'
const VALID_API_PROVIDERS = new Set<ApiProvider>(['supabase', 'java'])

function resolveApiProvider(value: unknown): ApiProvider {
  if (typeof value !== 'string') return DEFAULT_API_PROVIDER

  const normalizedValue = value.trim().toLowerCase() as ApiProvider
  return VALID_API_PROVIDERS.has(normalizedValue) ? normalizedValue : DEFAULT_API_PROVIDER
}

export const apiProvider = resolveApiProvider(import.meta.env.VITE_API_PROVIDER)
export const isSupabaseApi = apiProvider === 'supabase'
export const isJavaApi = apiProvider === 'java'
