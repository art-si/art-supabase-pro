import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
test.setTimeout(90_000)
for (const mode of [
  'valid',
  'invalid-date',
  'time-only',
  'invalid-mileage',
  'negative-mileage',
  'blank-signer',
  'missing-photo'
]) {
  test('司机归档依据真实有效记录 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route('**/archive-test.png', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0XcAAAAASUVORK5CYII=',
          'base64'
        )
      })
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      '/tests/e2e/fixtures/tms-waybill-date-reuse.html?measurements=zero&archive=' + mode
    )
    const panel = page.locator('.waybill-operation-panel')
    const complete = panel.getByText('发车、签收、回场与里程字段均已归档', { exact: true })
    if (mode === 'valid') {
      await expect(complete).toBeVisible()
      await expect(panel.locator('.waybill-operation-panel__archive-alert')).toHaveCount(0)
      await expect(
        panel.getByText('发车里程', { exact: true }).locator('..').locator('dd')
      ).toHaveText('0 km')
    } else {
      await expect(complete).toHaveCount(0)
      await expect(panel.locator('.waybill-operation-panel__archive-alert')).toContainText(
        '档案缺失或存在无效数据'
      )
      await expect(
        panel.getByText('发车、签收或回场档案缺失或存在无效数据，请核对并补齐', { exact: true })
      ).toBeVisible()
    }
    await expect(panel.locator('.waybill-operation-panel__stage-content .el-tag')).toHaveText(
      Array(3).fill(mode === 'invalid-date' || mode === 'time-only' ? '待补录' : '已记录')
    )
    await expect(panel).not.toContainText('签到与称重信息已归档')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    if (mode === 'invalid-date') {
      await panel.locator('.waybill-operation-panel__archive-alert').scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('archive-alert.png') })
    }
    await panel.locator('.waybill-operation-panel__execution-grid').scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('archive-evidence.png') })
  })
}
