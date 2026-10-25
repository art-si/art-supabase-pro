import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const feature of ['compensation', 'recruitment']) {
  test(`${feature} 薪酬复用公共格式化`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/hr_list_compensation_records_secure')) {
        const records = [
          { currency_code: 'CNY', base_amount: 12345.6789 },
          { currency_code: 'USD', base_amount: 0 },
          { currency_code: 'KWD', base_amount: 12345.6789 },
          { currency_code: 'CNY', base_amount: '***' }
        ].map((amount, index) => ({
          id: `salary-${index}`,
          employee: { employee_no: `EMP-${index}`, employee_name: `格式验证员工${index}` },
          lifecycle_status: 'draft',
          ...amount
        }))
        return route.fulfill({ json: { records, total: records.length, amount_access: true } })
      }
      if (path.endsWith('/hr_list_recruitment_records_secure')) {
        const records =
          route.request().postDataJSON().p_kind === 'offer'
            ? [
                {
                  id: 'offer',
                  offer_no: 'OFFER-TEST',
                  proposed_onboard_date: '2026-12-01',
                  expires_on: '2026-11-15',
                  version_no: 1,
                  currency: 'USD',
                  monthly_salary: 12345.6789,
                  target_bonus: 0,
                  status: 'draft',
                  candidate: { name: '格式验证候选人', position_name: '测试岗位' }
                }
              ]
            : []
        return route.fulfill({ json: { records, total: records.length, sensitive_access: true } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-all-pages.html?page=${feature === 'compensation' ? 'operations/compensation' : 'recruitment/workbench'}`
    )
    await expect(page.locator('.business-workspace-page')).toBeVisible({ timeout: 60_000 })
    if (feature === 'recruitment') await page.getByRole('tab', { name: /Offer 管理/ }).click()
    const table = page.locator('.el-table')
    await expect(table).toBeVisible()
    const expected =
      feature === 'compensation'
        ? ['¥12,345.68', 'US$0.00', 'KWD 12,345.679', '••••••']
        : ['USD 12,345.679/月', '目标奖金 0']
    for (const value of expected)
      await expect(table.getByText(value, { exact: true }).first()).toBeVisible()
    if (feature === 'recruitment')
      await expect(table.getByText('有效至 2026-11-15', { exact: true })).toBeVisible()
    await table.getByText(expected[0], { exact: true }).first().scrollIntoViewIfNeeded()
    await table.screenshot({ path: info.outputPath('salary-values.png'), animations: 'disabled' })
    await page
      .locator('.el-switch')
      .filter({ has: page.getByRole('switch', { name: '进入专注模式' }) })
      .click()
    await expect(page.locator('.business-workspace-header')).toBeHidden()
    await expect(table).toBeVisible()
    await table.screenshot({ path: info.outputPath('focus-values.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    await page
      .locator('.el-switch')
      .filter({ has: page.getByRole('switch', { name: '进入专注模式' }) })
      .click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.business-workspace-header')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
