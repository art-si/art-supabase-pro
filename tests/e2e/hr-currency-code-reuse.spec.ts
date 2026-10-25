import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const feature of ['review', 'contingent', 'benefits', 'enrollment']) {
  test(`${feature} 公共金额显示保留币种、精度和受控金额`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = route.request().url()
      const cycle = {
        id: 'cycle',
        tenant_id: 'hr-layout-tenant',
        cycle_code: 'MERIT-001',
        cycle_name: '精度验证周期',
        currency_code: 'USD',
        status: 'draft',
        effective_date: '2026-12-01',
        guideline_min_percent: 1.234,
        guideline_max_percent: 5.678,
        default_budget_percent: 2.345,
        budget_amount: 1234.5678,
        proposed_increase_amount: '***'
      }
      if (url.includes('hr_compensation_review_overview_secure'))
        return route.fulfill({
          json: {
            cycle_count: 1,
            amount_access: true,
            selected_cycle: cycle,
            budget_amount: 1234.5678,
            proposed_increase_amount: '***',
            budget_utilization: 1.234
          }
        })
      if (url.includes('hr_list_compensation_review_records_secure')) {
        const kind = route.request().postDataJSON().p_kind
        const record =
          kind === 'item'
            ? {
                id: 'review-item',
                tenant_id: 'hr-layout-tenant',
                cycle_id: 'cycle',
                cycle_status: 'open',
                employee_name: '精度验证员工',
                employee_no: 'EMP-001',
                status: 'pending',
                currency_code: 'USD',
                current_base_amount: 1234.5678,
                proposed_base_amount: 0
              }
            : cycle
        const records =
          kind === 'cycle'
            ? [
                record,
                {
                  ...cycle,
                  id: 'eur-cycle',
                  cycle_code: 'MERIT-EUR',
                  cycle_name: '欧元验证周期',
                  currency_code: 'EUR'
                }
              ]
            : [record]
        return route.fulfill({ json: { records, total: records.length, amount_access: true } })
      }
      if (url.includes('hr_benefits_overview_secure'))
        return route.fulfill({
          json: { amount_visible: true, monthly_employer_contribution: 1234.5678 }
        })
      if (url.includes('hr_get_benefit_detail_secure'))
        return route.fulfill({
          json: {
            id: 'enrollment',
            tenant_id: 'test-tenant',
            enrollment_no: 'ENR-001',
            status: 'draft',
            currency_code: 'EUR',
            employee_contribution: 1234.5678,
            employer_contribution: 0,
            employee: { employee_name: '测试员工', employee_no: 'EMP-001' },
            events: [],
            attachment_urls: []
          }
        })
      if (url.includes('hr_list_contingent_workforce_records_secure'))
        return route.fulfill({
          json: {
            records: [
              {
                id: 'engagement',
                engagement_no: 'EXT-001',
                worker_name: '精度验证人员',
                status: 'draft',
                compliance_status: 'pending',
                start_date: '2026-10-01',
                end_date: '2026-12-31',
                currency_code: 'EUR',
                billing_rate: 1234.5678
              }
            ],
            total: 1,
            cost_access: true
          }
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(
      feature === 'enrollment'
        ? '/tests/e2e/fixtures/hr-detail-states.html?feature=benefits&entity=enrollment'
        : `/tests/e2e/fixtures/hr-page-layout.html?page=${feature}`
    )
    await expect(
      page.locator(feature === 'enrollment' ? '.el-drawer' : '.business-workspace-page')
    ).toBeVisible({ timeout: 60_000 })
    if (feature === 'review') {
      await expect(page.getByText('*** / USD 1,234.568', { exact: true })).toBeVisible()
      await expect(page.getByText('默认预算率 2.35%', { exact: true })).toBeVisible()
      await expect(page.getByText('USD 1,234.568', { exact: true }).first()).toBeAttached()
      const eurRow = page.locator('.el-table__body tr').filter({ hasText: 'MERIT-EUR' }).first()
      await expect(eurRow.getByText('EUR 1,234.568', { exact: true })).toBeAttached()
      await page.getByRole('tab', { name: /^员工工作表/ }).click()
      const row = page.locator('.el-table__body tr').filter({ hasText: 'EMP-001' }).first()
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      const snapshot = page.getByRole('region', { name: '员工调薪快照' })
      await expect(snapshot.getByText('USD 1,234.568', { exact: true })).toBeVisible()
      await expect(snapshot.getByText('USD 0.00', { exact: true })).toBeVisible()
    } else if (feature === 'benefits') {
      await expect(page.getByText('CNY 1,234.568', { exact: true })).toBeVisible()
    } else {
      await expect(page.getByText('EUR 1,234.568', { exact: true }).first()).toBeAttached()
      if (feature === 'contingent') {
        await page.getByText('EUR 1,234.568', { exact: true }).first().scrollIntoViewIfNeeded()
      }
      if (feature === 'enrollment')
        await expect(page.getByText('EUR 0.00', { exact: true })).toBeVisible()
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
    await page.screenshot({
      path: testInfo.outputPath(`${feature}-currency.png`),
      animations: 'disabled'
    })
  })
}
