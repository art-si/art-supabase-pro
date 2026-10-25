import { expect, test } from '@playwright/test'
test('公共打印生命周期清理成功、异常及卸载状态', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await page.goto('/tests/e2e/fixtures/print-sheet-reuse.html')
  const print = page.getByRole('button', { name: '打印', exact: true })
  await print.click()
  await expect(page.locator('body')).toHaveClass('test-print-sheet')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('body')).not.toHaveClass('test-print-sheet')
  await expect(page.locator('output')).toHaveText('1')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await expect(page.locator('output')).toHaveText('1')
  await page.evaluate(() => {
    window.print = () => {
      throw new Error('synthetic')
    }
  })
  await print.click()
  await expect(page.getByText('打印失败', { exact: true })).toBeVisible()
  await expect(page.locator('output')).toHaveText('2')
  await expect(page.locator('body')).not.toHaveClass('test-print-sheet')
  await page.evaluate(() => {
    window.print = () => {}
  })
  await print.click()
  await page.getByRole('button', { name: '切换组件' }).click()
  await expect(page.locator('body')).not.toHaveClass('test-print-sheet')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  await page.getByRole('button', { name: '切换组件' }).click()
  await expect(page.locator('output')).toHaveText('0')
})
