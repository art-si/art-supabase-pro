import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const evidenceDir = join(process.cwd(), '.artifacts', 'quality-audit', 'pmis-plan-read-browser')
const fixture = (view: 'plan' | 'editor' = 'plan'): string =>
  `/tests/e2e/fixtures/pmis-plan-read.html?view=${view}`

function plan(id: string, tenantId = tenantA) {
  return {
    id,
    tenant_id: tenantId,
    plan_kind: 'inspection',
    plan_name: id,
    frequency: 'daily',
    required_days: 1,
    status: 'enabled',
    update_time: '2026-01-01T00:00:00Z',
    items: [],
    equipment_bindings: [],
    responsible_bindings: []
  }
}

function fulfillPlans(route: Route, rows: object[], total = rows.length) {
  return route.fulfill({
    headers: {
      'content-range': rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`,
      'access-control-expose-headers': 'content-range'
    },
    json: rows
  })
}

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
}

for (const width of [1440, 570]) {
  test(`方案列表失败与重试 ${width}px`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await prepareIsolatedSession(page)
    let calls = 0
    let notifyFirst: (() => void) | undefined
    let releaseFirst: (() => void) | undefined
    const firstRequested = new Promise<void>((resolve) => (notifyFirst = resolve))
    await page.route('**/rest/v1/pmis_plan?*', async (route) => {
      calls++
      if (calls === 1) {
        notifyFirst?.()
        await new Promise<void>((resolve) => (releaseFirst = resolve))
        return route.fulfill({
          status: 500,
          json: { code: 'PGRST500', message: 'select * from secret' }
        })
      }
      return fulfillPlans(route, [plan('恢复方案')], 1)
    })
    await page.goto(fixture(), { waitUntil: 'domcontentloaded' })
    await firstRequested
    const metricValues = page.locator('.business-workspace-header__metric strong')
    await expect(metricValues).toHaveText(['—', '—', '—', '—'])
    releaseFirst?.()
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expect(metricValues).toHaveText(['—', '—', '—', '—'])
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from secret')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `plan-error-${width}.png`)

    const focus = page.getByRole('switch', { name: '进入专注模式' })
    await focus.locator('..').click()
    await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expect(page.locator('.business-workspace-header')).toBeHidden()
    await page.getByRole('button', { name: '退出专注模式' }).click()
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    await focus.locator('..').click()
    await expect(page.locator('.business-workspace-header')).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(page.locator('.business-workspace-header')).toBeVisible()

    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('恢复方案')).toBeVisible()
    await expect(metricValues).toHaveText(['1', '1', '0', '0'])
    expect(calls).toBe(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(pageErrors).toEqual([])
    await capture(page, `plan-recovered-${width}.png`)
  })
}

test('租户 A 迟到结果不覆盖租户 B 方案及指标', async ({ page }) => {
  await prepareIsolatedSession(page)
  let releaseA: (() => void) | undefined
  let notifyA: (() => void) | undefined
  let finishA: (() => void) | undefined
  const aRequested = new Promise<void>((resolve) => (notifyA = resolve))
  const aFinished = new Promise<void>((resolve) => (finishA = resolve))
  let bCalls = 0
  await page.route('**/rest/v1/pmis_plan?*', async (route) => {
    if (route.request().headers()['x-art-tenant-scope'] === tenantA) {
      notifyA?.()
      await new Promise<void>((resolve) => (releaseA = resolve))
      await fulfillPlans(route, [plan('迟到的 A 方案')], 91).catch(() => undefined)
      finishA?.()
      return
    }
    bCalls++
    await fulfillPlans(route, [plan('当前 B 方案', tenantB)], 7)
  })
  await page.goto(fixture(), { waitUntil: 'domcontentloaded' })
  await aRequested
  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect(page.getByText('当前 B 方案')).toBeVisible()
  releaseA?.()
  await aFinished
  await expect.poll(() => bCalls).toBe(1)
  await expect(page.getByText('迟到的 A 方案')).toHaveCount(0)
  await expect(page.getByText('方案总数').locator('..')).toContainText('7')
})

test('缺失设备关联身份时覆盖数保持未知', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  await page.route('**/rest/v1/pmis_plan?*', (route) => {
    calls++
    const equipment = { id: 'shared-equipment', equipment_code: 'EQ-1', equipment_name: '共用设备' }
    const rows = [
      { ...plan('方案甲'), equipment_bindings: [{ equipment }] },
      { ...plan('方案乙'), equipment_bindings: [{ equipment: calls === 1 ? equipment : null }] }
    ]
    return fulfillPlans(route, rows, 2)
  })
  await page.goto(fixture(), { waitUntil: 'domcontentloaded' })
  const metric = (label: string) =>
    page.locator('.business-workspace-header__metric').filter({ hasText: label }).locator('strong')
  await expect(page.getByText('方案甲', { exact: true })).toBeVisible()
  await expect(metric('方案总数')).toHaveText('2')
  await expect(metric('启用方案')).toHaveText('2')
  await expect(metric('覆盖设备')).toHaveText('1')

  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(() => calls).toBe(2)
  await expect(metric('方案总数')).toHaveText('2')
  await expect(metric('启用方案')).toHaveText('2')
  await expect(metric('覆盖设备')).toHaveText('—')
})

test('默认导出不改变当前页指标', async ({ page }) => {
  await prepareIsolatedSession(page)
  let exportCalls = 0
  await page.route('**/rest/v1/pmis_plan?*', (route) => {
    const limit = new URL(route.request().url()).searchParams.get('limit')
    if (limit === '500') {
      exportCalls++
      return fulfillPlans(
        route,
        Array.from({ length: 25 }, (_, i) => plan(`导出方案 ${i + 1}`)),
        25
      )
    }
    return fulfillPlans(
      route,
      Array.from({ length: 20 }, (_, i) => plan(`当前方案 ${i + 1}`)),
      25
    )
  })
  await page.goto(fixture(), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('当前方案 1', { exact: true })).toBeVisible()
  await expect(page.getByText('方案总数').locator('..')).toContainText('25')
  await expect(page.getByText('启用方案').locator('..')).toContainText('20')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await download
  expect(exportCalls).toBe(1)
  await expect(page.getByText('当前方案 1', { exact: true })).toBeVisible()
  await expect(page.getByText('方案总数').locator('..')).toContainText('25')
  await expect(page.getByText('启用方案').locator('..')).toContainText('20')
})

test('任务方案失败关闭弹窗并提示一次，重开可选方案', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  await page.route('**/rest/v1/pmis_plan?*', (route) => {
    calls++
    return calls === 1
      ? route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'select * from secret' } })
      : fulfillPlans(route, [plan('可选方案')], 1)
  })
  await page.goto(fixture('editor'), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '打开任务编辑弹窗' }).click()
  await expect(page.locator('.el-dialog')).toBeHidden()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).not.toContainText('select * from secret')
  await page.getByRole('button', { name: '打开任务编辑弹窗' }).click()
  await expect(page.locator('.el-dialog')).toBeVisible()
  await page.locator('.pmis-task-editor .el-select').first().click()
  await expect(page.getByText('可选方案')).toBeVisible()
  expect(calls).toBe(2)
})

test('关闭重开时旧方案请求不覆盖新弹窗', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  let releaseOld: (() => void) | undefined
  let releaseNew: (() => void) | undefined
  const requestStarted: Array<() => void> = []
  const firstStarted = new Promise<void>((resolve) => requestStarted.push(resolve))
  const secondStarted = new Promise<void>((resolve) => requestStarted.push(resolve))
  await page.route('**/rest/v1/pmis_plan?*', async (route) => {
    calls++
    const current = calls
    requestStarted[current - 1]?.()
    await new Promise<void>((resolve) => {
      if (current === 1) releaseOld = resolve
      else releaseNew = resolve
    })
    await fulfillPlans(route, [plan(current === 1 ? '旧方案' : '新方案')], 1).catch(() => undefined)
  })
  await page.goto(fixture('editor'), { waitUntil: 'domcontentloaded' })
  const open = page.getByRole('button', { name: '打开任务编辑弹窗' })
  await open.click()
  await firstStarted
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(page.locator('.el-dialog')).toBeHidden()
  await open.click()
  await secondStarted
  releaseOld?.()
  await expect(page.getByText('正在加载可用计划…')).toBeVisible()
  releaseNew?.()
  await expect(page.getByText('正在加载可用计划…')).toHaveCount(0)
  await page.locator('.pmis-task-editor .el-select').first().click()
  await expect(page.getByText('新方案')).toBeVisible()
  await expect(page.getByText('旧方案')).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})
