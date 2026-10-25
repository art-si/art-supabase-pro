import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] } })
for (const viewport of [
  { width: 570, height: 900 },
  { width: 1280, height: 800 },
  { width: 2880, height: 1530 }
]) {
  test(`技能矩阵 ${viewport.width}px 表格和空筛选保持在卡片内`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize(viewport)
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('hr_get_skill_matrix_secure')
          ? {
              generated_at: '2026-10-07T06:00:00Z',
              employee_count: 8,
              modelled_employee_count: 0,
              records: Array.from({ length: 8 }, (_, index) => ({
                id: `test-${index}`,
                employee_name: `测试员工${index}`,
                employee_no: `TEST-${index}`,
                organization_name: '测试组织',
                position_name: '测试岗位',
                required_count: 0,
                assessed_count: 0,
                met_count: 0,
                gap_count: 0,
                unassessed_count: 0
              })),
              competencies: []
            }
          : []
      })
    )
    await installDictionaryOptions(page, {
      hrSkillMatrixFilter: [
        { value: 'all', label: '全部' },
        { value: 'gap', label: '有缺口' },
        { value: 'ready', label: '已就绪' },
        { value: 'unassessed', label: '待评估' },
        { value: 'unmodelled', label: '未建模' }
      ]
    })
    await page.goto('/tests/e2e/fixtures/hr-talent-inventory.html?page=skills')
    const workspace = page.locator('.skill-matrix-page__employees')
    await expect(workspace.getByText('测试员工0', { exact: true })).toBeVisible()
    await workspace.scrollIntoViewIfNeeded()
    if (viewport.width < 768) {
      const header = await workspace.evaluate((element) => ({
        identityBottom: element
          .querySelector('.art-section-card__identity')!
          .getBoundingClientRect().bottom,
        filtersTop: element.querySelector('.skill-matrix-page__filters')!.getBoundingClientRect()
          .top
      }))
      expect(header.filtersTop).toBeGreaterThanOrEqual(header.identityBottom)
    }
    await expect(workspace.locator('.el-table__body-wrapper')).toHaveCSS('visibility', 'visible')
    expect(
      await workspace
        .locator('.el-table')
        .evaluate((element) => element.getBoundingClientRect().height)
    ).toBeGreaterThan(200)
    const bounds = await workspace.evaluate((element) => ({
      card: element.getBoundingClientRect().bottom,
      table: element.querySelector('.art-table')!.getBoundingClientRect().bottom,
      overflow: document.documentElement.scrollWidth - innerWidth
    }))
    expect(bounds.table).toBeLessThanOrEqual(bounds.card)
    expect(bounds.overflow).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath('skills-records.png'),
      animations: 'disabled'
    })
    await workspace
      .locator('label')
      .filter({ hasText: /^有缺口$/ })
      .click()
    await expect(workspace.getByText('暂无准备度员工', { exact: true })).toBeVisible()
    const emptyBounds = await workspace.evaluate((element) => {
      const body = element.querySelector('.art-section-card__body')!.getBoundingClientRect()
      const empty = element.querySelector('.art-empty-state')!.getBoundingClientRect()
      return { bodyCenter: body.top + body.height / 2, emptyCenter: empty.top + empty.height / 2 }
    })
    expect(Math.abs(emptyBounds.bodyCenter - emptyBounds.emptyCenter)).toBeLessThan(2)
    if (viewport.height > 1000) {
      expect(
        await workspace.evaluate((element) => element.getBoundingClientRect().bottom)
      ).toBeCloseTo(viewport.height - 16, 0)
    }
    await page.screenshot({ path: testInfo.outputPath('skills-empty.png'), animations: 'disabled' })
  })
}
