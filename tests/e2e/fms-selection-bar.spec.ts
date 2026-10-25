import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(60_000)

test('批量按钮紧跟已选数量靠左排列，保留明确的危险操作样式', async ({ page }, testInfo) => {
  await page.goto('/tests/e2e/fixtures/fms-selection-bar.html', { waitUntil: 'domcontentloaded' })
  await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
  const summary = page.locator('.art-table-query__selection-summary')
  const deleteButton = page.getByRole('button', { name: '批量删除' })
  await expect(summary).toContainText('已选择 1 项')
  await expect(deleteButton).toHaveClass(/el-button--danger/)
  const summaryBox = await summary.boundingBox()
  const actionBox = await deleteButton.boundingBox()
  expect(summaryBox).not.toBeNull()
  expect(actionBox).not.toBeNull()
  const gap = actionBox!.x - (summaryBox!.x + summaryBox!.width)
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(16)
  await page.screenshot({
    path: testInfo.outputPath('selection-bar.png'),
    animations: 'disabled'
  })
})
