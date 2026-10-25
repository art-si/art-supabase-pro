import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('BOM 公共格式化保留日期和空白文本策略', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/bom-process-retry.html')
  await page.getByRole('button', { name: '打开 BOM 展示验收' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const table = dialog.locator('.art-table.bom-detail-dialog__component-table')
  await expect(table).toContainText('2026-10-08')
  await expect(table).toContainText('项目文本')
  await expect(table).toContainText('工序名称')
  await expect(table).not.toContainText('invalid')
  await expect(table.locator('.el-table__body-wrapper')).toContainText('—')
  await table.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('bom-display.png'), fullPage: true })
  await table.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.screenshot({ path: info.outputPath('bom-display-fields.png'), fullPage: true })
  expect(errors).toEqual([])
})
