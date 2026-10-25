import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const configured of [false, true]) {
  test(`员工履历公共字典标签 ${configured ? '配置字典' : '缺失字典'}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const histories = [
      {
        key: 'contracts',
        tab: '劳动合同 3',
        field: 'contract_status',
        code: 'hrContractStatus',
        label: '已签署合同'
      },
      {
        key: 'educations',
        tab: '教育背景 3',
        field: 'education_level',
        code: 'hrEducationLevel',
        label: '本科教育'
      },
      {
        key: 'trainings',
        tab: '培训经历 3',
        field: 'training_result',
        code: 'hrTrainingResult',
        label: '培训通过'
      },
      {
        key: 'rewards',
        tab: '奖惩经历 3',
        field: 'record_type',
        code: 'hrRewardType',
        label: '年度奖励'
      }
    ]
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/hr_get_employee_profile_secure')) {
        return route.fulfill({
          json: {
            id: '11111111-1111-4111-8111-111111111113',
            employee_name: '复用验证员工',
            employee_no: 'EMP-001',
            employment_status: 'active',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            field_access: {
              careerRecords: 'read',
              identityDetails: 'read',
              contactDetails: 'read',
              compensationDetails: 'read',
              maintenanceAudit: 'read'
            },
            ...Object.fromEntries(
              histories.map((history) => [
                history.key,
                ['known', 'blank', 'legacy'].map((value, index) => ({
                  id: `${history.key}-${index}`,
                  [history.field]: value
                }))
              ])
            )
          }
        })
      }
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const history = histories.find((item) => item.code === code)
      return route.fulfill({
        json:
          configured && history
            ? [
                { value: 'known', label: history.label, sort: 0 },
                { value: 'blank', label: '', name: '不应作为履历徽标', sort: 1 }
              ]
            : []
      })
    })
    await page.goto('/tests/e2e/fixtures/hr-all-pages.html?page=personnel/employee-detail')
    await expect(page.getByRole('tab', { name: '劳动合同 3', exact: true })).toBeVisible({
      timeout: 60_000
    })
    for (const history of histories) {
      await page.getByRole('tab', { name: history.tab, exact: true }).click()
      const records = page.locator('.employee-history-list:visible article')
      await expect(records).toHaveCount(3)
      const known = records.nth(0).locator('header .el-tag')
      if (configured) await expect(known).toHaveText(history.label)
      else await expect(known).toHaveCount(0)
      await expect(records.nth(1).locator('header .el-tag')).toHaveCount(0)
      await expect(records.nth(2).locator('header .el-tag')).toHaveCount(0)
    }
    await page.screenshot({ path: info.outputPath('employee-history.png'), animations: 'disabled' })
    await page.locator('.employee-history-list:visible article').last().scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath('employee-history-lower.png'),
      animations: 'disabled'
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
