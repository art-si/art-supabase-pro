import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const scenario of ['workstation', 'task', 'gantt', 'execution', 'scheduling'] as const) {
  test(`${scenario} 车间包含下级班组的工作中心`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({
        json:
          resource === 'mdm_production_department'
            ? [
                {
                  id: 'factory',
                  tenant_id: 'test-tenant',
                  parent_id: null,
                  name: '测试工厂',
                  code: 'F',
                  enabled: true,
                  sort: 1
                },
                {
                  id: 'workshop',
                  tenant_id: 'test-tenant',
                  parent_id: 'factory',
                  name: '装配车间',
                  code: 'W',
                  enabled: true,
                  sort: 2
                },
                {
                  id: 'team',
                  tenant_id: 'test-tenant',
                  parent_id: 'workshop',
                  name: '装配班组',
                  code: 'T',
                  enabled: true,
                  sort: 3
                }
              ]
            : resource === 'mdm_work_center'
              ? [
                  {
                    id: 'center',
                    tenant_id: 'test-tenant',
                    department_id: 'team',
                    code: 'WC-TEAM',
                    name: '班组工作中心',
                    sort: 1,
                    headcount: 1,
                    daily_capacity_minutes: 480,
                    efficiency_percent: 100,
                    utilization_percent: 100,
                    parallel_capacity: 1
                  }
                ]
              : resource === 'mes_scheduling_context'
                ? { shifts: [] }
                : resource === 'mes_work_order_references'
                  ? {
                      materials: [],
                      customers: [],
                      projects: [],
                      documentTypes: [],
                      employees: [],
                      workCenters: []
                    }
                  : resource?.includes('list_operation_tasks')
                    ? { records: [], total: 0 }
                    : [],
        headers: { 'content-range': '*/0' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/production-tree.html?scenario=${scenario}`, {
      waitUntil: 'domcontentloaded'
    })
    if (scenario === 'scheduling') {
      await page
        .locator('.scheduling-page__filter-grid .el-select')
        .first()
        .click({ timeout: 15_000 })
      const team = page.getByRole('treeitem', { name: '装配班组', exact: true })
      await expect(team).toBeVisible()
      expect(
        await team.evaluate((element) => {
          let level = 1
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            if (parent.getAttribute('role') === 'treeitem') level++
          }
          return level
        })
      ).toBe(3)
      await page.screenshot({ path: info.outputPath('scheduling-department-tree.png') })
      expect(errors).toEqual([])
      return
    }
    const navigator = page.locator('.production-work-center-navigator')
    await expect(navigator).toBeVisible({ timeout: 60_000 })
    await expect(navigator.getByRole('button', { name: /WC-TEAM.*班组工作中心/ })).toBeVisible()
    await navigator.getByRole('combobox', { name: '车间 / 产线', exact: true }).click()
    const workshop = page
      .getByRole('option')
      .filter({ has: page.getByText('装配车间', { exact: true }) })
    await expect(workshop).toBeVisible()
    await expect(workshop).toContainText('测试工厂 / 装配车间')
    const factory = page
      .getByRole('option')
      .filter({ has: page.getByText('测试工厂', { exact: true }) })
    if (scenario === 'execution') await expect(factory).toBeVisible()
    else await expect(factory).toHaveCount(0)
    const scopedRequest =
      scenario === 'execution'
        ? page.waitForRequest((request) => {
            const url = new URL(request.url())
            return (
              url.pathname.endsWith('/mes_operation_task') &&
              url.searchParams.get('department_id') === 'in.(workshop,team)'
            )
          })
        : undefined
    await workshop.click()
    if (scopedRequest) await scopedRequest
    await expect(navigator.getByRole('button', { name: /WC-TEAM.*班组工作中心/ })).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`${scenario}-department-tree.png`) })
    expect(errors).toEqual([])
  })
}

test('execution 生产范围加载、错误重试与空状态', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let fail = true
  let failedReads = 0
  await page.route('**/rest/v1/**', async (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    if (resource === 'mdm_production_department' || resource === 'mdm_work_center') {
      await pending
      if (fail) {
        await route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'fixture scope failure' }
        })
        failedReads++
        return
      }
    }
    await route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
  })
  await page.goto('/tests/e2e/fixtures/production-tree.html?scenario=execution', {
    waitUntil: 'domcontentloaded'
  })
  const navigator = page.locator('.production-work-center-navigator')
  await expect(navigator).toHaveAttribute('aria-busy', 'true', { timeout: 60_000 })
  release?.()
  await expect(navigator.getByText('生产范围加载失败，请重试', { exact: true })).toBeVisible()
  await expect.poll(() => failedReads).toBe(2)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('execution-scope-error.png') })
  fail = false
  await navigator.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(navigator.getByText('暂无可用车间', { exact: true })).toBeVisible()
  await expect(navigator).toHaveAttribute('aria-busy', 'false')
  await page.screenshot({ path: info.outputPath('execution-scope-empty.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
})
