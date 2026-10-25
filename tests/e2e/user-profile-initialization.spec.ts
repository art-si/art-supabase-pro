import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

async function openProbe(page: Page): Promise<void> {
  test.setTimeout(90_000)
  // Keep this API/state regression independent of live profile/menu latency.
  // Authentication data and business writes never leave the isolated page.
  await page.route('**/rest/v1/sys_param?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'probe-user',
        user_email: 'probe@example.invalid',
        status: '1',
        user_roles: ['CUSTOM_ROLE_CODE'],
        system_protected: false
      }
    })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/current_user_role_names', (route) =>
    route.fulfill({ json: ['数据库测试角色'] })
  )
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ json: { id: 'probe-auth-user', aud: 'authenticated', role: 'authenticated' } })
  )
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }] })
  )
  const menu = {
    id: 'probe-dictionary',
    parentId: null,
    name: 'ProbeDictionary',
    path: '/data-center/dict',
    component: '/data-center/dict',
    type: 'menu',
    meta: { title: '测试字典', is_enable: true, is_hide: false },
    children: []
  }
  await mockApplicationMenus(page, { platform: [menu] })
  await page.goto('#/500?redirect=/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '服务暂时开小差' })).toBeVisible({
    timeout: 45_000
  })
}

test('cancelled profile initialization does not continue after slow claims verification', async ({
  page
}) => {
  await openProbe(page)
  const result = await page.evaluate(async () => {
    const authPath = '/src/api/auth.ts'
    const pluginPath = '/src/plugins/supabase.ts'
    const { fetchCurrentUserInfo } = await import(/* @vite-ignore */ authPath)
    const { supabase } = await import(/* @vite-ignore */ pluginPath)
    const originalClaims = supabase.auth.getClaims
    const originalSession = supabase.auth.getSession
    let claimsCalls = 0
    let sessionCalls = 0
    let releaseClaims = () => {}
    const claimsReady = new Promise<void>((resolve) => {
      releaseClaims = resolve
    })
    supabase.auth.getClaims = async () => {
      claimsCalls += 1
      await claimsReady
      return { data: { claims: { sub: 'probe-auth-user' } }, error: null }
    }
    supabase.auth.getSession = async () => {
      sessionCalls += 1
      throw new Error('Cancelled initialization must not request a session')
    }
    try {
      const cancelledBeforeStart = new AbortController()
      cancelledBeforeStart.abort()
      const beforeStart = await fetchCurrentUserInfo(cancelledBeforeStart.signal).then(
        () => 'resolved',
        (error: Error) => error.name
      )
      const controller = new AbortController()
      const pending = fetchCurrentUserInfo(controller.signal).then(
        () => 'resolved',
        (error: Error) => error.name
      )
      controller.abort()
      releaseClaims()
      return { beforeStart, afterClaims: await pending, claimsCalls, sessionCalls }
    } finally {
      supabase.auth.getClaims = originalClaims
      supabase.auth.getSession = originalSession
    }
  })
  expect(result).toEqual({
    beforeStart: 'AbortError',
    afterClaims: 'AbortError',
    claimsCalls: 1,
    sessionCalls: 0
  })
})

test('permission service failure is not cached as a successful user profile and can recover', async ({
  page
}) => {
  await openProbe(page)
  let permissionMode: 'unavailable' | 'invalid' | 'ordinary' = 'unavailable'
  await page.route('**/rest/v1/rpc/current_is_super', (route) =>
    route.fulfill({
      status: permissionMode === 'unavailable' ? 503 : 200,
      json:
        permissionMode === 'unavailable'
          ? { code: 'PGRST503', message: 'Injected permission service failure' }
          : permissionMode === 'invalid'
            ? null
            : false
    })
  )
  const runProfile = () =>
    page.evaluate(async () => {
      const apiPath = '/src/api/auth.ts'
      const pluginPath = '/src/plugins/supabase.ts'
      const storePath = '/src/store/modules/user.ts'
      const { supabase } = await import(/* @vite-ignore */ pluginPath)
      const { useUserStore } = await import(/* @vite-ignore */ storePath)
      const { fetchCurrentUserInfo } = await import(/* @vite-ignore */ apiPath)
      const store = useUserStore()
      const before = JSON.stringify(store.info)
      const originalClaims = supabase.auth.getClaims
      const originalSession = supabase.auth.getSession
      supabase.auth.getClaims = async () => ({
        data: { claims: { sub: 'probe-auth-user' } },
        error: null
      })
      supabase.auth.getSession = async () => ({
        data: {
          session: {
            access_token: 'isolated-profile-token',
            refresh_token: 'isolated-profile-refresh',
            expires_in: 3600,
            token_type: 'bearer',
            user: {
              id: 'probe-auth-user',
              aud: 'authenticated',
              app_metadata: {},
              user_metadata: {},
              created_at: '2026-10-03T00:00:00Z'
            }
          }
        },
        error: null
      })
      try {
        await store.fetchUserInfo()
        const response = await fetchCurrentUserInfo()
        return {
          status: 'ready',
          platformSuper: response.data?.platformSuper,
          roleNames: response.data?.roleNames
        }
      } catch (error) {
        return {
          status: 'failed',
          unchanged: JSON.stringify(store.info) === before,
          message: error instanceof Error ? error.message : 'Unexpected error'
        }
      } finally {
        supabase.auth.getClaims = originalClaims
        supabase.auth.getSession = originalSession
      }
    })
  expect(await runProfile()).toMatchObject({
    status: 'failed',
    unchanged: true,
    message: '账号权限校验失败，请重试'
  })
  permissionMode = 'invalid'
  expect(await runProfile()).toMatchObject({
    status: 'failed',
    unchanged: true,
    message: '账号权限校验未返回有效结果，请重试'
  })
  permissionMode = 'ordinary'
  expect(await runProfile()).toEqual({
    status: 'ready',
    platformSuper: false,
    roleNames: ['数据库测试角色']
  })
  await page.route('**/rest/v1/rpc/current_user_role_names', (route) =>
    route.fulfill({ status: 503, json: { code: 'PGRST503', message: 'unavailable' } })
  )
  expect(await runProfile()).toEqual({
    status: 'ready',
    platformSuper: false,
    roleNames: ['CUSTOM_ROLE_CODE']
  })
})
