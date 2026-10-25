import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.setTimeout(90_000)
for (const mode of ['zero', 'missing', 'invalid', 'precise']) {
  test('作业单位共享显示 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?measurements=' + mode)
    const panel = page.locator('.waybill-operation-panel')
    const number = mode === 'zero' ? '0' : mode === 'precise' ? '1234.56789' : null
    for (const [label, unit] of [
      ['作业净重', 't'],
      ['定位精度', 'm'],
      ['发车里程', 'km'],
      ['回场里程', 'km']
    ]) {
      await expect(panel.getByText(label, { exact: true }).locator('..').locator('dd')).toHaveText(
        number === null ? '-' : number + ' ' + unit
      )
    }
    await expect(
      panel.getByText('围栏距离', { exact: true }).locator('..').locator('dd')
    ).toHaveText('0 m')
    await expect(panel).not.toContainText('NaN')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await panel.getByText('发车里程', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('measurement.png') })
  })
}
