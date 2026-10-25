import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

const pages = [
  'operations/absence',
  'operations/attendance',
  'operations/benefits',
  'operations/compensation',
  'operations/compensation-review',
  'operations/contingent-workforce',
  'operations/employee-experience',
  'operations/employee-relations',
  'operations/headcount',
  'operations/people-analytics',
  'operations/policy-acknowledgement',
  'operations/self-service',
  'operations/workforce-risk',
  'personnel/compliance',
  'personnel/employee-detail',
  'personnel/employee-profile',
  'personnel/employee-roster',
  'personnel/job-architecture',
  'personnel/lifecycle',
  'personnel/organization-design',
  'personnel/organization-position',
  'personnel/personnel-change',
  'personnel/position',
  'recruitment/workbench',
  'talent/development',
  'talent/internal-mobility',
  'talent/performance',
  'talent/skill-matrix',
  'talent/succession',
  'talent/talent-inventory'
] as const

test.use({ storageState: { cookies: [], origins: [] } })
for (const name of pages) {
  for (const width of [1440, 570]) {
    test(`HR ${name} ${width}px 渲染且无页面溢出`, async ({ page }, testInfo) => {
      test.setTimeout(90_000)
      await prepareIsolatedSession(page)
      await page.setViewportSize({ width, height: 900 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      if (name === 'personnel/employee-detail') {
        await page.route('**/rest/v1/rpc/hr_get_employee_profile_secure**', (route) =>
          route.fulfill({
            json: {
              id: '11111111-1111-4111-8111-111111111113',
              employee_name: '测试员工',
              employee_no: 'EMP-001',
              employment_status: 'active',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              field_access: {}
            }
          })
        )
      }
      await page.goto(`/tests/e2e/fixtures/hr-all-pages.html?page=${name}`)
      const workspace = page.locator('main.art-page-view')
      await expect(workspace).toBeVisible({ timeout: 60_000 })
      await expect
        .poll(async () => (await workspace.textContent())?.trim().length ?? 0, { timeout: 60_000 })
        .toBeGreaterThan(80)
      await expect(workspace.getByText('暂无查看权限', { exact: true })).toHaveCount(0)
      await expect
        .poll(() => workspace.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
        .toBe(true)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        .toBe(true)
      expect(errors).toEqual([])
      await workspace.screenshot({ path: testInfo.outputPath('page.png'), animations: 'disabled' })
    })
  }
}
