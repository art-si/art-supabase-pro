import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.setTimeout(90_000)
for (const mode of ['valid', 'empty', 'invalid', 'time-only']) {
  test('运单详情日期共享规则 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?mode=' + mode)
    const expected = mode === 'valid' ? '2026-10-09 12:34' : '-'
    await expect(
      page.locator('.waybill-info-panel').getByText('计划装货', { exact: true }).locator('..')
    ).toContainText(expected)
    await expect(
      page.locator('.waybill-document-panel').getByText('归档时间', { exact: true }).locator('..')
    ).toContainText(expected)
    const operation = page.locator('.waybill-operation-panel')
    if (mode === 'valid') await expect(operation).toContainText(expected)
    else {
      await expect(operation).not.toContainText('invalid-date')
      await expect(operation).not.toContainText('12:34')
      await expect(operation).not.toContainText('流程已完成')
      await expect(operation).not.toContainText('完成业务节点')
      await expect(operation).not.toContainText('流程节点存在')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('waybill-dates.png'), fullPage: true })
  })
}
