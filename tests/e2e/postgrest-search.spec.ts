import { expect, test } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { buildOrIlikeFilter } from '../../src/utils/supabase/search'

// Read-only integration regression. HEAD requests validate the real parser;
// no business rows, credentials, or response bodies are added to screenshots.
test('PostgREST accepts reserved characters without interpreting them as OR clauses', async ({
  context
}) => {
  const env = loadEnv('development', process.cwd(), '')
  const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_KEY || env.VITE_SUPABASE_KEY
  expect(new URL(url).hostname).toBe('ckbftoopuyophiebamwy.supabase.co')
  const storage = await context.storageState()
  const entry = storage.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === 'sb-ckbftoopuyophiebamwy-auth-token')
  const session: unknown = JSON.parse(entry?.value ?? 'null')
  if (
    !session ||
    typeof session !== 'object' ||
    !('access_token' in session) ||
    typeof session.access_token !== 'string'
  ) {
    throw new Error('测试会话不可用，请先执行登录准备用例')
  }
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } }
  })
  for (const keyword of [
    'MDM,phase(1)',
    'a"b\\c',
    '甲:乙.丙',
    'a\nb\tc',
    '运单_%*',
    '"),name.not.is.null,(name.ilike."'
  ]) {
    const { error, status } = await client
      .from('sys_dict_type')
      .select('id', { head: true, count: 'exact' })
      .or(buildOrIlikeFilter(['name', 'code'], keyword))
      .limit(1)
    expect(error?.code, `特殊字符查询失败：${keyword}`).toBeUndefined()
    expect([200, 206]).toContain(status)
  }
})

test('parameter search uses the shared filter and preserves punctuation in the UI', async ({
  page
}, testInfo) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  // The real parser is covered above. Keep the UI case independent of remote
  // profile/menu latency and avoid placing tenant identity in visual evidence.
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: '00000000-0000-4000-8000-000000000001',
        user_name: '搜索回归账号',
        tenant_id: '00000000-0000-4000-8000-000000000002',
        tenant: { tenant_code: 'test', tenant_name: '测试租户' },
        status: '1'
      }
    })
  )
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '平台', baseUrl: '/', sort: 1 }] })
  )
  const menu = {
    id: 'test-system-param',
    parentId: 'test-system',
    name: 'SystemParam',
    path: 'system-param',
    component: '/system/system-param',
    type: 'menu',
    meta: { title: '参数设置', is_enable: true, is_hide: false },
    children: []
  }
  const parent = {
    id: 'test-system',
    parentId: null,
    name: 'System',
    path: '/system',
    component: '/index/index',
    type: 'folder',
    meta: { title: '系统管理', is_enable: true, is_hide: false },
    children: [menu]
  }
  await mockApplicationMenus(page, { platform: [{ ...parent, children: undefined }, menu] })
  await page.route('**/rest/v1/sys_param?*', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '*/0' },
      body: '[]'
    })
  })
  await page.goto('#/system/system-param', { waitUntil: 'domcontentloaded' })
  const root = page.locator('.system-param-page')
  await expect(root).toBeVisible({ timeout: 60_000 })
  const guide = page.locator('.setting-guide')
  const guideVisible = await guide
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)
  if (guideVisible) await guide.getByRole('button', { name: '知道了' }).click()
  const input = root.getByPlaceholder('搜索参数名称、键名或说明')
  const keyword = '测试参数(甲),"乙"'
  await input.fill(keyword)
  const requestPromise = page.waitForRequest((request) => {
    const url = new URL(request.url())
    return url.pathname.endsWith('/sys_param') && url.searchParams.has('or')
  })
  await root.getByRole('button', { name: '查询', exact: true }).click()
  const request = await requestPromise
  expect(new URL(request.url()).searchParams.get('or')).toBe(
    `(${buildOrIlikeFilter(['param_name', 'param_key', 'remark'], keyword)})`
  )
  await expect(input).toHaveValue(keyword)
  await expect(root.locator('.el-loading-mask:visible')).toHaveCount(0)
  expect(pageErrors).toEqual([])
  await root.screenshot({ path: testInfo.outputPath('system-param-search.png') })
})
