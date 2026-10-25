import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const kind of ['receipt', 'refund', 'revenue', 'payment_request']) {
  test(`${kind} 两张单据打印前重读，缺失或失败时停止打印`, async ({ page }, info) => {
    let mode = 'missing'
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const records = [1, 2].map((index) => ({
      id: `ar-print-${index}`,
      document_no: `QA-AR-PRINT-${index}`,
      status: 'draft',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      customer_name: `验收客户${index}`,
      organization_name: '验收组织',
      business_date: '2026-10-24',
      currency_code: 'CNY',
      amount: index * 100,
      revenue_amount: index * 100,
      cost_amount: index * 50,
      source_no: `QA-SOURCE-${index}`,
      lines: [
        {
          line_no: 10,
          description: `验收服务${index}`,
          source_no: `QA-SOURCE-${index}`,
          revenue_amount: index * 100,
          cost_amount: index * 50,
          amount: index * 100
        }
      ]
    }))
    await page.route('**/rest/v1/**', (route) => {
      const resource = new URL(route.request().url()).pathname.split('/').at(-1)
      if (resource !== 'fms_receivable_workspace_secure') return route.fulfill({ json: [] })
      const ids = route.request().postDataJSON().p_query?.ids
      if (ids && mode === 'error')
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '单据资料暂不可用，请重试' }
        })
      const rows = ids && mode === 'missing' ? records.slice(0, 1) : records
      return route.fulfill({ json: { records: rows, total: rows.length } })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}`)
    if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByText('QA-AR-PRINT-2', { exact: true })).toBeVisible()
    await page.evaluate(() => {
      window.print = () => {
        document.body.dataset.arPrinted = 'true'
      }
    })
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(page.locator('.el-message--error')).toContainText(/重新查询|重试/)
    await expect(page.locator('body')).not.toHaveAttribute('data-ar-printed', 'true')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    mode = 'error'
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(page.locator('body')).not.toHaveAttribute('data-ar-printed', 'true')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    mode = 'ready'
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-ar-printed', 'true')
    await page.emulateMedia({ media: 'print' })
    const sheets = page.locator('.ar-print-sheet')
    await expect(sheets).toHaveCount(2)
    for (const index of [1, 2]) {
      await expect(sheets.nth(index - 1)).toContainText(`QA-AR-PRINT-${index}`)
      await expect(sheets.nth(index - 1)).toContainText(`验收客户${index}`)
      await expect(sheets.nth(index - 1)).not.toContainText(`QA-AR-PRINT-${3 - index}`)
    }
    await page.screenshot({ path: info.outputPath(`${kind}-print.png`), fullPage: true })
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await page.emulateMedia({ media: 'screen' })
    await expect(sheets).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
