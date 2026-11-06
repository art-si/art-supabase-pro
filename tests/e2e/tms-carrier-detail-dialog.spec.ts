import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('承运商详情在弹窗与全屏模式中按页签展示', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('/rpc/tms_get_carrier_secure')) {
      await route.fulfill({
        json: {
          id: 'carrier-visual',
          company_name: '华东运输承运商',
          carrier_code: 'CYS-2026-001',
          enabled: true,
          contact_name: '测试联系人',
          invoice_title: '华东运输承运商',
          signed_contract: true,
          field_access: {}
        }
      })
      return
    }
    await route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-detail-format.html?kind=carrier-master', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.locator('.carrier-detail-dialog')
  await expect(dialog).toContainText('华东运输承运商')
  await expect(dialog.getByText('承运商编码', { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '联系人信息' }).click()
  await expect(dialog.getByText('测试联系人')).toBeVisible()
  await dialog.getByRole('tab', { name: '财务信息' }).click()
  await expect(dialog.getByText('发票抬头', { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '合同信息' }).click()
  await expect(dialog.getByText('是否签订合同', { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '名下司机' }).click()
  await expect(dialog.getByText('司机管理')).toBeVisible()
  await dialog.getByRole('tab', { name: '名下车辆' }).click()
  await expect(dialog.getByText('车辆管理')).toBeVisible()
  await page.screenshot({
    path: info.outputPath('carrier-detail-normal.png'),
    animations: 'disabled'
  })

  await dialog.locator('.art-dialog__fullscreen-button').click()
  await expect(dialog).toHaveClass(/is-fullscreen/)
  await expect(dialog.getByText('车辆管理')).toBeVisible()
  await page.screenshot({
    path: info.outputPath('carrier-detail-fullscreen.png'),
    animations: 'disabled'
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('承运商详情无记录时展示空状态', async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('/rpc/tms_get_carrier_secure')) {
      await route.fulfill({ json: null })
      return
    }
    await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-detail-format.html?kind=carrier-master', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.locator('.carrier-detail-dialog')
  await expect(dialog.getByText('暂无承运商详情')).toBeVisible()
})
