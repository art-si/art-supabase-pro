import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)

const fixture = '/tests/e2e/fixtures/recognition-tenant-scope.html'
const ownTenant = '55555555-5555-4555-8555-555555555555'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'

function artifact(tenant: string, label: string) {
  return {
    id: `recognition-${label}`,
    ai_run_id: `run-${label}`,
    auth_user_id: 'recognition-scope-test',
    tenant_id: tenant,
    feature: 'invoice_ocr',
    artifact_type: 'invoice',
    status: 'pending',
    proposed_payload: { invoiceNo: `${label}-001` },
    raw_ocr_text: `${label} 原始内容`,
    confidence: 0.9,
    warnings: [],
    metadata: {},
    create_by: '测试用户',
    create_time: '2026-10-26T08:00:00Z',
    run: { id: `run-${label}`, model: '测试模型', status: 'completed' }
  }
}

function responseFor(tenant: string | null) {
  const label =
    tenant === tenantA ? 'A' : tenant === tenantB ? 'B' : tenant === ownTenant ? 'OWN' : 'ALL'
  const total = label === 'A' ? 11 : label === 'B' ? 22 : label === 'OWN' ? 7 : 33
  return { label, total, row: artifact(tenant ?? ownTenant, label) }
}

async function mockRecognitionApi(
  page: Page,
  options: { ordinary?: boolean; holdA?: Promise<void>; failOverviewOnce?: boolean } = {}
) {
  const observed: Array<{ path: string; scope: string | null }> = []
  let overviewFailures = 0
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const isOverview = url.pathname.endsWith('/rpc/ai_ocr_recognition_overview')
    const isArtifact = url.pathname.endsWith('/ai_artifact_review')
    if (!isOverview && !isArtifact) {
      await route.fulfill({ json: [] })
      return
    }

    const header = request.headers()['x-art-tenant-scope'] ?? null
    const tenant = options.ordinary ? ownTenant : header
    observed.push({ path: url.pathname, scope: header })
    if (options.holdA && tenant === tenantA) await options.holdA
    if (isOverview && options.failOverviewOnce && overviewFailures++ === 0) {
      await route.fulfill({ status: 503, json: { message: 'temporary test failure' } })
      return
    }

    const { total, row } = responseFor(tenant)
    if (isOverview) {
      await route.fulfill({
        json: {
          total,
          pending: total,
          applied: 0,
          rejected: 0,
          low_confidence: 0,
          pending_low_confidence: 0,
          today: total,
          avg_confidence: 0.9,
          by_feature: { invoice_ocr: total }
        }
      })
      return
    }
    if (url.searchParams.has('id')) {
      await route.fulfill({ json: row })
      return
    }
    await route.fulfill({
      headers: {
        'content-range': '0-0/1',
        'access-control-expose-headers': 'content-range'
      },
      json: [row]
    })
  })
  return observed
}

function metric(page: Page, label: string) {
  return page
    .locator('.business-workspace-header__metric')
    .filter({ hasText: label })
    .locator('strong')
}

async function selectTenantScope(page: Page, tenantId: string): Promise<void> {
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('recognition-test-select-scope', { detail: id }))
  }, tenantId)
  await expect(page.getByTestId('effective-tenant')).toHaveText(tenantId)
}

for (const [view, label] of [
  ['workbench', '今日识别'],
  ['review', '待复核'],
  ['records', '累计识别']
] as const) {
  test(`${view} 切换租户后迟到的旧响应不会覆盖概览和记录`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let releaseA: (() => void) | undefined
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const observed = await mockRecognitionApi(page, { holdA })
    await page.goto(`${fixture}?view=${view}&mode=platform-selected`, {
      waitUntil: 'domcontentloaded'
    })
    await expect
      .poll(() => observed.filter((request) => request.scope === tenantA).length)
      .toBeGreaterThanOrEqual(2)

    await selectTenantScope(page, tenantB)
    await expect(metric(page, label)).toHaveText('22')
    await expect(page.getByText('B-001', { exact: true })).toBeVisible()
    releaseA?.()
    await expect
      .poll(() => observed.filter((request) => request.scope === tenantB).length)
      .toBeGreaterThanOrEqual(2)
    await expect(metric(page, label)).toHaveText('22')
    await expect(page.getByText('A-001', { exact: true })).toHaveCount(0)
    if (view !== 'workbench') {
      await expect(page.getByPlaceholder('姓名或邮箱')).toBeVisible({ timeout: 60_000 })
    }
    await page.screenshot({ path: info.outputPath('selected-tenant.png'), animations: 'disabled' })
    expect(errors).toEqual([])
  })
}

test('普通用户伪造租户选择后仍显示本人租户的数据', async ({ page }) => {
  await prepareIsolatedSession(page)
  const observed = await mockRecognitionApi(page, { ordinary: true })
  await page.goto(`${fixture}?mode=ordinary-forged`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('effective-tenant')).toHaveText(ownTenant)
  await expect(metric(page, '今日识别')).toHaveText('7')
  await expect(page.getByText('OWN-001', { exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '测试租户范围' })).toHaveCount(0)
  expect(observed.some((request) => request.path.endsWith('/ai_artifact_review'))).toBe(true)
})

test('待复核专注模式切租户后保留查询与表格，并可用开关和 Esc 退出', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await mockRecognitionApi(page)
  await page.goto(`${fixture}?view=review&mode=platform-selected`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('A-001', { exact: true })).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.getByRole('heading', { name: '待复核', exact: true })).toBeHidden()
  await expect(page.getByText('A-001', { exact: true })).toBeVisible()

  await selectTenantScope(page, tenantB)
  await expect(page.getByText('B-001', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '待复核', exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('姓名或邮箱')).toBeVisible()
  await page.screenshot({
    path: info.outputPath('focused-selected-tenant.png'),
    animations: 'disabled'
  })

  await page.getByRole('button', { name: '退出专注' }).click()
  await expect(page.getByRole('heading', { name: '待复核', exact: true })).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: '待复核', exact: true })).toBeVisible()
})

test('租户切换关闭已打开的识别详情，旧详情不能重现', async ({ page }) => {
  await prepareIsolatedSession(page)
  await mockRecognitionApi(page)
  await page.goto(`${fixture}?mode=platform-selected`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('A-001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '查看', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  await expect(drawer.getByRole('heading', { name: 'A-001', exact: true })).toBeVisible()
  await selectTenantScope(page, tenantB)
  await expect(drawer).toHaveCount(0)
  await expect(page.getByText('B-001', { exact: true })).toBeVisible()
  await expect(page.getByText('A-001', { exact: true })).toHaveCount(0)
})

test('概览失败后可重试，窄屏内容不横向溢出', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await mockRecognitionApi(page, { failOverviewOnce: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${fixture}?view=review&mode=platform-all`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '重新加载概览' })).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('overview-error-390.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '重新加载概览' }).click()
  await expect(metric(page, '待复核')).toHaveText('33')
  await expect(page.getByText('ALL-001', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('姓名或邮箱')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: info.outputPath('overview-recovered-390.png'),
    animations: 'disabled'
  })
})
