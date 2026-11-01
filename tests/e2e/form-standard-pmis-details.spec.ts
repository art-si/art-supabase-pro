import { expect, test } from '@playwright/test'
import dayjs from 'dayjs'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const department = {
  id: 'department-a',
  tenant_id: tenantId,
  department_name: '验收生产部门',
  department_code: 'QA-DEPT',
  parent_id: null
}
const equipment = {
  id: 'equipment-a',
  tenant_id: tenantId,
  equipment_name: '验收生产设备',
  equipment_code: 'QA-EQ',
  status: 'enabled',
  department
}
const items = Array.from({ length: 6 }, (_, index) => ({
  id: `item-${index}`,
  item_name: `验收检查项目${index + 1}`,
  requirement: '按项目要求确认设备运行状态',
  require_photo: false,
  sort: (index + 1) * 10
}))
const plan = {
  id: 'plan-a',
  tenant_id: tenantId,
  plan_kind: 'inspection',
  plan_name: '验收点检方案',
  frequency: 'daily',
  required_days: 1,
  status: 'enabled',
  update_time: '2026-11-01T00:00:00Z',
  items,
  equipment_bindings: [{ equipment }],
  responsible_bindings: [],
  remark: '按项目逐项检查并记录'
}
const task = {
  id: 'task-a',
  tenant_id: tenantId,
  task_no: 'QA-TASK-001',
  planned_date: dayjs().format('YYYY-MM-DD'),
  status: 'pending',
  task_source: 'scheduled',
  before_photo_files: [],
  after_photo_files: [],
  plan,
  equipment,
  results: items.map((item) => ({ id: `result-${item.id}`, item, result_status: 'ok' }))
}
const repair = {
  id: 'repair-a',
  tenant_id: tenantId,
  work_order_no: 'QA-REPAIR-001',
  urgency: 'normal',
  fault_symptom: '设备运行时存在异响',
  fault_analysis: '检查轴承与传动机构',
  fault_cause: '轴承磨损',
  solution: '更换轴承并完成负载复测',
  status: 'in_progress',
  reported_at: '2026-11-01T00:00:00Z',
  fault_photo_files: [],
  repair_photo_files: [],
  equipment
}
const setting = {
  id: 'setting-a',
  tenant_id: tenantId,
  setting_kind: 'maintenance',
  department_id: department.id,
  department,
  employees: [],
  require_album_photo: false,
  notification_methods: [],
  urgency_rules: [],
  escalation_rules: []
}

for (const [entry, fixture, tabs] of [
  ['plan', 'pmis-plan-read.html', 2],
  ['task', 'pmis-task-read.html?view=task', 2],
  ['repair', 'pmis-task-read.html?view=repair', 2],
  ['department', 'pmis-department-read.html', 0],
  ['calendar', 'pmis-calendar-scope.html?mode=sheet', 2],
  ['dashboard', 'pmis-calendar-scope.html?mode=dashboard', 0]
] as const) {
  test(`PMIS ${entry} 主列表查看入口、详情密度、窄暗与重开`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1)
      const rows =
        table === 'pmis_plan'
          ? [plan]
          : table === 'pmis_task'
            ? [task]
            : table === 'pmis_repair_task'
              ? [repair]
              : table === 'pmis_department_setting'
                ? [setting]
                : table === 'mdm_equipment'
                  ? [equipment]
                  : table === 'mdm_production_department'
                    ? [department]
                    : []
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': rows.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/${fixture}`, { waitUntil: 'domcontentloaded' })
    const open =
      entry === 'dashboard'
        ? page.getByRole('button', { name: '查看点检明细', exact: true })
        : entry === 'calendar'
          ? page.getByRole('button', { name: /查看明细/ }).first()
          : page.getByRole('button', { name: '查看', exact: true }).first()
    await open.click()
    const drawer = page.locator('.art-drawer:visible')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('tab')).toHaveCount(tabs)
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.evaluate(() => {
          document.documentElement.classList.add('dark')
          document.documentElement.dataset.boxMode = 'shadow-mode'
        })
      }
      const panes = await drawer.getByRole('tab').all()
      for (let index = 0; index < Math.max(panes.length, 1); index++) {
        if (panes[index]) await panes[index].click()
        expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        if (tabs) await expect(drawer.locator('.el-tab-pane:visible')).toHaveCount(1)
        await drawer.screenshot({ path: info.outputPath(`${entry}-${index}-${theme}.png`) })
      }
    }
    await expect(drawer.getByRole('button', { name: '确定', exact: true })).toHaveCount(0)
    await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await expect(drawer).not.toBeVisible()
    if (entry === 'task') {
      expect(
        await page.locator('.el-table__body-wrapper').evaluate((node) => node.clientHeight),
        '窄屏筛选与分页不能把表格压成零高度'
      ).toBeGreaterThan(40)
    }
    await open.click()
    if (tabs) await expect(drawer.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
    expect(errors).toEqual([])
  })
}
