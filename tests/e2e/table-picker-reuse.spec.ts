import { expect, test } from '@playwright/test'
test('表格选择器键盘边界和插入参数正确', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/table-picker-reuse.html')
  const first = page.getByRole('gridcell', { name: '插入 1 行 1 列表格', exact: true })
  await first.focus()
  await first.press('ArrowUp')
  await first.press('ArrowLeft')
  await expect(first).toBeFocused()
  for (let index = 0; index < 10; index++) await page.keyboard.press('ArrowDown')
  for (let index = 0; index < 10; index++) await page.keyboard.press('ArrowRight')
  const last = page.getByRole('gridcell', { name: '插入 8 行 8 列表格', exact: true })
  await expect(last).toBeFocused()
  await last.press('Enter')
  await expect(page.locator('output')).toHaveText(
    JSON.stringify({ rows: 8, columns: 8, withHeaderRow: true })
  )
  await page.getByRole('switch', { name: '首行作为表头' }).click()
  await first.click()
  await expect(page.locator('output')).toHaveText(
    JSON.stringify({ rows: 1, columns: 1, withHeaderRow: false })
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('picker.png') })
})
