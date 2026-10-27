import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'

test('设备选项失败可就地重试，切换租户只重新加载一次日历任务', async ({ page }, info) => {
  const errors: string[] = []
  const taskScopes: string[] = []
  let equipmentCalls = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    if (table === 'mdm_equipment') {
      equipmentCalls++
      if (equipmentCalls === 1)
        return route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'unavailable' } })
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'equipment-a',
            tenant_id: route.request().headers()['x-art-tenant-scope'],
            equipment_code: 'EQ-A',
            equipment_name: '设备甲',
            status: 'enabled',
            department: null
          }
        ]
      })
    }
    if (table === 'pmis_task')
      taskScopes.push(route.request().headers()['x-art-tenant-scope'] ?? '')
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })

  await page.goto('/tests/e2e/fixtures/pmis-calendar-scope.html', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('设备筛选暂不可用')).toBeVisible()
  await expect(page.getByText('请先选择设备')).toBeVisible()
  await expect(page.getByRole('combobox', { name: '设备' })).toBeVisible()
  await expect.poll(() => taskScopes).toEqual([tenantA])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('equipment-retry-desktop.png') })
  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(page.getByText('设备筛选暂不可用')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('equipment-retry-narrow.png') })

  await page.getByRole('button', { name: '重新加载设备' }).click()
  await expect(page.getByText('设备筛选暂不可用')).toHaveCount(0)
  await expect.poll(() => equipmentCalls).toBe(2)
  expect(taskScopes).toEqual([tenantA])

  await page.getByRole('button', { name: '切换租户 B' }).click()
  await expect.poll(() => taskScopes).toEqual([tenantA, tenantB])
  await expect.poll(() => equipmentCalls).toBe(3)
  await expect(page.getByText('请先选择设备')).toBeVisible()
  expect(errors).toEqual([])
})

test('表模式不请求未使用的设备筛选列表', async ({ page }) => {
  let equipmentCalls = 0
  let taskCalls = 0
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'mdm_equipment') equipmentCalls++
    if (table === 'pmis_task') taskCalls++
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/pmis-calendar-scope.html?mode=sheet', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('设备日历矩阵')).toBeVisible()
  await expect.poll(() => taskCalls).toBe(1)
  expect(equipmentCalls).toBe(0)
})

test('点检看板设备选项失败时保留独立加载的部门筛选', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'mdm_equipment')
      return route.fulfill({ status: 500, json: { code: 'PGRST500', message: 'unavailable' } })
    if (table === 'mdm_production_department')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'department-a',
            tenant_id: tenantA,
            parent_id: null,
            department_code: 'PROD-A',
            department_name: '装配车间'
          }
        ]
      })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/pmis-calendar-scope.html?mode=dashboard', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByText('当日暂无点检任务')).toBeVisible()
  await page.getByRole('combobox', { name: '筛选部门或产线' }).click()
  await expect(page.getByText('装配车间')).toBeVisible()
})
