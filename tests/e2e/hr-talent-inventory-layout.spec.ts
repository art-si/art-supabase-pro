import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { installDictionaryOptions } from './support/dictionary-options'

test.use({ storageState: { cookies: [], origins: [] } })
for (const viewport of [
  { width: 1280, height: 800 },
  { width: 2880, height: 1530 }
]) {
  test(`人才盘点 ${viewport.width}px 有数据与空筛选共用完整工作区，表格不越过卡片`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize(viewport)
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('hr_get_talent_inventory_secure')
          ? {
              records: Array.from({ length: 8 }, (_, index) => ({
                id: `test-${index}`,
                employee_name: `测试员工${index}`,
                employee_no: `TEST-${index}`,
                organization_name: '测试组织',
                position_name: '测试岗位',
                competency_total: 0,
                competency_gap_count: 0,
                competency_met: 0,
                performance_level: null
              })),
              generated_at: '2026-10-07T06:00:00Z'
            }
          : []
      })
    )
    await installDictionaryOptions(page, {
      hrTalentInventoryFilter: [
        { value: 'all', label: '全部' },
        { value: 'gap', label: '存在缺口' },
        { value: 'high', label: '高绩效' },
        { value: 'unassessed', label: '待评估' }
      ]
    })
    await page.goto('/tests/e2e/fixtures/hr-talent-inventory.html')
    const workspace = page.locator('.talent-inventory-page__workspace')
    await expect(workspace.getByText('测试员工0', { exact: true })).toBeVisible()
    const bounds = await workspace.evaluate((element) => {
      const card = element.getBoundingClientRect()
      const table = element.querySelector('.art-table')!.getBoundingClientRect()
      return {
        cardBottom: card.bottom,
        tableBottom: table.bottom,
        overflow: document.documentElement.scrollHeight - innerHeight
      }
    })
    expect(bounds.cardBottom).toBeCloseTo(viewport.height - 16, 0)
    expect(bounds.tableBottom).toBeLessThanOrEqual(bounds.cardBottom)
    expect(bounds.overflow).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath('inventory-records.png'),
      animations: 'disabled'
    })
    await workspace
      .locator('label')
      .filter({ hasText: /^存在缺口$/ })
      .click()
    await expect(workspace.getByText('暂无盘点员工', { exact: true })).toBeVisible()
    expect(
      await workspace.evaluate((element) => element.getBoundingClientRect().bottom)
    ).toBeCloseTo(viewport.height - 16, 0)
    await page.screenshot({
      path: testInfo.outputPath('inventory-empty.png'),
      animations: 'disabled'
    })
  })
}
