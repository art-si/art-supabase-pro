import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

for (const kind of ['estimated', 'financial', 'application', 'payment', 'refund']) {
  test(`${kind} 打印受阻单条提示、两张单据内容及读取失败恢复`, async ({ page, context }, info) => {
    let failRead = false
    const reads: string[] = []
    const records = [1, 2].map((index) => ({
      id: `print-${index}`,
      record_key: `print-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: `QA-PAYABLE-PRINT-${index}`,
      kind: kind === 'estimated' ? 'estimate' : kind,
      status: 'draft',
      business_date: '2026-10-24',
      currency_code: 'CNY',
      exchange_rate: 1,
      amount: index * 100,
      total_amount: index * 100,
      tax_amount: 0,
      supplier_name: `验收供应商${index}`,
      reason: `打印事由${index}`,
      lines: [
        {
          id: `line-${index}`,
          line_no: 10,
          supplier_name: `验收供应商${index}`,
          payee_supplier_name: `收款方${index}`,
          source_document_no: `QA-SOURCE-${index}`,
          material_description: `验收物料${index}`,
          quantity: index,
          amount: index * 100,
          total_amount: index * 100,
          tax_amount: 0
        }
      ]
    }))
    await context.addInitScript(() => {
      window.print = () => {
        document.documentElement.dataset.printInvoked = 'true'
      }
      const original = window.open.bind(window)
      window.open = (...args) =>
        document.documentElement.dataset.blockPrint === 'true' ? null : original(...args)
    })
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (
        name === 'fms_purchase_payable_list_secure' ||
        name === 'fms_payable_settlement_list_secure'
      ) {
        const id = body.p_id || body.p_query?.id
        if (id) {
          reads.push(id)
          if (failRead)
            return route.fulfill({
              status: 400,
              json: { code: 'P0001', message: '打印资料加载失败，请重试' }
            })
        }
        const rows = id ? records.filter((row) => row.id === id) : records
        return route.fulfill({ json: { data: rows, total: rows.length } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}`)
    await expect(page.getByText('QA-PAYABLE-PRINT-2', { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.evaluate(() => {
      document.documentElement.dataset.blockPrint = 'true'
    })
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await expect(page.locator('.el-message--warning')).toHaveCount(1)
    await expect(page.locator('.el-message--warning')).toContainText('浏览器阻止了打印窗口')
    expect(reads).toEqual(['print-1', 'print-2'])
    await expect(page.locator('.el-message')).toHaveCount(0)
    failRead = true
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    expect(context.pages()).toHaveLength(1)
    await expect(page.locator('.el-message')).toHaveCount(0)
    failRead = false
    await page.evaluate(() => {
      document.documentElement.dataset.blockPrint = 'false'
    })
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const popup = await popupPromise
    await expect(popup.locator('html')).toHaveAttribute('data-print-invoked', 'true')
    await expect(popup.locator('section')).toHaveCount(2)
    for (const index of [1, 2]) {
      const sheet = popup.locator('section').nth(index - 1)
      await expect(sheet).toContainText(`QA-PAYABLE-PRINT-${index}`)
      await expect(sheet).not.toContainText(`QA-PAYABLE-PRINT-${index === 1 ? 2 : 1}`)
      await expect(sheet).toContainText(
        kind === 'estimated' || kind === 'financial' ? `验收物料${index}` : `QA-SOURCE-${index}`
      )
    }
    expect(await popup.evaluate(() => window.opener === null)).toBe(true)
    await popup.screenshot({ path: info.outputPath(`${kind}-print.png`), fullPage: true })
    await popup.close()
    await expect(page.getByText('QA-PAYABLE-PRINT-2', { exact: true })).toBeVisible()
  })
}
