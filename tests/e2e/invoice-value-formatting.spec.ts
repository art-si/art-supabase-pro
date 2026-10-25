import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const amounts of [true, false]) {
  test(`发票数值直接复用公共格式化 amounts=${amounts}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/rpc/tms_get_invoice_secure'))
        return route.fulfill({
          json: {
            id: 'invoice-format-test',
            invoiceRecordNo: 'FORMAT-001',
            counterpartyNameSnapshot: '测试往来单位',
            issueDate: '2026-10-09',
            status: 'draft',
            direction: 'output',
            invoiceType: 'electronic',
            amountExcludingTax: 12345.678,
            taxRate: 1.23456,
            taxAmount: '***',
            totalAmount: null,
            linkedAmount: 0,
            unlinkedAmount: 'invalid',
            attachments: [],
            fieldAccess: { invoiceAmounts: amounts ? 'read' : 'hidden' }
          }
        })
      if (path.endsWith('/rpc/tms_list_invoice_statement_links_secure'))
        return route.fulfill({
          json: amounts
            ? [
                {
                  id: 'link-test',
                  statementNo: 'ST-001',
                  counterpartyName: '测试往来单位',
                  periodStart: '2026-10-01',
                  periodEnd: '2026-10-09',
                  statementAmount: '***',
                  linkedAmount: 0
                }
              ]
            : []
        })
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/invoice-value-formatting.html')
    await page.getByRole('button', { name: '打开格式化发票' }).click({ timeout: 120_000 })
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('测试往来单位', { exact: true }).first()).toBeVisible()
    if (amounts) {
      for (const [label, value] of [
        ['不含税金额', '¥12,345.68'],
        ['税率', '1.23%'],
        ['税额', '***'],
        ['价税合计', '--'],
        ['已关联金额', '¥0.00'],
        ['未关联金额', '--']
      ])
        await expect(
          drawer
            .getByRole('cell', { name: label, exact: true })
            .locator('xpath=following-sibling::td[1]')
        ).toHaveText(value)
      await expect(drawer.locator('.art-table')).toContainText('***')
      await expect(drawer.locator('.art-table')).toContainText('¥0.00')
    } else {
      await expect(drawer.getByRole('cell', { name: '税率', exact: true })).toHaveCount(0)
      await expect(drawer).not.toContainText('12,345.68')
    }
    await drawer.screenshot({ path: info.outputPath('invoice-values.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
