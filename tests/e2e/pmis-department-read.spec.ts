import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const evidenceDir = join(
  process.cwd(),
  '.artifacts',
  'quality-audit',
  'pmis-department-read-browser'
)
type Kind = 'maintenance' | 'repair'

const fixture = (view = 'setting', kind: Kind = 'maintenance') =>
  `/tests/e2e/fixtures/pmis-department-read.html?view=${view}&kind=${kind}`

function department(index: number) {
  return {
    id: `department-${index}`,
    tenant_id: tenantA,
    parent_id: null,
    department_code: `D-${index}`,
    department_name: `生产部门 ${index}`
  }
}

function setting(index: number, kind: Kind) {
  return {
    id: `setting-${index}`,
    tenant_id: tenantA,
    setting_kind: kind,
    department_id: `department-${index}`,
    require_album_photo: false,
    notification_methods: [],
    urgency_rules: [],
    department: department(index),
    employees: [],
    escalation_rules: []
  }
}

function fulfillList(route: Route, rows: object[], total = rows.length) {
  const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
  return route.fulfill({
    headers: {
      'content-range': rows.length
        ? `${offset}-${offset + rows.length - 1}/${total}`
        : `*/${total}`,
      'access-control-expose-headers': 'content-range'
    },
    json: rows
  })
}

const metric = (page: Page, label: string) =>
  page.locator('.business-workspace-header__metric').filter({ hasText: label }).locator('strong')

async function capture(page: Page, name: string) {
  await mkdir(evidenceDir, { recursive: true })
  await page.screenshot({ path: join(evidenceDir, name), fullPage: true })
}

for (const kind of ['maintenance', 'repair'] as const) {
  test(`${kind} 设置列表失败可重试`, async ({ page }) => {
    const width = kind === 'maintenance' ? 1440 : 570
    await page.setViewportSize({ width, height: 900 })
    await prepareIsolatedSession(page)
    let calls = 0
    await page.route('**/rest/v1/pmis_department_setting?*', (route) => {
      calls++
      return calls === 1
        ? route.fulfill({
            status: 500,
            json: { code: 'PGRST500', message: 'select * from secret' }
          })
        : fulfillList(route, [setting(1, kind)], 1)
    })
    await page.goto(fixture('setting', kind), { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expect(metric(page, '已配置部门')).toHaveText('—')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from secret')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `${kind}-error-${width}.png`)
    await page.getByRole('button', { name: '重新加载' }).last().click()
    await expect(page.getByText('生产部门 1', { exact: true }).last()).toBeVisible()
    await expect(metric(page, '已配置部门')).toHaveText('1')
    expect(calls).toBe(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await capture(page, `${kind}-recovered-${width}.png`)
  })
}

test('部门设置按 20/5 分页', async ({ page }) => {
  await prepareIsolatedSession(page)
  const ranges: Array<[number, number]> = []
  await page.route('**/rest/v1/pmis_department_setting?*', (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset'))
    const limit = Number(url.searchParams.get('limit'))
    ranges.push([offset, limit])
    return fulfillList(
      route,
      Array.from({ length: offset === 0 ? 20 : 5 }, (_, index) =>
        setting(offset + index + 1, 'maintenance')
      ),
      25
    )
  })
  await page.goto(fixture(), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('生产部门 1', { exact: true }).last()).toBeVisible()
  await expect(metric(page, '已配置部门')).toHaveText('25')
  await page.locator('.el-pager li.number').filter({ hasText: /^2$/ }).click()
  await expect(page.getByText('生产部门 21', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('生产部门 1', { exact: true })).toHaveCount(0)
  expect(ranges).toEqual([
    [0, 20],
    [20, 20]
  ])
})

test('部门设置导出全量不改变当前页指标', async ({ page }) => {
  await prepareIsolatedSession(page)
  let exportCalls = 0
  await page.route('**/rest/v1/pmis_department_setting?*', (route) => {
    const url = new URL(route.request().url())
    const limit = Number(url.searchParams.get('limit'))
    if (limit === 500) exportCalls++
    return fulfillList(
      route,
      Array.from({ length: limit === 500 ? 25 : 20 }, (_, index) => setting(index + 1, 'repair')),
      25
    )
  })
  await page.goto(fixture('setting', 'repair'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('生产部门 1', { exact: true }).last()).toBeVisible()
  await expect(metric(page, '已配置部门')).toHaveText('25')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await download
  expect(exportCalls).toBe(1)
  await expect(metric(page, '已配置部门')).toHaveText('25')
  await expect(page.getByText('生产部门 1', { exact: true }).last()).toBeVisible()
})

test('部门树失败显示重试，恢复后不是空树', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  await page.route('**/rest/v1/mdm_production_department?*', (route) => {
    calls++
    return calls === 1
      ? route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'select * from secret' } })
      : fulfillList(route, [department(1)], 1)
  })
  await page.goto(fixture('navigator'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('生产组织加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无部门或产线')).toHaveCount(0)
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('生产部门 1', { exact: true })).toBeVisible()
  expect(calls).toBe(2)
})

test('部门树读取跨过第 500 行', async ({ page }) => {
  await prepareIsolatedSession(page)
  const offsets: number[] = []
  await page.route('**/rest/v1/mdm_production_department?*', (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'))
    offsets.push(offset)
    return fulfillList(
      route,
      Array.from({ length: offset === 0 ? 500 : 1 }, (_, index) => department(offset + index + 1)),
      501
    )
  })
  await page.goto(fixture('navigator'), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.pmis-department-navigator__all strong')).toHaveText('501')
  await expect(page.getByText('生产部门 501', { exact: true })).toBeVisible()
  expect(offsets).toEqual([0, 500])
})

test('部门设置弹窗树加载失败只提示一次并可重开', async ({ page }) => {
  await prepareIsolatedSession(page)
  let calls = 0
  await page.route('**/rest/v1/mdm_production_department?*', (route) => {
    calls++
    return calls === 1
      ? route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'select * from secret' } })
      : fulfillList(route, [department(1)], 1)
  })
  await page.goto(fixture('dialog'), { waitUntil: 'domcontentloaded' })
  const open = page.getByRole('button', { name: '打开部门设置弹窗' })
  await open.click()
  await expect(page.locator('.el-dialog')).toBeHidden()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).not.toContainText('select * from secret')
  await open.click()
  await expect(page.locator('.el-dialog')).toBeVisible()
  await expect(page.getByText('正在加载部门与通知方式…')).toHaveCount(0)
  await page.locator('.pmis-setting-dialog .el-select').first().click()
  await expect(page.getByText('生产部门 1', { exact: true })).toBeVisible()
  expect(calls).toBe(2)
})

test('通知人员解析失败关闭弹窗，重开恢复一次提示', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/mdm_production_department?*', (route) =>
    fulfillList(route, [department(1)], 1)
  )
  let employeeCalls = 0
  await page.route('**/rest/v1/rpc/hr_list_employee_selector_secure', (route) => {
    employeeCalls++
    return employeeCalls === 1
      ? route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'select * from secret' } })
      : route.fulfill({
          json: {
            records: [
              {
                id: 'employee-1',
                tenant_id: tenantA,
                employee_no: 'E-1',
                employee_name: '通知员工'
              }
            ],
            total: 1,
            field_access: {}
          }
        })
  })
  await page.goto(`${fixture('dialog')}&row=notification`, { waitUntil: 'domcontentloaded' })
  const open = page.getByRole('button', { name: '打开部门设置弹窗' })
  await open.click()
  await expect(page.locator('.el-dialog')).toBeHidden()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await open.click()
  await expect(page.locator('.el-dialog')).toBeVisible()
  await expect(page.getByText('正在加载部门与通知方式…')).toHaveCount(0)
  await expect(page.getByText('通知员工')).toBeVisible()
  expect(employeeCalls).toBe(2)
})

test('部门设置弹窗关闭重开会取消旧通知人请求', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/mdm_production_department?*', (route) =>
    fulfillList(route, [department(1)], 1)
  )
  let calls = 0
  let releaseOld: (() => void) | undefined
  let releaseNew: (() => void) | undefined
  const failedRequests: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().includes('/rpc/hr_list_employee_selector_secure'))
      failedRequests.push(request.failure()?.errorText ?? '')
  })
  const started: Array<() => void> = []
  const firstStarted = new Promise<void>((resolve) => started.push(resolve))
  const secondStarted = new Promise<void>((resolve) => started.push(resolve))
  await page.route('**/rest/v1/rpc/hr_list_employee_selector_secure', async (route) => {
    calls++
    const current = calls
    started[current - 1]?.()
    await new Promise<void>((resolve) => {
      if (current === 1) releaseOld = resolve
      else releaseNew = resolve
    })
    await route
      .fulfill({
        json: {
          records: [
            {
              id: 'employee-1',
              tenant_id: tenantA,
              employee_no: 'E-1',
              employee_name: current === 1 ? '旧通知员工' : '新通知员工'
            }
          ],
          total: 1,
          field_access: {}
        }
      })
      .catch(() => undefined)
  })
  await page.goto(`${fixture('dialog')}&row=notification`, { waitUntil: 'domcontentloaded' })
  const open = page.getByRole('button', { name: '打开部门设置弹窗' })
  await open.click()
  await firstStarted
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(page.locator('.el-dialog')).toBeHidden()
  await open.click()
  await secondStarted
  releaseOld?.()
  await expect.poll(() => failedRequests.some((error) => /ABORTED/i.test(error))).toBe(true)
  await expect(page.getByText('正在加载部门与通知方式…')).toBeVisible()
  releaseNew?.()
  await expect(page.getByText('正在加载部门与通知方式…')).toHaveCount(0)
  await expect(page.getByText('新通知员工')).toBeVisible()
  await expect(page.getByText('旧通知员工')).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})

test('看板部门筛选失败不隐藏设备选项，单独重试不重载任务', async ({ page }) => {
  await page.setViewportSize({ width: 570, height: 900 })
  await prepareIsolatedSession(page)
  let departmentCalls = 0
  let equipmentCalls = 0
  let taskCalls = 0
  await page.route('**/rest/v1/mdm_production_department?*', (route) => {
    departmentCalls++
    return departmentCalls === 1
      ? route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'unavailable' } })
      : fulfillList(route, [department(1)], 1)
  })
  await page.route('**/rest/v1/mdm_equipment?*', (route) => {
    equipmentCalls++
    return fulfillList(
      route,
      [
        {
          id: 'equipment-1',
          tenant_id: tenantA,
          equipment_code: 'EQ-1',
          equipment_name: '可用设备',
          operation_status: 'normal',
          status: 'enabled',
          department: null
        }
      ],
      1
    )
  })
  await page.route('**/rest/v1/pmis_task?*', (route) => {
    taskCalls++
    return fulfillList(
      route,
      [
        {
          id: 'task-1',
          tenant_id: tenantA,
          task_no: 'TASK-1',
          planned_date: '2099-01-01',
          status: 'pending',
          task_source: 'scheduled',
          before_photo_files: [],
          after_photo_files: [],
          plan: {
            id: 'plan-1',
            plan_kind: 'inspection',
            plan_name: '测试方案',
            required_days: 1,
            require_photo: false,
            items: []
          },
          equipment: {
            id: 'equipment-1',
            tenant_id: tenantA,
            equipment_code: 'EQ-1',
            equipment_name: '可用设备',
            department: null
          },
          results: []
        }
      ],
      1
    )
  })
  await page.goto(fixture('dashboard'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('部分筛选选项暂不可用')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'dashboard-partial-filter-error-570.png')
  await expect(page.getByRole('combobox', { name: '筛选部门或产线' })).toBeDisabled()
  const equipment = page.getByRole('combobox', { name: '筛选设备' })
  await expect(equipment).toBeEnabled()
  await equipment.click()
  await expect(page.getByText('可用设备 · EQ-1')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('可用设备', { exact: true }).first()).toBeVisible()
  expect(taskCalls).toBe(1)

  await page.getByRole('button', { name: '重新加载筛选' }).click()
  await expect(page.getByText('部分筛选选项暂不可用')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: '筛选部门或产线' })).toBeEnabled()
  expect(departmentCalls).toBe(2)
  expect(equipmentCalls).toBe(2)
  expect(taskCalls).toBe(1)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capture(page, 'dashboard-filter-recovered-570.png')
})
