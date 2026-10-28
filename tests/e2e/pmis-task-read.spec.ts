import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const evidenceDir = join(process.cwd(), '.artifacts', 'quality-audit', 'pmis-task-read-browser')
type Kind = 'task' | 'repair'

const config = {
  task: { table: 'pmis_task', total: '任务总数', active: '计划中', root: '.pmis-task-workspace' },
  repair: { table: 'pmis_repair_task', total: '维修工单', active: '维修中', root: '.pmis-repair' }
} satisfies Record<Kind, { table: string; total: string; active: string; root: string }>

const fixture = (kind: Kind): string => `/tests/e2e/fixtures/pmis-task-read.html?view=${kind}`

function taskRow(label: string, tenantId = tenantA) {
  return {
    id: label,
    tenant_id: tenantId,
    task_no: label,
    planned_date: '2099-01-01',
    status: 'pending',
    task_source: 'scheduled',
    before_photo_files: [],
    after_photo_files: [],
    plan: {
      id: 'plan-a',
      plan_kind: 'inspection',
      plan_name: '测试方案',
      required_days: 1,
      require_photo: false,
      items: []
    },
    equipment: {
      id: 'equipment-a',
      tenant_id: tenantId,
      equipment_code: 'EQ-A',
      equipment_name: '设备甲',
      department: null
    },
    results: []
  }
}

function repairRow(label: string, tenantId = tenantA) {
  return {
    id: label,
    tenant_id: tenantId,
    work_order_no: label,
    urgency: 'normal',
    fault_symptom: '测试故障',
    fault_photo_files: [],
    repair_photo_files: [],
    status: 'in_progress',
    reported_at: '2026-01-01T00:00:00Z',
    equipment: {
      id: 'equipment-a',
      tenant_id: tenantId,
      equipment_code: 'EQ-A',
      equipment_name: '设备甲',
      department: null
    }
  }
}

const row = (kind: Kind, label: string, tenantId = tenantA) =>
  kind === 'task' ? taskRow(label, tenantId) : repairRow(label, tenantId)

function fulfillRows(route: Route, rows: object[], total = rows.length) {
  return route.fulfill({
    headers: {
      'content-range': rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`,
      'access-control-expose-headers': 'content-range'
    },
    json: rows
  })
}

async function interceptRows(page: Page, kind: Kind, handler: (route: Route) => Promise<void>) {
  await page.route(`**/rest/v1/${config[kind].table}?*`, handler)
}

const metric = (page: Page, label: string) =>
  page.locator('.business-workspace-header__metric').filter({ hasText: label }).locator('strong')

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
}

for (const kind of ['task', 'repair'] as const) {
  for (const width of [1440, 570]) {
    test(`${kind} 读取失败与恢复 ${width}px`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.setViewportSize({ width, height: 900 })
      await prepareIsolatedSession(page)
      if (kind === 'task' && width === 570)
        await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
      let calls = 0
      let notifyFirst: (() => void) | undefined
      let releaseFirst: (() => void) | undefined
      const firstRequested = new Promise<void>((resolve) => (notifyFirst = resolve))
      await interceptRows(page, kind, async (route) => {
        calls++
        if (calls === 1) {
          notifyFirst?.()
          await new Promise<void>((resolve) => (releaseFirst = resolve))
          await route.fulfill({
            status: 500,
            json: { code: 'PGRST500', message: 'select * from private_table' }
          })
          return
        }
        await fulfillRows(route, [row(kind, '恢复记录')], 1)
      })
      await page.goto(fixture(kind), { waitUntil: 'domcontentloaded' })
      if (kind === 'task' && width === 570)
        await assertAppearance(page, { theme: 'light', boxBorderMode: true })
      await firstRequested
      await expect(
        page.locator(`${config[kind].root} .business-workspace-header__metric strong`)
      ).toHaveText(['—', '—', '—', '—'])
      releaseFirst?.()
      await expect(page.getByText('数据加载失败')).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText('select * from private_table')
      await expect(
        page.locator(`${config[kind].root} .business-workspace-header__metric strong`)
      ).toHaveText(['—', '—', '—', '—'])
      if (kind === 'task' && width === 570) {
        const card = await page.locator('.pmis-task-workspace .art-table-card').boundingBox()
        const retry = await page.getByRole('button', { name: '重新加载' }).boundingBox()
        expect(
          card && retry && retry.y >= card.y && retry.y + retry.height <= card.y + card.height,
          JSON.stringify({ card, retry })
        ).toBe(true)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await capture(page, `${kind}-error-${width}.png`)

      const focus = page.getByRole('switch', { name: '进入专注模式' })
      await focus.locator('..').click()
      await expect(
        page.locator(config[kind].root).locator('.business-workspace-header')
      ).toBeHidden()
      await expect(page.getByText('数据加载失败')).toBeVisible()
      await page.getByRole('button', { name: '退出专注模式' }).click({ timeout: 5_000 })
      await expect(
        page.locator(config[kind].root).locator('.business-workspace-header')
      ).toBeVisible()
      await focus.locator('..').click()
      await page.keyboard.press('Escape')
      await expect(
        page.locator(config[kind].root).locator('.business-workspace-header')
      ).toBeVisible()

      await page.getByRole('button', { name: '重新加载' }).click()
      await expect(page.getByText('恢复记录', { exact: true })).toBeVisible()
      await expect(metric(page, config[kind].total)).toHaveText('1')
      await expect(metric(page, config[kind].active)).toHaveText('1')
      expect(calls).toBe(2)
      expect(pageErrors).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await capture(page, `${kind}-recovered-${width}.png`)
    })
  }

  test(`${kind} 导出不改变当前页指标`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let exportCalls = 0
    await interceptRows(page, kind, async (route) => {
      const limit = new URL(route.request().url()).searchParams.get('limit')
      if (limit === '500') {
        exportCalls++
        await fulfillRows(
          route,
          Array.from({ length: 25 }, (_, index) => row(kind, `导出记录-${index + 1}`)),
          25
        )
        return
      }
      await fulfillRows(
        route,
        Array.from({ length: 20 }, (_, index) => row(kind, `当前记录-${index + 1}`)),
        25
      )
    })
    await page.goto(fixture(kind), { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('当前记录-1', { exact: true })).toBeVisible()
    await expect(metric(page, config[kind].total)).toHaveText('25')
    await expect(metric(page, config[kind].active)).toHaveText('20')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).click()
    await download
    expect(exportCalls).toBe(1)
    await expect(page.getByText('当前记录-1', { exact: true })).toBeVisible()
    await expect(metric(page, config[kind].total)).toHaveText('25')
    await expect(metric(page, config[kind].active)).toHaveText('20')
  })

  test(`${kind} 迟到租户响应不覆盖当前指标`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let releaseA: (() => void) | undefined
    let notifyA: (() => void) | undefined
    let finishA: (() => void) | undefined
    const aRequested = new Promise<void>((resolve) => (notifyA = resolve))
    const aFinished = new Promise<void>((resolve) => (finishA = resolve))
    let bCalls = 0
    await interceptRows(page, kind, async (route) => {
      if (route.request().headers()['x-art-tenant-scope'] === tenantA) {
        notifyA?.()
        await new Promise<void>((resolve) => (releaseA = resolve))
        await fulfillRows(route, [row(kind, '迟到的 A 记录')], 91).catch(() => undefined)
        finishA?.()
        return
      }
      bCalls++
      await fulfillRows(route, [row(kind, '当前 B 记录', tenantB)], 7)
    })
    await page.goto(fixture(kind), { waitUntil: 'domcontentloaded' })
    await aRequested
    await page.getByRole('button', { name: '切换租户 B' }).click()
    await expect(page.getByText('当前 B 记录', { exact: true })).toBeVisible()
    releaseA?.()
    await aFinished
    await expect.poll(() => bCalls).toBe(1)
    await expect(page.getByText('迟到的 A 记录')).toHaveCount(0)
    await expect(metric(page, config[kind].total)).toHaveText('7')
    await expect(metric(page, config[kind].active)).toHaveText('1')
  })
}

test('task 深色阴影模式错误与重试保留可见专注出口', async ({ page }) => {
  const appearance = { theme: 'dark' as const, boxBorderMode: false }
  await page.setViewportSize({ width: 570, height: 900 })
  await prepareIsolatedSession(page)
  await prepareAppearance(page, appearance)
  let calls = 0
  await page.route('**/rest/v1/pmis_task?*', (route) => {
    calls++
    return calls === 1
      ? route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'unavailable' } })
      : fulfillRows(route, [taskRow('深色恢复记录')], 1)
  })
  await page.goto(fixture('task'), { waitUntil: 'domcontentloaded' })
  await assertAppearance(page, appearance)
  await expect(page.getByText('数据加载失败')).toBeVisible()
  await expect(metric(page, '任务总数')).toHaveText('—')
  const card = await page.locator('.pmis-task-workspace .art-table-card').boundingBox()
  const retry = await page.getByRole('button', { name: '重新加载' }).boundingBox()
  expect(card && retry && retry.y >= card.y && retry.y + retry.height <= card.y + card.height).toBe(
    true
  )
  await capture(page, 'task-error-dark-shadow-570.png')

  const focus = page.getByRole('switch', { name: '进入专注模式' })
  await focus.locator('..').click()
  await expect(page.locator('.pmis-task-workspace .business-workspace-header')).toBeHidden()
  await page.getByRole('button', { name: '退出专注模式' }).click({ timeout: 5_000 })
  await expect(page.locator('.pmis-task-workspace .business-workspace-header')).toBeVisible()
  await focus.locator('..').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.pmis-task-workspace .business-workspace-header')).toBeVisible()

  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('深色恢复记录', { exact: true })).toBeVisible()
  await expect(metric(page, '任务总数')).toHaveText('1')
  await assertAppearance(page, appearance)
  expect(calls).toBe(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'task-recovered-dark-shadow-570.png')
})
