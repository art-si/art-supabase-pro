import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

test('销售合同辅助数量保留三位并阻断无效单位系数', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/scm-unit-quantity.html', {
    waitUntil: 'commit',
    timeout: 180_000
  })
  const table = page.locator('.art-table.scm-quotation-summary-table')
  await expect(table).toBeVisible({ timeout: 120_000 })
  const headers = await table.locator('.el-table__header th').allTextContents()
  const auxiliaryIndex = headers.findIndex((text) => text.includes('辅助数量'))
  expect(auxiliaryIndex).toBeGreaterThanOrEqual(0)
  const auxiliaryCell = table
    .locator('.el-table__body tbody tr')
    .first()
    .locator('td')
    .nth(auxiliaryIndex)
  await expect(auxiliaryCell).toHaveText('1.234')
  await page.screenshot({ path: info.outputPath('scm-three-decimals.png'), fullPage: true })

  await page.getByRole('button', { name: '设置无效系数', exact: true }).click()
  await expect(auxiliaryCell).toHaveText('—')
  await expect(table).not.toContainText('Infinity')
  await expect(table).not.toContainText('NaN')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('scm-invalid-factor.png'), fullPage: true })
})
