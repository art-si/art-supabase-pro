import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

test('HR 业务边界复用语义标签并保留成功与警告层级', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/hr-boundary-tag.html')
  const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.evaluate((mode) => {
    document.documentElement.dataset.boxMode = mode
  }, boxMode)
  await expect(page.locator('html')).toHaveAttribute('data-box-mode', boxMode)

  for (const label of ['不直接改主数据', '不占正式员工编制']) {
    await expect(page.locator('.el-tag--success').filter({ hasText: label })).toBeVisible()
  }
  for (const label of ['敏感字段独立授权', '缴费金额服务端隐藏']) {
    await expect(page.locator('.el-tag--warning').filter({ hasText: label })).toBeVisible()
  }
  for (const content of await page.locator('.el-tag__content').all()) {
    expect(
      await content.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          alignItems: style.alignItems,
          display: style.display,
          hasOverflow: element.scrollWidth > element.clientWidth + 1
        }
      })
    ).toEqual({ alignItems: 'center', display: 'flex', hasOverflow: false })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('boundary-tags.png'),
    animations: 'disabled',
    fullPage: true
  })
})
