import { expect, test, type Page } from '@playwright/test'
import { loadEnv } from 'vite'
import { firstPartyOAuthClients } from '../../src/config/first-party-oauth'

test.use({ storageState: { cookies: [], origins: [] } })

const supabaseUrl = loadEnv('e2e', process.cwd(), '').VITE_SUPABASE_URL
const appVersion = loadEnv('e2e', process.cwd(), '').VITE_VERSION
const authorizeUrl = new URL('/auth/v1/oauth/authorize', supabaseUrl)
authorizeUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: firstPartyOAuthClients[0].clientId,
  redirect_uri: 'http://localhost:3010/api/auth/callback',
  state: 'a'.repeat(43),
  code_challenge: 'b'.repeat(43),
  code_challenge_method: 'S256',
  scope: 'email profile'
}).toString()

const user = {
  id: '00000000-0000-4000-8000-000000000011',
  email: 'pending-sso@example.invalid',
  aud: 'authenticated',
  role: 'authenticated'
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
  sub: user.id,
  exp: Math.floor(Date.now() / 1000) + 3600
})}.isolated-test-signature`
const session = {
  access_token: accessToken,
  refresh_token: 'isolated-test-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: 'bearer',
  user
}

async function mockIdentity(page: Page, existingSession = false) {
  if (existingSession)
    await page.addInitScript(
      ({ value, version }) => {
        localStorage.setItem('sb-ckbftoopuyophiebamwy-auth-token', JSON.stringify(value))
        localStorage.setItem('sys-version', version)
        localStorage.setItem(
          `sys-v${version}-user`,
          JSON.stringify({
            accessToken: value.access_token,
            refreshToken: value.refresh_token,
            isLogin: true,
            dictMap: {},
            info: { userId: value.user.id, email: value.user.email }
          })
        )
      },
      { value: session, version: appVersion }
    )
  const businessRequests: string[] = []
  let authorizeVisits = 0
  page.on('request', (request) => {
    if (/bootstrap-hosted-applications|sys_menu|sys_dictionary|sys_user\?/.test(request.url()))
      businessRequests.push(request.url())
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/sys_param?*', (route) =>
    route.fulfill({
      json: {
        id: 'isolated-website-config',
        param_key: 'website.config',
        enabled: true,
        param_value: JSON.stringify({ captchaEnabled: false, authChannels: [] })
      }
    })
  )
  await page.route('**/functions/v1/check_user_status', (route) =>
    route.fulfill({ json: { allowed: true } })
  )
  await page.route('**/auth/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/oauth/authorize')) {
      authorizeVisits++
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<h1>授权端点已接收</h1>'
      })
    }
    if (url.pathname.endsWith('/token')) return route.fulfill({ json: session })
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: user })
    return route.fulfill({ status: 400, json: { message: 'Unexpected isolated auth request' } })
  })
  return { businessRequests, visits: () => authorizeVisits }
}

test('existing pro session continues a validated BFF request before business bootstrap', async ({
  page
}) => {
  test.setTimeout(90_000)
  const observed = await mockIdentity(page, true)
  await page.goto(`#/auth/login?${new URLSearchParams({ sso_authorize: authorizeUrl.href })}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page).toHaveURL(authorizeUrl.href, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: '授权端点已接收' })).toBeVisible()
  expect(observed.visits()).toBe(1)
  expect(observed.businessRequests).toEqual([])
})

test('password login continues a validated BFF request without opening the pro workbench', async ({
  page
}) => {
  test.setTimeout(90_000)
  const observed = await mockIdentity(page)
  await page.goto(`#/auth/login?${new URLSearchParams({ sso_authorize: authorizeUrl.href })}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '登录 BFF 平台' })).toBeVisible()
  await page.locator('input[name="username"]').fill(user.email)
  await page.locator('input[name="password"]').fill('isolated-test-password')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(authorizeUrl.href, { timeout: 60_000 })
  expect(observed.visits()).toBe(1)
  expect(observed.businessRequests).toEqual([])
})

test('sso_force shows the common form without clearing an existing pro session', async ({
  page
}) => {
  const observed = await mockIdentity(page, true)
  await page.goto(
    `#/auth/login?${new URLSearchParams({
      sso_authorize: authorizeUrl.href,
      sso_force: '1'
    })}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByRole('heading', { name: '登录 BFF 平台' })).toBeVisible()
  await expect(page.locator('input[name="username"]')).toHaveValue('')
  await expect(page.locator('input[name="password"]')).toHaveValue('')
  expect(observed.visits()).toBe(0)
  expect(
    await page.evaluate(() => localStorage.getItem('sb-ckbftoopuyophiebamwy-auth-token'))
  ).not.toBeNull()
})

test('untrusted pending request cannot leave pro login', async ({ page }) => {
  const observed = await mockIdentity(page)
  await page.goto(
    `#/auth/login?${new URLSearchParams({
      sso_authorize: 'https://evil.example/auth/v1/oauth/authorize?client_id=other'
    })}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByText('统一登录请求无效，请返回应用重新发起登录。')).toBeVisible()
  await expect(page.getByRole('heading', { name: '登录 BFF 平台' })).toBeVisible()
  await page.locator('input[name="username"]').fill(user.email)
  await page.locator('input[name="password"]').fill('isolated-test-password')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText('统一登录请求无效，请返回应用重新发起登录。')).toBeVisible()
  expect(page.url()).toContain('/auth/login')
  expect(observed.visits()).toBe(0)
  expect(observed.businessRequests).toEqual([])
})

test('failed BFF transaction stays on pro login and never resumes missing authorization', async ({
  page
}) => {
  test.setTimeout(90_000)
  const observed = await mockIdentity(page)
  await page.goto(
    `#/auth/login?${new URLSearchParams({
      sso_authorize: authorizeUrl.href,
      sso_error: 'service_unavailable',
      sso_force: '1'
    })}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByRole('heading', { name: '登录 BFF 平台' })).toBeVisible()
  await expect(page.getByText('应用暂时无法连接，请返回 BFF 平台重新发起登录。')).toBeVisible()
  await page.locator('input[name="username"]').fill(user.email)
  await page.locator('input[name="password"]').fill('isolated-test-password')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText('应用暂时无法连接，请返回 BFF 平台重新发起登录。')).toBeVisible()
  expect(observed.visits()).toBe(0)
  expect(observed.businessRequests).toEqual([])
})
