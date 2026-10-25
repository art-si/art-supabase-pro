import { expect, test } from '@playwright/test'
test('车辆面板按记录 ID 加载且旧请求不覆盖新车辆', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/vehicle-panel-race.html')
  await expect(page.getByText('加载中', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换同车牌车辆' }).click()
  await expect(page.locator('output')).toHaveText('second')
  await expect(page.getByText('加载结束', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '释放旧请求' }).click()
  await expect(page.locator('output')).toHaveText('second')
  await page.getByRole('button', { name: '清空车辆' }).click()
  await expect(page.locator('output')).toHaveText('')
})
