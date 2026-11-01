import { expect, test } from '@playwright/test'
import dayjs from 'dayjs'
import { readFileSync } from 'node:fs'
import { prepareIsolatedSession } from './support/isolated-session'
import type { TableColumnCatalog } from '../../src/types/table-column-config'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const catalog = (
  JSON.parse(
    readFileSync('src/config/table-column-catalog.generated.json', 'utf8')
  ) as TableColumnCatalog[]
).find((item) => item.routePath === '/pmis/inspection/inspection-sheet')!

test('月矩阵读取稳定日期列配置，跨平闰年保留真实日期状态与有效天数', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  let requestedMonth = ''
  let runtimeCalls = 0
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'get_table_column_runtime') {
      runtimeCalls++
      expect(request.postDataJSON().p_route_path).toBe(catalog.routePath)
      return route.fulfill({
        json: {
          enabled: true,
          catalog,
          profiles: [
            {
              id: 'pmis-calendar-columns',
              menuId: catalog.menuId,
              scope: 'platform',
              tenantId: null,
              subjectId: null,
              source: 'configured',
              columns: catalog.columns.map((column) => ({
                ...column,
                ...(column.key === 'day01' ? { label: '首日', visible: false } : {}),
                ...(column.key === 'day15' ? { label: '核查日', width: 76 } : {})
              })),
              priority: 0,
              revision: 1,
              updatedAt: ''
            }
          ]
        }
      })
    }
    if (endpoint === 'pmis_task') {
      requestedMonth = url.searchParams.get('planned_date')?.match(/\d{4}-\d{2}/)?.[0] ?? ''
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'calendar-task',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            task_no: 'CALENDAR-TEST',
            planned_date: `${requestedMonth}-15`,
            shift_name: '早班',
            status: 'pending',
            task_source: 'scheduled',
            before_photo_files: [],
            after_photo_files: [],
            plan: {
              id: 'calendar-plan',
              plan_kind: 'inspection',
              plan_name: '列配置验证方案',
              required_days: 1,
              require_photo: false,
              items: []
            },
            equipment: {
              id: 'calendar-equipment',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              equipment_code: 'EQ-CALENDAR',
              equipment_name: '日历验证设备',
              status: 'enabled',
              department: null
            },
            results: []
          }
        ]
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/pmis-calendar-scope.html?mode=sheet&configured=true&theme=${theme}`
  )
  const matrix = page.locator('.art-table.pmis-calendar__matrix')
  const headers = matrix.locator('thead th')
  await expect(matrix).toContainText('日历验证设备')
  await expect.poll(() => runtimeCalls).toBeGreaterThan(0)
  await expect(headers.filter({ hasText: '核查日' })).toHaveCount(1)
  await expect(headers.filter({ hasText: /^\s*01\s*$/ })).toHaveCount(0)
  const input = page.locator('.pmis-calendar .art-search-bar .el-date-editor input').first()
  for (const month of ['2024-02', '2025-02', '2025-04', '2025-01']) {
    await input.fill(month)
    await input.press('Enter')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => requestedMonth).toBe(month)
    const count = dayjs(`${month}-01`).daysInMonth()
    // Index and identity stay visible; the configured hidden first day removes one date column.
    await expect(headers).toHaveCount(count + 1)
    await expect(headers.filter({ hasText: new RegExp(`^\\s*${count}\\s*$`) })).toHaveCount(1)
    const status = matrix.locator(`[aria-label="${month}-15 未检，查看明细"]`)
    const overdue = matrix.locator(`[aria-label="${month}-15 已延误，查看明细"]`)
    await expect(status.or(overdue)).toHaveCount(1)
    await expect(headers.filter({ hasText: '核查日' })).toHaveCount(1)
  }
  await page.screenshot({ path: info.outputPath('configured-calendar-desktop.png') })
  await page.setViewportSize({ width: 1024, height: 768 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('configured-calendar-narrow.png') })
  expect(errors).toEqual([])
})
