import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { resolveAiConfigTenantScope } from './ai-runtime-config-policy.ts'

interface PlatformTenantRow {
  id: string
}

let platformTenantIdPromise: Promise<string> | null = null

async function fetchPlatformTenantId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from('sys_tenant')
    .select('id')
    .eq('tenant_code', 'platform')
    .maybeSingle()

  const row = data as PlatformTenantRow | null
  if (error || !row?.id) {
    throw new Error(error?.message || 'Platform tenant is not configured')
  }
  return row.id
}

export async function getAiConfigTenantScope(
  admin: SupabaseClient,
  tenantId: string
): Promise<string[]> {
  if (!platformTenantIdPromise) {
    platformTenantIdPromise = fetchPlatformTenantId(admin)
    platformTenantIdPromise.catch(() => {
      platformTenantIdPromise = null
    })
  }

  const platformTenantId = await platformTenantIdPromise
  return resolveAiConfigTenantScope(tenantId, platformTenantId)
}
