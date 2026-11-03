import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('站点表单提供省市区、详细地址和地图选点', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/tms-station-dialog.html?mode=ordinary')
  const dialog = page.getByRole('dialog').filter({ hasText: '新增站点' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('省市区与详细地址')).toBeVisible()
  await expect(dialog.getByText('详细地址', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /地图/ }).first()).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('station-address.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
