import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('隐患详情复用日期格式，保留分钟精度且异常与缺失日期不伪造今天', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/date-format-reuse.html', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '打开日期验收', exact: true }).click()
  const drawer = page.getByRole('dialog')
  const value = (label: string) =>
    drawer
      .locator('dl > div')
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator('dd')
  await expect(value('上报时间')).toHaveText('2026-10-08 08:30')
  await expect(value('核准时间')).toHaveText('—')
  await expect(value('整改时限')).toHaveText('—')
  await expect(value('完成时间')).toHaveText('—')
  await expect(value('验收时间')).toHaveText('2026-10-08 10:45')
  await expect(value('关闭时间')).toHaveText('—')
  await page.screenshot({ path: info.outputPath('date-initial.png'), animations: 'disabled' })
  await drawer.getByText('测试流转日期', { exact: true }).scrollIntoViewIfNeeded()
  await expect(drawer.locator('.el-timeline-item__timestamp')).toHaveText('—')
  await expect(drawer.getByText('Invalid Date', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('date-lower.png'), animations: 'disabled' })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    )
  ).toBe(true)
  expect(errors).toEqual([])
})
