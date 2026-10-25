import cloudbase from '@cloudbase/js-sdk'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const environmentId = process.env.CLOUDBASE_PROBE_ENV_ID?.trim()
const email = process.env.CLOUDBASE_PROBE_EMAIL?.trim()
const password = process.env.CLOUDBASE_PROBE_PASSWORD
const expectedUid = process.env.CLOUDBASE_PROBE_UID?.trim()

if (!environmentId || !email || !password || !expectedUid) {
  throw new Error('CloudBase probe environment is incomplete')
}

const app = cloudbase.init({ env: environmentId, region: 'ap-shanghai' })
const auth = typeof app.auth === 'function' ? app.auth({ persistence: 'none' }) : app.auth
const signIn = await auth.signInWithPassword({ email, password })
if (signIn.error || signIn.data?.user?.id !== expectedUid) {
  throw new Error('CloudBase password login did not return the expected user', {
    cause: signIn.error
  })
}

const publishableKey = (await readFile('.env.local', 'utf8')).match(
  /^VITE_CLOUDBASE_PUBLISHABLE_KEY=(.+)$/mu
)?.[1]
if (!publishableKey) throw new Error('CloudBase publishable key is missing')
const gatewayOrigin = `https://${environmentId}.api.tcloudbasegateway.com`
const database = createClient(gatewayOrigin, publishableKey.trim(), {
  global: {
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      url.pathname = `/v1/rdb/rest${url.pathname.slice('/rest/v1'.length)}`
      const headers = new Headers(input instanceof Request ? input.headers : undefined)
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value))
      const session = await auth.getSession()
      headers.set(
        'Authorization',
        `Bearer ${session.data?.session?.access_token || publishableKey}`
      )
      headers.set('apikey', publishableKey.trim())
      return fetch(url, { ...init, headers })
    }
  },
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
})
const profile = await database
  .from('sys_user')
  .select('id,auth_user_id,tenant_id')
  .eq('auth_user_id', expectedUid)
  .single()
if (profile.error || profile.data?.auth_user_id !== expectedUid || !profile.data.tenant_id) {
  throw new Error('CloudBase PostgreSQL RLS read did not return the probe profile', {
    cause: profile.error
  })
}

const accessToken = signIn.data?.session?.access_token
if (!accessToken) throw new Error('CloudBase login did not return an access token')
const currentUser = await auth.getUser()
if (currentUser.error || currentUser.data?.user?.id !== expectedUid) {
  throw new Error('CloudBase SDK could not resolve the signed-in user', {
    cause: currentUser.error
  })
}
const claims = await auth.getClaims()
if (claims.error || claims.data?.claims.sub !== expectedUid) {
  throw new Error('CloudBase SDK did not return the expected JWT claims', { cause: claims.error })
}
const [superResult, roleNamesResult] = await Promise.all([
  database.rpc('current_is_super'),
  database.rpc('current_user_role_names')
])
if (
  superResult.error ||
  typeof superResult.data !== 'boolean' ||
  roleNamesResult.error ||
  !Array.isArray(roleNamesResult.data)
) {
  throw new Error('CloudBase bootstrap RPC verification failed', {
    cause:
      superResult.error ??
      roleNamesResult.error ??
      new Error(
        JSON.stringify({ superData: superResult.data, roleNamesData: roleNamesResult.data })
      )
  })
}
const edgeResponse = await fetch(
  'https://art-supabase-staging-d8a9e32316e-1257156420.ap-shanghai.app.tcloudbase.com/edge-runtime?function=check_user_status',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: '{}'
  }
)
const edgeResult = (await edgeResponse.json().catch(() => null)) as {
  allowed?: boolean
  code?: string
} | null
const edgeAccepted =
  (edgeResponse.ok && edgeResult?.allowed === true) ||
  (edgeResponse.status === 403 && edgeResult?.code === 'role_not_assigned')
if (!edgeAccepted) {
  throw new Error(
    `CloudBase Edge runtime access check failed with HTTP ${edgeResponse.status}: ${JSON.stringify(edgeResult)}`
  )
}

await auth.signOut()
process.stdout.write(
  `${JSON.stringify({ auth: 'ok', postgres: 'ok', bootstrapRpc: 'ok', edge: 'ok', tenantIdPresent: true })}\n`
)
