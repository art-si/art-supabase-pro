import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const platformTenantId = '11111111-1111-4111-8111-111111111111'
const selectedTenantId = '22222222-2222-4222-8222-222222222222'

test('财务识别在全部租户默认平台租户，指定租户后切换上传目标', async ({ page }, testInfo) => {
  await page.goto('http://127.0.0.1:3012/tests/e2e/fixtures/recognition-tenant-default.html')
  const writeTenant = page.getByTestId('write-tenant')
  const upload = page.locator('.invoice-ocr-panel .upload-container').first()

  await expect(writeTenant).toHaveText(platformTenantId)
  await expect(upload).not.toHaveClass(/is-disabled/)

  await page.getByRole('button', { name: '指定租户' }).click()
  await expect(writeTenant).toHaveText(selectedTenantId)
  await expect(upload).not.toHaveClass(/is-disabled/)

  await page.getByRole('button', { name: '全部租户' }).click()
  await expect(writeTenant).toHaveText(platformTenantId)
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({
    path: `.artifacts/fms-recognition-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})
