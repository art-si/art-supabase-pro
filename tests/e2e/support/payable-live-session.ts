import assert from 'node:assert/strict'
import { expect, type BrowserContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

export const payableAcceptanceTenantId = '111e83d3-190e-4405-84c8-440d484d13a6'

export function acceptanceRows(value: unknown): Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value))
  return value.map((item: unknown) => {
    assert.ok(item && typeof item === 'object' && !Array.isArray(item))
    return Object.fromEntries(Object.entries(item))
  })
}

export function acceptanceIdentifier(row: Record<string, unknown> | undefined): string {
  assert.ok(row && typeof row.id === 'string')
  return row.id
}

export function acceptanceRecord(value: unknown): Record<string, unknown> {
  const records = acceptanceRows(Array.isArray(value) ? value : [value])
  assert.equal(records.length, 1)
  return records[0]
}

export async function acceptanceRpc(
  client: SupabaseClient,
  name: string,
  payload: Record<string, unknown>
): Promise<unknown> {
  const response = await client.rpc(name, payload)
  expect(response.error).toBeNull()
  return response.data
}

export async function assertPayableAcceptanceSession(
  context: BrowserContext
): Promise<SupabaseClient> {
  const state = await context.storageState()
  const stored = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === 'sb-ckbftoopuyophiebamwy-auth-token')
  const session: unknown = stored ? JSON.parse(stored.value) : null
  if (
    !session ||
    typeof session !== 'object' ||
    !('access_token' in session) ||
    typeof session.access_token !== 'string'
  )
    throw new Error('缺少已验证的独立验收会话')
  const environment = loadEnv('development', process.cwd(), '')
  if (environment.VITE_SUPABASE_URL !== 'https://ckbftoopuyophiebamwy.supabase.co')
    throw new Error('真实验收仅限当前 Supabase 项目')
  const client = createClient(environment.VITE_SUPABASE_URL, environment.VITE_SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } }
  })
  const identity = await client.auth.getUser(session.access_token)
  expect(identity.error).toBeNull()
  expect(identity.data.user?.id).toBe('a9eeb9b7-e474-43e3-9cc2-c2f46c0f0ec3')
  const profile = await client
    .from('sys_user')
    .select('tenant_id,system_protected,user_roles')
    .eq('auth_user_id', identity.data.user!.id)
    .single()
  expect(profile.error).toBeNull()
  expect(profile.data?.tenant_id).toBe(payableAcceptanceTenantId)
  expect(profile.data?.system_protected).toBe(false)
  expect(profile.data?.user_roles).toEqual(['QA_AP_ACCEPTANCE_01A15DAD'])
  return client
}
