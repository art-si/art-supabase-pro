import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'

async function setScope(page: Page, active: boolean, tenant: string | null) {
  await page.evaluate(
    async ({ active, tenant }) => {
      const path = '/src/utils/tenant-scope-context.ts'
      const scope = (await import(path)) as typeof import('../../src/utils/tenant-scope-context')
      scope.writePlatformTenantScopeActive(active)
      scope.writeTenantScopeId(tenant)
    },
    { active, tenant }
  )
}

async function invokeProbe(page: Page, headers?: Record<string, string>) {
  return page.evaluate(async (requestHeaders) => {
    const path = '/src/utils/supabase/functions.ts'
    const { invokeSupabaseFunctionWithSessionRecovery } = (await import(
      path
    )) as typeof import('../../src/utils/supabase/functions')
    const response = await invokeSupabaseFunctionWithSessionRecovery('tenant-scope-probe', {
      body: { action: 'probe' },
      headers: requestHeaders
    })
    return { ok: response.error === null, data: response.data }
  }, headers)
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90000)
  await prepareIsolatedSession(page)
  // A transport-only document avoids unrelated SQL workspace HMR and background requests.
  await page.route('**/tests/e2e/fixtures/edge-function-tenant-scope.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="zh-CN"><title>Edge scope fixture</title><script>window.__CLOUDBASE_BUILD__ = false</script><body></body></html>'
    })
  )
  await page.goto('/tests/e2e/fixtures/edge-function-tenant-scope.html')
})

test('Edge calls carry selected scope, keep platform-all and ordinary scope implicit, and preserve explicit targets', async ({
  page
}) => {
  const seen: Array<string | undefined> = []
  await page.route('**/functions/v1/tenant-scope-probe', (route) => {
    seen.push(route.request().headers()['x-art-tenant-scope'])
    return route.fulfill({ json: { ok: true } })
  })
  await setScope(page, true, tenantA)
  expect((await invokeProbe(page)).ok).toBe(true)
  await setScope(page, true, null)
  await invokeProbe(page)
  await setScope(page, false, tenantA)
  await invokeProbe(page)
  await setScope(page, true, tenantA)
  await invokeProbe(page, { 'x-art-tenant-scope': tenantB })
  expect(seen).toEqual([tenantA, undefined, undefined, tenantB])
})

test('a token-refresh retry retains the request scope after the shell selection changes', async ({
  page
}) => {
  const seen: Array<string | undefined> = []
  let refreshCalls = 0
  let releaseRefresh!: () => void
  await page.route('**/auth/v1/token**', async (route) => {
    refreshCalls++
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const now = Math.floor(Date.now() / 1000)
    const user = { id: 'permission-test-auth', aud: 'authenticated', role: 'authenticated' }
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: user.aud, role: user.role, iat: now, exp: now + 7200 })}.refreshed-test-signature`
    await route.fulfill({
      json: {
        access_token: token,
        refresh_token: 'isolated-refreshed-token',
        token_type: 'bearer',
        expires_in: 7200,
        expires_at: now + 7200,
        user
      }
    })
  })
  await page.route('**/functions/v1/tenant-scope-probe', (route) => {
    seen.push(route.request().headers()['x-art-tenant-scope'])
    if (seen.length === 1)
      return route.fulfill({ status: 401, json: { code: 'PGRST301', message: 'JWT expired' } })
    return route.fulfill({ json: { ok: true } })
  })
  await setScope(page, true, tenantA)
  const pending = invokeProbe(page)
  await expect.poll(() => refreshCalls).toBe(1)
  await setScope(page, true, tenantB)
  releaseRefresh()
  expect((await pending).ok).toBe(true)
  expect(seen).toEqual([tenantA, tenantA])
  await invokeProbe(page)
  expect(seen).toEqual([tenantA, tenantA, tenantB])
})
