import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180000)

test('生产单替换明细后旧删除不能移除新明细', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/mes-work-order-stale-row.html', { waitUntil: 'commit' })
  const removeButtons = page.locator('.work-order-details .art-button-table[aria-label="删除"]')
  await expect(removeButtons).toHaveCount(2, { timeout: 120000 })
  await page.getByRole('button', { name: '捕获旧删除并替换明细' }).click()
  await expect(page.getByTestId('mes-captured')).toHaveText('true')
  await expect(page.getByTestId('mes-rows')).toHaveText('["NEW-01","NEW-02"]')
  await page.getByRole('button', { name: '触发旧删除' }).click()
  await expect(page.getByTestId('mes-invoked')).toHaveText('1')
  await expect(page.getByTestId('mes-rows')).toHaveText('["NEW-01","NEW-02"]')
  await page.screenshot({
    path: info.outputPath('mes-work-order-stale-row.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

test('生产单当前明细仍可正常删除一行', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/mes-work-order-stale-row.html', { waitUntil: 'commit' })
  const removeButtons = page.locator('.work-order-details .art-button-table[aria-label="删除"]')
  await expect(removeButtons).toHaveCount(2, { timeout: 120000 })
  await removeButtons.first().click()
  await expect(page.getByTestId('mes-rows')).toHaveText('["OLD-02"]')
})
