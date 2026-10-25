import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(90_000)
for (const mode of [
  'valid',
  'zero',
  'missing',
  'absent',
  'blank',
  'invalid',
  'masked',
  'hidden',
  'overflow',
  'empty'
]) {
  test('费用合计保留真实零并区分不可用金额 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?fees=' + mode)
    const panel = page.locator('.waybill-fee-panel')
    if (mode === 'empty') {
      await expect(panel).toContainText('当前运单暂无费用上报')
      await expect(panel.locator('.waybill-fee-panel__cost-summary')).toHaveCount(0)
    } else {
      const total = panel.getByText('申报金额合计', { exact: true }).locator('..').locator('strong')
      const protectedAmount = mode === 'masked' || mode === 'hidden'
      await expect(total).toHaveText(
        mode === 'valid' ? '¥1,234.50' : mode === 'zero' ? '¥0.00' : protectedAmount ? '***' : '--'
      )
      const summary = panel.locator('.waybill-fee-panel__cost-summary')
      if (protectedAmount) await expect(summary).toContainText('部分费用金额受字段权限保护')
      else if (mode !== 'valid' && mode !== 'zero') {
        await expect(summary).toContainText('部分费用金额缺失或无效')
        await expect(summary).not.toContainText('权限保护')
      }
      const first = panel.locator('.waybill-fee-panel__cost').first()
      await expect(first.locator('.waybill-fee-panel__cost-status > strong')).toHaveText(
        mode === 'overflow' ? /¥/ : '¥0.00'
      )
      await expect(
        first.getByText('数量 / 用量', { exact: true }).locator('..').locator('dd')
      ).toHaveText('0')
      await expect(first.getByText('单价', { exact: true }).locator('..').locator('dd')).toHaveText(
        '¥0.00'
      )
      if (mode === 'hidden') {
        await expect(
          panel
            .locator('.waybill-fee-panel__cost')
            .last()
            .locator('.waybill-fee-panel__cost-status > strong')
        ).toHaveCount(0)
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    if (['valid', 'missing', 'masked', 'empty', 'overflow'].includes(mode)) {
      await page.screenshot({ path: info.outputPath('fees.png'), fullPage: true })
    }
  })
}

for (const mode of ['valid', 'empty', 'invalid', 'time-only']) {
  test('费用日期复用公共规则并排除无效归档时间 ' + mode, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?fees=valid&mode=' + mode)
    const cost = page.locator('.waybill-fee-panel__cost').first()
    await expect(cost.locator('.waybill-fee-panel__cost-identity p')).toHaveText(
      '日期费用验收-0 · ' + (mode === 'valid' ? '2026-10-09' : '--')
    )
    for (const label of ['提交时间', '审核时间', '付款时间']) {
      const field = cost.getByText(label, { exact: true })
      if (mode === 'valid') {
        await expect(field.locator('..').locator('dd')).toHaveText('2026-10-09 12:34')
      } else await expect(field).toHaveCount(0)
    }
    await expect(cost).not.toContainText('invalid-date')
    await expect(cost).not.toContainText('Invalid Date')
  })
}
