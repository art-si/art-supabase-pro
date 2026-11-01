import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '00000000-0000-4000-8000-000000000001'
const connection = {
  id: '00000000-0000-4000-8000-000000000011',
  name: '恢复测试数据库',
  dialect: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'analytics',
  username: 'reader',
  tls: false,
  enabled: true,
  tenantId,
  allowedUserIds: [],
  updatedAt: '2026-10-30T00:00:00Z'
}
const snapshot = { connections: [connection], canManage: true, users: [] }
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,content-type,x-art-tenant-scope'
}

function refreshedSession(userId = 'permission-test-auth') {
  const now = Math.floor(Date.now() / 1000)
  const user = { id: userId, aud: 'authenticated', role: 'authenticated' }
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: userId,
      aud: user.aud,
      role: user.role,
      iat: now,
      exp: now + 7200
    })}.refreshed-test-signature`,
    refresh_token: 'refreshed-isolated-session',
    expires_in: 7200,
    expires_at: now + 7200,
    token_type: 'bearer',
    user
  }
}

async function invokeExecutor(page: Page, routes: string[]) {
  return page.evaluate(async (paths) => {
    const modulePath = '/src/api/local-executor.ts'
    const { requestLocalExecutor } = (await import(
      modulePath
    )) as typeof import('../../src/api/local-executor')
    return Promise.all(
      paths.map(async (path) => {
        try {
          const value = await requestLocalExecutor('http://127.0.0.1:4319', path, {
            name: '合成连接'
          })
          return { ok: true, value }
        } catch (cause) {
          return { ok: false, message: cause instanceof Error ? cause.message : '' }
        }
      })
    )
  }, routes)
}

test.beforeEach(async ({ page }, info) => {
  page.setDefaultTimeout(10_000)
  page.setDefaultNavigationTimeout(60_000)
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.route('**/functions/v1/execute-sql-with-columns', (route) =>
    route.fulfill({
      json: { schemas: ['public'], tables: [], columns: [], functions: [], foreignKeys: [] }
    })
  )
})

async function openConsole(page: Page) {
  await page.goto(
    `/tests/e2e/fixtures/sql-console-metadata.html?actor=connection-recovery&tenant=${tenantId}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByRole('button', { name: '连接管理', exact: true })).toBeVisible()
}

test('并发认证过期共享一次刷新，仅重试尚未开始的请求', async ({ page }) => {
  const session = refreshedSession()
  let refreshCalls = 0
  let rejectedCalls = 0
  let releaseRefresh!: () => void
  const calls: string[] = []
  await page.route('**/auth/v1/token**', async (route) => {
    refreshCalls++
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    await route.fulfill({ json: session })
  })
  await page.route('http://127.0.0.1:4319/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    calls.push(new URL(route.request().url()).pathname)
    if (route.request().headers().authorization !== `Bearer ${session.access_token}`) {
      rejectedCalls++
      return route.fulfill({
        status: 401,
        headers,
        json: { code: 'PLATFORM_AUTH_REQUIRED', message: '登录状态已失效，请重新登录' }
      })
    }
    return route.fulfill({ headers, json: { ok: true } })
  })
  await openConsole(page)
  const pending = invokeExecutor(page, ['/connections/save', '/connections/test'])
  await expect.poll(() => rejectedCalls).toBe(2)
  await expect.poll(() => refreshCalls).toBe(1)
  releaseRefresh()
  expect(await pending).toEqual([
    { ok: true, value: { ok: true } },
    { ok: true, value: { ok: true } }
  ])
  expect(refreshCalls).toBe(1)
  expect(calls.filter((path) => path === '/connections/save')).toHaveLength(2)
  expect(calls.filter((path) => path === '/connections/test')).toHaveLength(2)
})

test('保存遇到网络故障、普通401和403时不刷新或重放', async ({ page }) => {
  let refreshCalls = 0
  let calls = 0
  let status = 503
  let code = 'PLATFORM_IDENTITY_UNAVAILABLE'
  await page.route('**/auth/v1/token**', (route) => {
    refreshCalls++
    return route.fulfill({ json: refreshedSession() })
  })
  await page.route('http://127.0.0.1:4319/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    calls++
    return route.fulfill({
      status,
      headers,
      json: { code, message: '连接操作未完成，请重试' }
    })
  })
  await openConsole(page)
  for (const failure of [
    { status: 503, code: 'PLATFORM_IDENTITY_UNAVAILABLE' },
    { status: 401, code: 'UPSTREAM_UNAUTHORIZED' },
    { status: 403, code: 'PLATFORM_AUTH_REQUIRED' }
  ]) {
    ;({ status, code } = failure)
    expect(await invokeExecutor(page, ['/connections/save'])).toEqual([
      { ok: false, message: '连接操作未完成，请重试' }
    ])
  }
  expect(calls).toBe(3)
  expect(refreshCalls).toBe(0)
})

test('刷新后仍过期只重试一次，刷新得到不同账号时不重放保存', async ({ page }) => {
  let refreshCalls = 0
  let calls = 0
  let refreshUser = 'permission-test-auth'
  await page.route('**/auth/v1/token**', (route) => {
    refreshCalls++
    return route.fulfill({ json: refreshedSession(refreshUser) })
  })
  await page.route('http://127.0.0.1:4319/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    calls++
    return route.fulfill({
      status: 401,
      headers,
      json: { code: 'PLATFORM_AUTH_REQUIRED', message: '登录状态已失效，请重新登录' }
    })
  })
  await openConsole(page)
  expect(await invokeExecutor(page, ['/connections/save'])).toEqual([
    { ok: false, message: '登录状态已失效，请重新登录' }
  ])
  expect(calls).toBe(2)
  expect(refreshCalls).toBe(1)
  refreshUser = 'different-isolated-account'
  expect(await invokeExecutor(page, ['/connections/save'])).toEqual([
    { ok: false, message: '登录状态未能恢复，请检查网络后重试或重新登录' }
  ])
  expect(calls).toBe(3)
  expect(refreshCalls).toBe(2)
})

test('刷新连接失败清除就绪状态并展开可操作的恢复设置', async ({ page }, info) => {
  let failed = false
  await page.route('http://127.0.0.1:4319/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    return failed
      ? route.fulfill({
          status: 503,
          headers,
          json: {
            code: 'PLATFORM_IDENTITY_UNAVAILABLE',
            message: '无法连接平台身份服务，请检查执行端网络或代理后重试'
          }
        })
      : route.fulfill({ headers, json: snapshot })
  })
  await openConsole(page)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('textbox', { name: 'SQL 执行端地址', exact: true })).toBeHidden()
  failed = true
  await drawer.getByRole('button', { name: '刷新连接', exact: true }).click()
  await expect(drawer).toContainText('无法连接平台身份服务，请检查执行端网络或代理后重试')
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toHaveCount(0)
  await expect(drawer.getByRole('textbox', { name: 'SQL 执行端地址', exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '复制启动命令', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('connection-error-recovery.png') })
  failed = false
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '使用', exact: true })).toBeVisible()
})

test('连接测试期间修改参数，旧结果不覆盖新测试的准备状态', async ({ page }) => {
  let testCalls = 0
  const releases: (() => void)[] = []
  await page.route('http://127.0.0.1:4319/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    if (new URL(route.request().url()).pathname === '/connections/test') {
      testCalls++
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
      await route.fulfill({ headers, json: { ok: true } })
      return
    }
    await route.fulfill({ headers, json: snapshot })
  })
  await openConsole(page)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await drawer.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑数据库连接', exact: true })
  const testButton = dialog.getByRole('button', { name: '测试连接', exact: true })
  await testButton.click()
  await expect.poll(() => testCalls).toBe(1)
  await dialog.getByRole('textbox', { name: /主机地址/ }).fill('localhost-new')
  await expect(testButton).toBeEnabled()
  await testButton.click()
  await expect.poll(() => testCalls).toBe(2)
  releases[0]()
  await expect(testButton).toBeDisabled()
  await expect(dialog.getByText('连接成功 · 只读事务可用', { exact: true })).toHaveCount(0)
  releases[1]()
  await expect(dialog.getByText('连接成功 · 只读事务可用', { exact: true })).toBeVisible()
  await expect(testButton).toBeEnabled()
})

test('连接地址变更后晚到的旧服务响应不会覆盖新服务或恢复旧地址', async ({ page }) => {
  let oldCalls = 0
  let newCalls = 0
  let releaseOld!: () => void
  await page.route('http://127.0.0.1:4319/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    oldCalls++
    if (oldCalls === 2)
      await new Promise<void>((resolve) => {
        releaseOld = resolve
      })
    await route.fulfill({ headers, json: snapshot })
  })
  await page.route('http://127.0.0.1:4320/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    newCalls++
    return route.fulfill({
      headers,
      json: { ...snapshot, connections: [{ ...connection, name: '新执行端数据库' }] }
    })
  })
  await openConsole(page)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '数据库连接', exact: true })
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await drawer.locator('summary').filter({ hasText: '高级连接设置' }).click()
  await drawer.getByRole('button', { name: '刷新连接', exact: true }).click()
  await expect.poll(() => oldCalls).toBe(2)
  await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
  await expect(drawer).toHaveCount(0)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  await expect(drawer.getByText('连接服务已就绪', { exact: true })).toBeVisible()
  await drawer.locator('summary').filter({ hasText: '高级连接设置' }).click()
  await drawer
    .getByRole('textbox', { name: 'SQL 执行端地址', exact: true })
    .fill('http://127.0.0.1:4320')
  await drawer.getByRole('button', { name: '连接执行端', exact: true }).click()
  await expect(drawer.getByText('新执行端数据库', { exact: true })).toBeVisible()
  releaseOld()
  await expect(drawer.getByText('恢复测试数据库', { exact: true })).toHaveCount(0)
  await drawer.getByRole('button', { name: '关闭', exact: true }).last().click()
  await expect(drawer).toHaveCount(0)
  await page.getByRole('button', { name: '连接管理', exact: true }).click()
  await expect(drawer.getByText('新执行端数据库', { exact: true })).toBeVisible()
  expect(newCalls).toBe(2)
  expect(oldCalls).toBe(3)
})
