import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const fixture = '/tests/e2e/fixtures/smis-safety-inspection-read.html'
const evidenceDir = join(
  process.cwd(),
  '.artifacts',
  'quality-audit',
  'smis-safety-inspection-read-browser'
)
const labels = ['检查记录', '本月检查', '覆盖单位', '参与检查人']
const overviewA = { total: 25, this_month: 11, organization_count: 7, inspector_count: 9 }
const overviewB = { total: 7, this_month: 3, organization_count: 2, inspector_count: 4 }

const inspection = (index: number, tenantId = tenantA) => ({
  id: `inspection-${tenantId === tenantA ? 'a' : 'b'}-${index}`,
  tenant_id: tenantId,
  inspection_type_id: `type-${tenantId === tenantA ? 'a' : 'b'}`,
  inspection_type_name: tenantId === tenantA ? '日常排查' : '专项排查',
  inspection_name: `安全检查 ${index}`,
  inspection_organization_id: `org-${tenantId === tenantA ? 'a' : 'b'}`,
  inspection_organization_name: '检查部门',
  inspected_organization_id: `org-${tenantId === tenantA ? 'a' : 'b'}`,
  inspected_organization_name: '被检查部门',
  inspection_time: '2026-10-28T08:00:00Z',
  plan_attachment_urls: [],
  inspectors: [],
  inspector_names: '测试检查人',
  create_time: '2026-10-28T08:00:00Z'
})

const optionData = (tenantId = tenantA) => ({
  inspectionTypes: [
    {
      id: `type-${tenantId === tenantA ? 'a' : 'b'}`,
      tenantId,
      typeCode: tenantId === tenantA ? 'TYPE-A' : 'TYPE-B',
      typeName: tenantId === tenantA ? '日常排查' : '专项排查'
    }
  ],
  organizations: [
    {
      id: `org-${tenantId === tenantA ? 'a' : 'b'}`,
      tenantId,
      parentId: null,
      organizationCode: tenantId === tenantA ? 'ORG-A' : 'ORG-B',
      organizationName: tenantId === tenantA ? '租户 A 组织' : '租户 B 组织',
      organizationType: 'department',
      sort: 1
    }
  ]
})

function requestParams(route: Route): Record<string, unknown> {
  const payload: unknown = route.request().postDataJSON()
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {}
}

function fulfillList(route: Route, rows: object[], total = rows.length, overview = overviewA) {
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

async function mockOptions(page: Page) {
  await page.route('**/rest/v1/rpc/smis_list_safety_inspection_options_secure', (route) =>
    route.fulfill({ json: optionData(route.request().headers()['x-art-tenant-scope']) })
  )
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
  test(`安全检查列表失败、专注与重试 ${scenario.name}`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: scenario.width, height: 900 })
    await prepareIsolatedSession(page)
    await prepareAppearance(page, scenario.appearance)
    await mockOptions(page)
    let calls = 0
    let notifyFirst: (() => void) | undefined
    let releaseFirst: (() => void) | undefined
    const firstRequested = new Promise<void>((resolve) => (notifyFirst = resolve))
    await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', async (route) => {
      calls++
      if (calls === 1) {
        notifyFirst?.()
        await new Promise<void>((resolve) => (releaseFirst = resolve))
        await route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'select * from private_inspections' }
        })
        return
      }
      await fulfillList(route, [inspection(1)], 25, overviewA)
    })
    await page.goto(fixture, { waitUntil: 'domcontentloaded' })
    await assertAppearance(page, scenario.appearance)
    await firstRequested
    await expectOverview(page, ['—', '—', '—', '—'])
    releaseFirst?.()
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expectOverview(page, ['—', '—', '—', '—'])
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from private_inspections')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `safety-error-${scenario.name}.png`)

    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('安全检查 1', { exact: true })).toBeVisible()
    await expectOverview(page, [25, 11, 7, 9])
    await expect(page.locator('.safety-inspection-navigator')).toBeVisible()
    await expect(page.locator('.el-pagination')).toBeVisible()

    const focus = page.getByRole('switch', { name: '进入专注模式' })
    await focus.locator('..').click()
    await expect(page.locator('.safety-inspection-page .business-workspace-header')).toBeHidden()
    await expect(page.locator('.safety-inspection-navigator')).toBeVisible()
    await expect(page.locator('.art-search-bar')).toBeVisible()
    await expect(page.locator('.el-table')).toBeVisible()
    await expect(page.locator('.el-pagination')).toBeVisible()
    await page.getByRole('button', { name: '退出专注模式' }).click()
    await expect(page.locator('.safety-inspection-page .business-workspace-header')).toBeVisible()
    await focus.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.safety-inspection-page .business-workspace-header')).toBeVisible()
    await expectOverview(page, [25, 11, 7, 9])
    await assertAppearance(page, scenario.appearance)
    expect(calls).toBe(2)
    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `safety-recovered-${scenario.name}.png`)
  })
}

test('安全检查分页、查询与类型导航采用服务端四项概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockOptions(page)
  const requests: Array<{ from: number; to: number; name: unknown; type: unknown }> = []
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', (route) => {
    const params = requestParams(route)
    const from = Number(params.p_from)
    const to = Number(params.p_to)
    requests.push({ from, to, name: params.p_inspection_name, type: params.p_inspection_type_id })
    if (params.p_inspection_type_id)
      return fulfillList(route, [inspection(29)], 2, {
        total: 2,
        this_month: 1,
        organization_count: 1,
        inspector_count: 1
      })
    if (params.p_inspection_name)
      return fulfillList(route, [inspection(26)], 5, {
        total: 5,
        this_month: 2,
        organization_count: 1,
        inspector_count: 3
      })
    return fulfillList(
      route,
      Array.from({ length: from === 0 ? 20 : 5 }, (_, index) => inspection(from + index + 1)),
      25,
      overviewA
    )
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 1', { exact: true })).toBeVisible()
  await expectOverview(page, [25, 11, 7, 9])
  await page.locator('.el-pager li.number').filter({ hasText: /^2$/ }).click()
  await expect(page.getByText('安全检查 21', { exact: true })).toBeVisible()
  await expectOverview(page, [25, 11, 7, 9])
  expect(requests.slice(0, 2).map(({ from, to }) => [from, to])).toEqual([
    [0, 19],
    [20, 39]
  ])

  await page.getByRole('textbox', { name: '检查名称' }).fill('夜间')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('安全检查 26', { exact: true })).toBeVisible()
  await expectOverview(page, [5, 2, 1, 3])
  await page.getByRole('button', { name: '日常排查' }).click()
  await expect(page.getByText('安全检查 29', { exact: true })).toBeVisible()
  await expectOverview(page, [2, 1, 1, 1])
  expect(requests.at(-1)?.type).toBe('type-a')
  expect(requests.at(-1)?.name).toBe('夜间')
})

test('概览缺失或负数保持未知，合法空列表四项归零', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockOptions(page)
  let calls = 0
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', (route) => {
    calls++
    if (calls === 1) return route.fulfill({ json: { records: [inspection(1)], total: 1 } })
    if (calls === 2)
      return fulfillList(route, [inspection(1)], 1, {
        total: 1,
        this_month: -1,
        organization_count: 1,
        inspector_count: 1
      })
    return fulfillList(route, [], 0, {
      total: 0,
      this_month: 0,
      organization_count: 0,
      inspector_count: 0
    })
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 1', { exact: true })).toBeVisible()
  await expectOverview(page, ['—', '—', '—', '—'])
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expectOverview(page, ['—', '—', '—', '—'])
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expectOverview(page, [0, 0, 0, 0])
  await expect(page.getByText('暂无安全检查记录')).toBeVisible()
  expect(calls).toBe(3)
})

test('安全检查附件显示名去签名参数、坏编码回退并保留完整长名', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockOptions(page)
  const name120 = `${'a'.repeat(116)}.pdf`
  const name121 = `${'b'.repeat(117)}.pdf`
  const urls = [
    'https://example.invalid/docs/%E6%A3%80%E6%9F%A5%E8%AE%A1%E5%88%92.pdf?token=PRIVATE#fragment',
    'https://example.invalid/docs/bad%ZZ.pdf?token=PRIVATE',
    `https://example.invalid/docs/${name120}?token=PRIVATE`,
    `https://example.invalid/docs/${name121}?token=PRIVATE`
  ]
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', (route) =>
    fulfillList(
      route,
      urls.map((url, index) => ({
        ...inspection(index + 1),
        plan_attachment_urls: [url]
      })),
      urls.length,
      { total: urls.length, this_month: 0, organization_count: 0, inspector_count: 0 }
    )
  )
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  const links = page.locator('.safety-inspection-page__attachment .art-attachment-link')
  await expect(links).toHaveCount(4)
  await expect(links.nth(0)).toHaveText('检查计划.pdf')
  await expect(links.nth(0)).toHaveAttribute('title', '预览 检查计划.pdf')
  await expect(links.nth(1)).toHaveText('检查计划附件')
  await expect(links.nth(2)).toHaveText(name120)
  await expect(links.nth(3)).toHaveText(name121)
  await expect(links.nth(3)).toHaveAttribute('title', `预览 ${name121}`)
  for (const link of await links.all()) {
    await expect(link).not.toContainText('PRIVATE')
    await expect(link).not.toHaveAttribute('title', /PRIVATE/)
  }
  await expect(page.getByRole('textbox', { name: '检查名称' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'safety-attachment-url-name-1440.png')
})

test('导航选项失败独立重试，新增受阻后恢复可打开并取消', async ({ page }) => {
  await page.setViewportSize({ width: 570, height: 900 })
  await prepareIsolatedSession(page)
  let optionCalls = 0
  let writes = 0
  page.on('request', (request) => {
    if (/\/rpc\/(smis_save|smis_copy|smis_delete)_safety_inspection/.test(request.url())) writes++
  })
  await page.route('**/rest/v1/rpc/smis_list_safety_inspection_options_secure', (route) => {
    optionCalls++
    if (optionCalls === 1)
      return route.fulfill({
        status: 500,
        json: { code: 'PGRST500', message: 'options unavailable' }
      })
    if (optionCalls === 2) return route.fulfill({ json: {} })
    if (optionCalls === 3)
      return route.fulfill({
        json: {
          ...optionData(),
          inspectionTypes: optionData().inspectionTypes.map((item) => ({
            id: item.id,
            typeCode: item.typeCode,
            typeName: item.typeName
          }))
        }
      })
    return route.fulfill({ json: optionData() })
  })
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', (route) =>
    fulfillList(route, [inspection(1)], 1, {
      total: 1,
      this_month: 1,
      organization_count: 1,
      inspector_count: 1
    })
  )
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('检查导航加载失败，请稍后重试', { exact: true })).toBeVisible()
  await expect(page.getByText('安全检查 1', { exact: true })).toBeVisible()
  await expectOverview(page, [1, 1, 1, 1])
  const navigator = page.locator('.safety-inspection-navigator')
  const primary = page.locator('.art-workspace-splitter__primary')
  const retry = navigator.getByRole('button', { name: /重新加载|重试/ }).first()
  const navBox = await navigator.boundingBox()
  const primaryBox = await primary.boundingBox()
  const retryBox = await retry.boundingBox()
  expect(navBox).toBeTruthy()
  expect(primaryBox).toBeTruthy()
  expect(retryBox).toBeTruthy()
  expect(retryBox!.y).toBeGreaterThanOrEqual(navBox!.y)
  expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(navBox!.y + navBox!.height + 1)
  expect(retryBox!.y).toBeGreaterThanOrEqual(primaryBox!.y)
  expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(primaryBox!.y + primaryBox!.height + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'safety-options-error-570.png')

  await page.getByRole('button', { name: '新增安全检查' }).click()
  await expect(page.locator('.el-message--warning')).toContainText('检查导航暂不可用')
  await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
  await retry.click()
  await expect(page.getByText('检查导航加载失败，请稍后重试', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无导航数据')).toHaveCount(0)
  await page.getByRole('button', { name: '新增安全检查' }).click()
  await expect(page.locator('.el-message--warning').last()).toContainText('检查导航暂不可用')
  await capture(page, 'safety-options-invalid-570.png')
  await retry.click()
  await expect(page.getByText('检查导航加载失败，请稍后重试', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无导航数据')).toHaveCount(0)
  await page.getByRole('button', { name: '新增安全检查' }).click()
  await expect(page.locator('.el-message--warning').last()).toContainText('检查导航暂不可用')
  await retry.click()
  await expect(page.getByText('检查导航加载失败，请稍后重试', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '日常排查' })).toBeVisible()
  await page.getByRole('button', { name: '新增安全检查' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  expect(optionCalls).toBe(4)
  expect(writes).toBe(0)
})

test('导出失败单次提示无下载，恢复下载不污染概览', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockOptions(page)
  let exportCalls = 0
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', (route) => {
    const params = requestParams(route)
    if (Number(params.p_to) >= 499) {
      exportCalls++
      if (exportCalls === 1)
        return route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'select * from private_inspections' }
        })
      return fulfillList(
        route,
        Array.from({ length: 25 }, (_, index) => inspection(index + 1)),
        25,
        overviewA
      )
    }
    return fulfillList(route, [inspection(1)], 25, overviewA)
  })
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.suggestedFilename()))
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('安全检查 1', { exact: true })).toBeVisible()
  await expectOverview(page, [25, 11, 7, 9])
  const exportButton = page.getByRole('button', { name: '导出', exact: true })
  await exportButton.click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).not.toContainText(
    'select * from private_inspections'
  )
  expect(downloads).toEqual([])
  await expectOverview(page, [25, 11, 7, 9])

  const download = page.waitForEvent('download')
  await exportButton.click()
  await download
  expect(exportCalls).toBe(2)
  await expectOverview(page, [25, 11, 7, 9])
})

test('租户 A 迟到列表和导航不能覆盖 B 当前范围', async ({ page }) => {
  await prepareIsolatedSession(page)
  let notifyListA: (() => void) | undefined
  let releaseListA: (() => void) | undefined
  let notifyOptionsA: (() => void) | undefined
  let releaseOptionsA: (() => void) | undefined
  let finishListA: (() => void) | undefined
  let finishOptionsA: (() => void) | undefined
  const listARequested = new Promise<void>((resolve) => (notifyListA = resolve))
  const optionsARequested = new Promise<void>((resolve) => (notifyOptionsA = resolve))
  const listAFinished = new Promise<void>((resolve) => (finishListA = resolve))
  const optionsAFinished = new Promise<void>((resolve) => (finishOptionsA = resolve))
  let listB = 0
  let optionsB = 0
  await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', async (route) => {
    if (route.request().headers()['x-art-tenant-scope'] === tenantA) {
      notifyListA?.()
      await new Promise<void>((resolve) => (releaseListA = resolve))
      await fulfillList(route, [inspection(1)], 91, {
        total: 91,
        this_month: 51,
        organization_count: 31,
        inspector_count: 21
      }).catch(() => undefined)
      finishListA?.()
      return
    }
    listB++
    await fulfillList(route, [inspection(2, tenantB)], 7, overviewB)
  })
  await page.route('**/rest/v1/rpc/smis_list_safety_inspection_options_secure', async (route) => {
    if (route.request().headers()['x-art-tenant-scope'] === tenantA) {
      notifyOptionsA?.()
      await new Promise<void>((resolve) => (releaseOptionsA = resolve))
      await route.fulfill({ json: optionData(tenantA) }).catch(() => undefined)
      finishOptionsA?.()
      return
    }
    optionsB++
    await route.fulfill({ json: optionData(tenantB) })
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await Promise.all([listARequested, optionsARequested])
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect(page.getByText('安全检查 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '专项排查' })).toBeVisible()
  releaseListA?.()
  releaseOptionsA?.()
  await Promise.all([listAFinished, optionsAFinished])
  await expect.poll(() => [listB, optionsB]).toEqual([1, 1])
  await expect(page.getByText('安全检查 1', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '日常排查' })).toHaveCount(0)
  await expectOverview(page, [7, 3, 2, 4])
})
