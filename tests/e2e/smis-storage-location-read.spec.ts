import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = '/tests/e2e/fixtures/smis-storage-location-read.html'
const evidenceDir = join(
  process.cwd(),
  '.artifacts',
  'quality-audit',
  'smis-storage-location-read-browser'
)
const metricLabels = ['位置总数', '已启用', '一级位置', '已配置负责人']
const overviewA = { total: 25, enabled: 18, root_count: 2, managed_count: 7 }
const overviewB = { total: 7, enabled: 5, root_count: 1, managed_count: 3 }

function location(index: number, tenantId = tenantA) {
  return {
    id: `location-${index}`,
    tenant_id: tenantId,
    parent_id: null,
    organization_id: 'organization-1',
    location_code: `LOC-${index}`,
    location_name: `存放位置 ${index}`,
    location_short_name: `位置${index}`,
    status: 'enabled',
    child_count: 0,
    organization: {
      id: 'organization-1',
      organization_code: 'ORG-1',
      organization_name: '生产部门'
    },
    responsible: null
  }
}

function requestParams(route: Route): Record<string, unknown> {
  const payload: unknown = route.request().postDataJSON()
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function fulfillList(
  route: Route,
  records: object[],
  total: number,
  tree: unknown = [location(1), location(2)],
  overview: unknown = overviewA
) {
  return route.fulfill({ json: { records, total, tree, overview } })
}

const metric = (page: Page, label: string) =>
  page.locator('.business-workspace-header__metric').filter({ hasText: label }).locator('strong')

async function expectOverview(page: Page, values: Array<string | number>) {
  for (const [index, label] of metricLabels.entries())
    await expect(metric(page, label)).toHaveText(String(values[index]))
}

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
}

for (const scenario of [
  {
    name: 'light-border-1440',
    width: 1440,
    appearance: { theme: 'light' as const, boxBorderMode: true }
  },
  {
    name: 'dark-shadow-570',
    width: 570,
    appearance: { theme: 'dark' as const, boxBorderMode: false }
  }
]) {
  test(`存放位置失败、组合专注与重试 ${scenario.name}`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await prepareIsolatedSession(page)
    await prepareAppearance(page, scenario.appearance)
    let calls = 0
    let notifyFirst: (() => void) | undefined
    let releaseFirst: (() => void) | undefined
    const firstRequested = new Promise<void>((resolve) => (notifyFirst = resolve))
    await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', async (route) => {
      calls++
      if (calls === 1) {
        notifyFirst?.()
        await new Promise<void>((resolve) => (releaseFirst = resolve))
        await route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'select * from secret' }
        })
        return
      }
      await fulfillList(route, [location(1)], 1, [location(1)], {
        total: 1,
        enabled: 1,
        root_count: 1,
        managed_count: 0
      })
    })
    await page.goto(fixture, { waitUntil: 'domcontentloaded' })
    await assertAppearance(page, scenario.appearance)
    await firstRequested
    await expectOverview(page, ['—', '—', '—', '—'])
    releaseFirst?.()
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expectOverview(page, ['—', '—', '—', '—'])
    const navigator = page.locator('.storage-location-navigator')
    await expect(
      navigator.getByText('存放位置树加载失败，请稍后重试。', { exact: true })
    ).toBeVisible()
    await expect(navigator.getByText('暂无存放位置')).toHaveCount(0)
    const navigatorBox = await navigator.boundingBox()
    const primaryBox = await page.locator('.art-workspace-splitter__primary').boundingBox()
    const treeRetryBox = await navigator.getByRole('button', { name: '重新加载' }).boundingBox()
    expect(
      navigatorBox &&
        primaryBox &&
        treeRetryBox &&
        treeRetryBox.y >= navigatorBox.y &&
        treeRetryBox.y + treeRetryBox.height <= navigatorBox.y + navigatorBox.height &&
        treeRetryBox.y + treeRetryBox.height <= primaryBox.y + primaryBox.height
    ).toBe(true)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from secret')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `storage-error-${scenario.name}.png`)

    const focus = page.getByRole('switch', { name: '进入专注模式' })
    await focus.locator('..').click()
    await expect(page.locator('.storage-location-page .business-workspace-header')).toBeHidden()
    await expect(navigator).toBeVisible()
    await expect(page.locator('.storage-location-page .art-table-query')).toBeVisible()
    await page.getByRole('button', { name: '退出专注模式' }).click({ timeout: 5_000 })
    await expect(page.locator('.storage-location-page .business-workspace-header')).toBeVisible()
    await focus.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.storage-location-page .business-workspace-header')).toBeVisible()

    await navigator.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('存放位置 1', { exact: true }).last()).toBeVisible()
    await expectOverview(page, [1, 1, 1, 0])
    await expect(navigator.getByText('存放位置 1', { exact: true })).toBeVisible()
    expect(calls).toBe(2)
    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `storage-recovered-${scenario.name}.png`)
  })
}

test('分页与查询只采用已接受的树和服务端概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests: Array<{ from: number; to: number; keyword: unknown }> = []
  await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', (route) => {
    const params = requestParams(route)
    const from = Number(params.p_from)
    const to = Number(params.p_to)
    requests.push({ from, to, keyword: params.p_keyword })
    if (params.p_keyword)
      return fulfillList(route, [location(26)], 5, [location(26)], {
        total: 5,
        enabled: 4,
        root_count: 1,
        managed_count: 1
      })
    return fulfillList(
      route,
      Array.from({ length: from === 0 ? 20 : 5 }, (_, index) => location(from + index + 1)),
      25,
      [location(1), location(2)],
      overviewA
    )
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('存放位置 1', { exact: true }).last()).toBeVisible()
  await expectOverview(page, [25, 18, 2, 7])
  await expect(page.locator('.storage-location-navigator').getByText('2 个节点')).toBeVisible()
  await page.locator('.el-pager li.number').filter({ hasText: /^2$/ }).click()
  await expect(page.getByText('存放位置 21', { exact: true })).toBeVisible()
  await expect(page.getByText('存放位置 1', { exact: true }).last()).toBeVisible()
  await expectOverview(page, [25, 18, 2, 7])
  expect(requests.slice(0, 2).map(({ from, to }) => [from, to])).toEqual([
    [0, 19],
    [20, 39]
  ])

  await page.getByRole('textbox', { name: '关键字' }).fill('筛选')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('存放位置 26', { exact: true }).last()).toBeVisible()
  await expectOverview(page, [5, 4, 1, 1])
  await expect(page.locator('.storage-location-navigator').getByText('1 个节点')).toBeVisible()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expectOverview(page, [5, 4, 1, 1])
  expect(requests.at(-1)?.keyword).toBe('筛选')
})

test('窄屏长位置树保持独立滚动', async ({ page }) => {
  await page.setViewportSize({ width: 570, height: 900 })
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', (route) =>
    fulfillList(
      route,
      [location(1)],
      60,
      Array.from({ length: 60 }, (_, index) => location(index + 1)),
      { total: 60, enabled: 60, root_count: 60, managed_count: 0 }
    )
  )
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('存放位置 1', { exact: true }).last()).toBeVisible()
  await expectOverview(page, [60, 60, 60, 0])
  const navigator = page.locator('.storage-location-navigator')
  const bounds = await navigator.boundingBox()
  expect(bounds && bounds.height <= 520).toBe(true)
  const scroll = await navigator.locator('.el-scrollbar__wrap').evaluate((element) => ({
    client: element.clientHeight,
    content: element.scrollHeight
  }))
  expect(scroll.content).toBeGreaterThan(scroll.client)
  await expect(page.locator('.storage-location-page .art-table-query')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('合法空结果为零；缺失或非法元数据保持未知且树可重试', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', (route) => {
    calls++
    if (calls === 1) return route.fulfill({ json: { records: [location(1)], total: 1 } })
    if (calls === 2)
      return fulfillList(route, [location(1)], 1, [null], {
        total: 1,
        enabled: -1,
        root_count: 1,
        managed_count: 0
      })
    return fulfillList(route, [], 0, [], {
      total: 0,
      enabled: 0,
      root_count: 0,
      managed_count: 0
    })
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('存放位置 1', { exact: true }).last()).toBeVisible()
  await expectOverview(page, ['—', '—', '—', '—'])
  const navigator = page.locator('.storage-location-navigator')
  await expect(navigator.getByText('位置层级暂不可用，请重新加载。', { exact: true })).toBeVisible()
  await navigator.getByRole('button', { name: '重新加载' }).click()
  await expectOverview(page, ['—', '—', '—', '—'])
  await expect(navigator.getByText('位置层级暂不可用，请重新加载。', { exact: true })).toBeVisible()
  await navigator.getByRole('button', { name: '重新加载' }).click()
  await expectOverview(page, [0, 0, 0, 0])
  await expect(navigator.getByText('暂无存放位置')).toBeVisible()
  await expect(page.getByText('数据加载失败')).toHaveCount(0)
  expect(calls).toBe(3)
})

test('租户 A 迟到响应不能覆盖 B 的树和概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  let notifyA: (() => void) | undefined
  let releaseA: (() => void) | undefined
  let finishA: (() => void) | undefined
  const aRequested = new Promise<void>((resolve) => (notifyA = resolve))
  const aFinished = new Promise<void>((resolve) => (finishA = resolve))
  let bCalls = 0
  await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', async (route) => {
    if (route.request().headers()['x-art-tenant-scope'] === tenantA) {
      notifyA?.()
      await new Promise<void>((resolve) => (releaseA = resolve))
      await fulfillList(route, [location(1)], 91, [location(1)], {
        total: 91,
        enabled: 51,
        root_count: 31,
        managed_count: 21
      }).catch(() => undefined)
      finishA?.()
      return
    }
    bCalls++
    await fulfillList(route, [location(2, tenantB)], 7, [location(2, tenantB)], overviewB)
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await aRequested
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect(page.getByText('存放位置 2', { exact: true }).last()).toBeVisible()
  releaseA?.()
  await aFinished
  await expect.poll(() => bCalls).toBe(1)
  await expect(page.getByText('存放位置 1', { exact: true })).toHaveCount(0)
  await expectOverview(page, [7, 5, 1, 3])
})
