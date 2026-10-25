import { expect, test } from '@playwright/test'
import { blockExternalIconRequests } from './support/icons'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('本地图标在外部图标服务不可用时完整显示', async ({ page }) => {
  const externalRequests = await blockExternalIconRequests(page)
  await page.goto('/tests/e2e/fixtures/art-svg-icon-attrs.html')
  const icons = page.getByTestId('offline-icon')
  await expect(icons).toHaveCount(13)
  for (const icon of await icons.all()) {
    await expect(icon).toBeVisible()
    await expect(icon.locator('path').first()).toBeAttached()
  }
  expect(externalRequests).toEqual([])
})

test('共享图标保留无障碍属性并更新动态样式和尺寸', async ({ page }, testInfo) => {
  await page.goto('/tests/e2e/fixtures/art-svg-icon-attrs.html')
  await expect(page.getByTestId('decorative-icon')).toHaveAttribute('aria-hidden', 'true')
  const icon = page.getByRole('img', { name: '已完成', exact: true })
  await expect(icon).toHaveClass(/compact/)
  await expect(icon).toHaveCSS('color', 'rgb(60, 70, 90)')
  await expect(icon).toHaveAttribute('width', '24')
  await page.getByRole('button', { name: '切换尺寸' }).click()
  const expanded = page.getByRole('img', { name: '已完成，大图标', exact: true })
  await expect(expanded).toHaveClass(/expanded/)
  await expect(expanded).not.toHaveClass(/compact/)
  await expect(expanded).toHaveCSS('color', 'rgb(20, 120, 80)')
  await expect(expanded).toHaveAttribute('width', '48')
  await expect(expanded.locator('path')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('icon-attributes.png') })
})
