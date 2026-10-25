import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('窄屏筛选上下文统一图文、截断和操作反馈', async ({ page }, testInfo) => {
  const dark = testInfo.project.name.includes('dark')
  const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.addInitScript(
    ({ dark, boxMode }) => {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = boxMode
        },
        { once: true }
      )
    },
    { dark, boxMode }
  )
  await page.goto('/tests/e2e/fixtures/mobile-filter-context.html')

  const context = page.getByLabel('当前组织范围')
  await expect(context).toContainText('华东运营中心 · 上海仓储与运输协同组织')
  await expect(context.locator('strong')).toHaveAttribute(
    'title',
    '华东运营中心 · 上海仓储与运输协同组织'
  )
  const action = context.getByRole('button', { name: '组织筛选', exact: true })
  await action.click()
  await expect(page.getByLabel('操作次数')).toHaveText('1')
  expect(await context.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('mobile-filter-context.png'),
    animations: 'disabled',
    fullPage: true
  })
})
