import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const scenarios = [
  { feature: 'benefits', entity: 'plan', tabs: 2 },
  { feature: 'benefits', entity: 'enrollment', tabs: 2 },
  { feature: 'benefits', entity: 'event', tabs: 2 },
  { feature: 'compliance', entity: 'contract', tabs: 2 },
  { feature: 'compliance', entity: 'qualification', tabs: 2 },
  { feature: 'relations', entity: 'case', tabs: 4 },
  { feature: 'relations', entity: 'restricted', tabs: 3 },
  { feature: 'service', entity: 'request', tabs: 2 },
  { feature: 'experience', entity: 'survey', tabs: 2 },
  { feature: 'experience', entity: 'insight', tabs: 4 },
  { feature: 'experience', entity: 'action', tabs: 2 },
  { feature: 'experience', entity: 'my', tabs: 0 }
]
for (const scenario of scenarios) {
  test(`HR ${scenario.feature}/${scenario.entity} 详情分类可见且切页不丢内容`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    const narrow =
      scenario.entity === 'event' ||
      scenario.entity === 'qualification' ||
      scenario.entity === 'insight'
    await page.setViewportSize({ width: narrow ? 570 : 1440, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('_detail_secure')
          ? {
              id: 'detail-record',
              tenantId: 'test-tenant',
              planName: '验收福利计划',
              planCode: 'BEN-001',
              title: '验收详情事项',
              caseNo: 'CASE-001',
              contractNo: 'CONTRACT-001',
              qualificationName: '验收员工资质',
              surveyName: '验收员工调查',
              surveyCode: 'SURVEY-001',
              status: 'draft',
              availability: 'available',
              severity: 'low',
              minimumGroupSize: 5,
              currencyCode: 'CNY',
              eventType: 'marriage',
              eventDate: '2026-11-01',
              enrollmentWindowEnd: '2026-12-01',
              employee: {
                id: 'employee-1',
                tenantId: 'test-tenant',
                employeeName: '验收员工',
                employeeNo: 'EMP-001'
              },
              options: [],
              actions: [],
              events: [],
              questions: [],
              questionCount: 0,
              questionScores: [],
              organizationScores: [],
              comments: [],
              attachmentUrls: [],
              respondentCount: 8,
              scorePercent: 75,
              dimension: 'engagement',
              description: '业务上下文说明。'.repeat(90),
              sensitiveRestricted: scenario.entity === 'restricted'
            }
          : []
      })
    )
    await page.goto(
      `/tests/e2e/fixtures/hr-detail-states.html?feature=${scenario.feature}&entity=${scenario.entity}&theme=${narrow ? 'dark' : 'light'}`
    )
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    await expect(drawer.locator('h3')).toBeVisible()
    const tabs = drawer.getByRole('tab')
    await expect(tabs).toHaveCount(scenario.tabs)
    await expect(drawer.getByText('详情记录不可用', { exact: true })).toHaveCount(0)
    if (scenario.tabs) {
      const panes = drawer.locator('.el-tab-pane')
      await expect(panes).toHaveCount(scenario.tabs)
      for (let index = 0; index < scenario.tabs; index++) {
        await tabs.nth(index).click()
        await expect(tabs.nth(index)).toHaveAttribute('aria-selected', 'true')
        await expect(panes.nth(index)).toBeVisible()
        expect((await panes.nth(index).innerText()).trim().length).toBeGreaterThan(0)
        expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        const scroll = drawer.locator('.el-scrollbar__wrap').first()
        await scroll.evaluate((node) => {
          node.scrollTop = node.scrollHeight
        })
        if (index === scenario.tabs - 1)
          await page.screenshot({
            path: testInfo.outputPath('detail-last-tab.png'),
            animations: 'disabled'
          })
      }
      await tabs.first().click()
      await expect(panes.first()).toBeVisible()
    } else {
      await page.screenshot({
        path: testInfo.outputPath('detail-compact.png'),
        animations: 'disabled'
      })
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
