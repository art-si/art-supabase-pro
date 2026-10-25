export type BaasProvider = 'supabase' | 'cloudbase'

const DEFAULT_BAAS_PROVIDER: BaasProvider = 'supabase'
const VALID_BAAS_PROVIDERS = new Set<BaasProvider>(['supabase', 'cloudbase'])

const resolveBaasProvider = (value: unknown): BaasProvider => {
  if (typeof value !== 'string') return DEFAULT_BAAS_PROVIDER
  const normalized = value.trim().toLowerCase() as BaasProvider
  return VALID_BAAS_PROVIDERS.has(normalized) ? normalized : DEFAULT_BAAS_PROVIDER
}

export const baasProvider = resolveBaasProvider(import.meta.env.VITE_BAAS_PROVIDER)
export const isCloudBaseBaas = baasProvider === 'cloudbase'
