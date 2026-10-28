import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = '/tests/e2e/fixtures/smis-supplier-read.html'
const evidenceDir = join(process.cwd(), '.artifacts', 'quality-audit', 'smis-supplier-read-browser')
const labels = ['供应商总数', '重点供应商', '覆盖类别', '联络信息完整']
const overviewA = { total: 25, key_suppliers: 9, category_count: 7, contact_complete: 14 }
const overviewB = { total: 7, key_suppliers: 3, category_count: 2, contact_complete: 5 }

function supplier(index: number, tenantId = tenantA) {
  return {
    id: `supplier-${index}`,
    tenant_id: tenantId,
    supplier_code: `SUP-${index}`,
    supplier_name: `供应商 ${index}`,
    supplier_category: 'raw-material',
    supplier_type: 'company',
    coordinate_system: 'GCJ02',
    contact_person: `联系人 ${index}`,
    contact_phone: '13800000000'
  }
}

function requestParams(route: Route): Record<string, unknown> {
  const payload: unknown = route.request().postDataJSON()
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function fulfillSupplierList(
  route: Route,
  rows: object[],
  total = rows.length,
  overview = overviewA
) {
  return route.fulfill({ json: { records: rows, total, overview } })
}

const metric = (page: Page, label: string) =>
  page.locator('.business-workspace-header__metric').filter({ hasText: label }).locator('strong')

async function expectOverview(page: Page, values: Array<string | number>) {
  for (const [index, label] of labels.entries())
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
  test(`供应商读取失败、专注与重试 ${scenario.name}`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await prepareIsolatedSession(page)
    await prepareAppearance(page, scenario.appearance)
    let calls = 0
    let notifyFirst: (() => void) | undefined
    let releaseFirst: (() => void) | undefined
    const firstRequested = new Promise<void>((resolve) => (notifyFirst = resolve))
    await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', async (route) => {
      calls++
      if (calls === 1) {
        notifyFirst?.()
        await new Promise<void>((resolve) => (releaseFirst = resolve))
        await route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'select * from private_suppliers' }
        })
        return
      }
      await fulfillSupplierList(route, [supplier(1)], 1, {
        total: 1,
        key_suppliers: 1,
        category_count: 1,
        contact_complete: 1
      })
    })
    await page.goto(fixture, { waitUntil: 'domcontentloaded' })
    await assertAppearance(page, scenario.appearance)
    await firstRequested
    await expectOverview(page, ['—', '—', '—', '—'])
    releaseFirst?.()
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expectOverview(page, ['—', '—', '—', '—'])
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from private_suppliers')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `supplier-error-${scenario.name}.png`)

    const focus = page.getByRole('switch', { name: '进入专注模式' })
    await focus.locator('..').click()
    await expect(page.locator('.supplier-page .business-workspace-header')).toBeHidden()
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await page.getByRole('button', { name: '退出专注模式' }).click({ timeout: 5_000 })
    await expect(page.locator('.supplier-page .business-workspace-header')).toBeVisible()
    await focus.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.supplier-page .business-workspace-header')).toBeVisible()

    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('供应商 1', { exact: true })).toBeVisible()
    await expectOverview(page, [1, 1, 1, 1])
    await assertAppearance(page, scenario.appearance)
    expect(calls).toBe(2)
    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `supplier-recovered-${scenario.name}.png`)
  })
}

test('分页与查询沿用服务端四项概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests: Array<{ from: number; to: number; keyword: unknown }> = []
  await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) => {
    const params = requestParams(route)
    const from = Number(params.p_from)
    const to = Number(params.p_to)
    requests.push({ from, to, keyword: params.p_keyword })
    if (params.p_keyword)
      return fulfillSupplierList(route, [supplier(26)], 5, {
        total: 5,
        key_suppliers: 2,
        category_count: 1,
        contact_complete: 3
      })
    return fulfillSupplierList(
      route,
      Array.from({ length: from === 0 ? 20 : 5 }, (_, index) => supplier(from + index + 1)),
      25,
      overviewA
    )
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('供应商 1', { exact: true })).toBeVisible()
  await expectOverview(page, [25, 9, 7, 14])
  await page.locator('.el-pager li.number').filter({ hasText: /^2$/ }).click()
  await expect(page.getByText('供应商 21', { exact: true })).toBeVisible()
  await expect(page.getByText('供应商 1', { exact: true })).toHaveCount(0)
  await expectOverview(page, [25, 9, 7, 14])
  expect(requests.slice(0, 2).map(({ from, to }) => [from, to])).toEqual([
    [0, 19],
    [20, 39]
  ])

  await page.getByRole('textbox', { name: '关键字' }).fill('筛选')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('供应商 26', { exact: true })).toBeVisible()
  await expectOverview(page, [5, 2, 1, 3])
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expectOverview(page, [5, 2, 1, 3])
  expect(requests.at(-1)?.keyword).toBe('筛选')
})

test('列表成功但概览缺失时指标未知，查询可恢复', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) => {
    calls++
    if (calls === 1) return route.fulfill({ json: { records: [supplier(1)], total: 1 } })
    return fulfillSupplierList(route, [supplier(1)], 1, {
      total: 1,
      key_suppliers: 1,
      category_count: calls === 2 ? -1 : 1,
      contact_complete: 1
    })
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('供应商 1', { exact: true })).toBeVisible()
  await expectOverview(page, ['—', '—', '—', '—'])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expectOverview(page, ['—', '—', '—', '—'])
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expectOverview(page, [1, 1, 1, 1])
  expect(calls).toBe(3)
})

test('导出失败只提示一次，成功下载不改当前概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  let exportCalls = 0
  await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) => {
    const params = requestParams(route)
    if (params.p_purpose === 'export') {
      exportCalls++
      if (exportCalls === 1)
        return route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'select * from private_suppliers' }
        })
      return fulfillSupplierList(
        route,
        Array.from({ length: 25 }, (_, index) => supplier(index + 1)),
        25,
        overviewA
      )
    }
    return fulfillSupplierList(route, [supplier(1)], 25, overviewA)
  })
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('供应商 1', { exact: true })).toBeVisible()
  await expectOverview(page, [25, 9, 7, 14])
  const exportButton = page.getByRole('button', { name: '导出', exact: true })
  await exportButton.click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).not.toContainText(
    'select * from private_suppliers'
  )
  expect(downloads).toEqual([])
  await expectOverview(page, [25, 9, 7, 14])

  const download = page.waitForEvent('download')
  await exportButton.click()
  await download
  expect(exportCalls).toBe(2)
  await expectOverview(page, [25, 9, 7, 14])
  await expect(page.getByText('供应商 1', { exact: true })).toBeVisible()
})

test('租户 A 迟到响应不能覆盖 B 的供应商与概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  let notifyA: (() => void) | undefined
  let releaseA: (() => void) | undefined
  let finishA: (() => void) | undefined
  const aRequested = new Promise<void>((resolve) => (notifyA = resolve))
  const aFinished = new Promise<void>((resolve) => (finishA = resolve))
  let bCalls = 0
  await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', async (route) => {
    if (route.request().headers()['x-art-tenant-scope'] === tenantA) {
      notifyA?.()
      await new Promise<void>((resolve) => (releaseA = resolve))
      await fulfillSupplierList(route, [supplier(1)], 91, {
        total: 91,
        key_suppliers: 51,
        category_count: 31,
        contact_complete: 21
      }).catch(() => undefined)
      finishA?.()
      return
    }
    bCalls++
    await fulfillSupplierList(route, [supplier(2, tenantB)], 7, overviewB)
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await aRequested
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect(page.getByText('供应商 2', { exact: true })).toBeVisible()
  releaseA?.()
  await aFinished
  await expect.poll(() => bCalls).toBe(1)
  await expect(page.getByText('供应商 1', { exact: true })).toHaveCount(0)
  await expectOverview(page, [7, 3, 2, 5])
})
