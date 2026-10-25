import { expect, test } from '@playwright/test'

test('普通用户可查看租户配置与平台默认配置合并后的完整 AI 能力目录', async ({ page }) => {
  test.setTimeout(180_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/system/ai-configuration', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'AI 配置中心' })).toBeVisible({
    timeout: 120_000
  })
  await expect(page.getByText('只读模式', { exact: true })).toBeVisible()

  const tableRows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(tableRows.first()).toBeVisible({ timeout: 60_000 })
  const rowCount = await tableRows.count()
  const platformDefaultCount = await page.getByText('平台默认', { exact: true }).count()
  const tenantConfigCount = await page.getByText('租户配置', { exact: true }).count()
  expect(rowCount).toBeGreaterThan(0)
  expect(platformDefaultCount).toBeGreaterThan(0)
  expect(tenantConfigCount).toBeGreaterThan(0)
  expect(platformDefaultCount + tenantConfigCount).toBe(rowCount)
  await expect(page.getByRole('button', { name: /新增|保存|发布/ })).toHaveCount(0)

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  expect(pageErrors).toEqual([])

  await page.screenshot({
    path: '.artifacts/ai-configuration-inheritance-desktop.png',
    fullPage: true
  })

  await tableRows.last().scrollIntoViewIfNeeded()
  await expect(tableRows.last()).toBeVisible()
  await page.screenshot({
    path: '.artifacts/ai-configuration-inheritance-table-bottom.png',
    fullPage: true
  })
})
