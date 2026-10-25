import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

for (const kind of ['estimate', 'financial', 'receipt', 'refund', 'revenue', 'payment_request']) {
  test(`${kind} 关联入口导出保留单据范围并验证实际文件`, async ({ page }, info) => {
    const exportQueries: Array<Record<string, unknown>> = []
    let fail = true
    let downloads = 0
    page.on('download', () => downloads++)
    const records = [1, 2].map((index) => ({
      id: `document-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      kind,
      document_no: `QA-AR-EXPORT-${index}`,
      documentNo: `QA-AR-EXPORT-${index}`,
      business_date: '2026-10-24',
      businessDate: '2026-10-24',
      status: 'draft',
      currency_code: 'CNY',
      customer_name: '隔离导出客户',
      customerName: '隔离导出客户',
      amount: index * 100,
      total_amount: index * 100,
      lines: []
    }))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_receivable_workspace_secure') {
        const query = body.p_query
        if (Number(query.size) > 200) {
          exportQueries.push(query)
          if (fail)
            return route.fulfill({
              status: 400,
              json: { code: 'P0001', message: '导出资料暂不可用，请重试' }
            })
        }
        const rows = records.filter((row) => !query.id || row.id === query.id)
        return route.fulfill({ json: { records: rows, total: rows.length } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&recordId=document-1`
    )
    await expect(page.getByText('QA-AR-EXPORT-1', { exact: true })).toBeVisible()
    await expect(page.getByText('QA-AR-EXPORT-2', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '导出', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    expect(downloads).toBe(0)
    fail = false
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const download = await downloadEvent
    const file = info.outputPath(`${kind}-scoped.xlsx`)
    await download.saveAs(file)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    const rows: string[] = []
    workbook.worksheets[0].eachRow((row) => rows.push(JSON.stringify(row.values)))
    expect(rows.join('\n')).toContain('QA-AR-EXPORT-1')
    expect(rows.join('\n')).not.toContain('QA-AR-EXPORT-2')
    expect(exportQueries).toHaveLength(2)
    for (const query of exportQueries) expect(query.id).toBe('document-1')
    expect(downloads).toBe(1)
  })
}
