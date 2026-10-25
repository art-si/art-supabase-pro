import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180000)

const makeRecords = (kind: string) =>
  [1, 2].map((index) => ({
    id: `document-${index}`,
    record_key: `document-${index}`,
    tenant_id: '11111111-1111-4111-8111-111111111111',
    kind,
    document_no: `QA-${kind}-${index}`,
    document_type_name: '示例采购业务',
    status: 'draft',
    source_type: 'manual',
    business_date: '2026-10-22',
    supplier_name: '<em>示例供应商</em>',
    counterparty_name: '<em>示例供应商</em>',
    currency_code: 'CNY',
    base_currency_code: 'CNY',
    exchange_rate: 1,
    amount: index * 100,
    tax_amount: 0,
    total_amount: index * 100,
    payment_status: 'none',
    frozen: false,
    reason: '',
    remark: '',
    version: 1,
    details: {},
    lines: [
      {
        id: `line-${index}`,
        line_no: 10,
        source_line_id: null,
        material_id: 'material',
        material_code: 'QA-MAT',
        material_description: '<em>示例物料</em>',
        inventory_unit_id: 'unit',
        unit_name: '件',
        quantity: 1,
        unit_price: index * 100,
        amount: index * 100,
        tax_amount: 0,
        total_amount: index * 100,
        supplier_name: '<em>示例供应商</em>',
        approved_amount: index * 100,
        planned_amount: index * 100,
        cash_discount: 0,
        tax_rate: 0,
        purpose_name: '采购付款',
        details: {}
      }
    ]
  }))

for (const kind of ['estimated', 'financial', 'application', 'payment', 'refund'] as const) {
  test(`${kind} 关联单据入口导出只包含当前单据`, async ({ page }, info) => {
    const records = makeRecords(kind)
    let exportId: string | undefined
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body: { p_id?: string; p_limit?: number; p_query?: { id?: string; size?: number } } =
        route.request().postDataJSON() || {}
      if (
        name === 'fms_purchase_payable_list_secure' ||
        name === 'fms_payable_settlement_list_secure'
      ) {
        const id = body.p_id || body.p_query?.id
        if ((body.p_limit || body.p_query?.size || 0) > 200) exportId = id
        const data = records.filter((record) => !id || record.id === id)
        return route.fulfill({ json: { data, total: data.length } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&recordId=document-1`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    })
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(1)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const download = await downloadPromise
    expect(exportId).toBe('document-1')
    const path = info.outputPath(`${kind}-scoped-export.xlsx`)
    await download.saveAs(path)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path)
    const cells: string[] = []
    workbook.worksheets[0].eachRow((row) => row.eachCell((cell) => cells.push(cell.text)))
    expect(cells).toContain(records[0].document_no)
    expect(cells).not.toContain(records[1].document_no)
  })

  test(`${kind} 两条选中单据打印内容转义并隔离窗口`, async ({ page, context }, info) => {
    const records = makeRecords(kind)
    await context.addInitScript(() => {
      window.print = () => undefined
    })
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body: { p_id?: string; p_query?: { id?: string } } =
        route.request().postDataJSON() || {}
      if (
        name === 'fms_purchase_payable_list_secure' ||
        name === 'fms_payable_settlement_list_secure'
      ) {
        const id = body.p_id || body.p_query?.id
        const data = records.filter((record) => !id || record.id === id)
        return route.fulfill({ json: { data, total: data.length } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    })
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    for (const index of [0, 1]) await rows.nth(index).locator('.el-checkbox').first().click()
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', { name: '打印', exact: true }).click()
    const popup = await popupPromise
    await expect(popup.locator('body')).toContainText(records[0].document_no)
    await expect(popup.locator('body')).toContainText(records[1].document_no)
    await expect(popup.locator('body')).toContainText('<em>示例供应商</em>')
    await expect(popup.locator('em')).toHaveCount(0)
    expect(await popup.evaluate(() => window.opener === null)).toBe(true)
    await captureBusinessEvidence(popup, {
      path: info.outputPath(`${kind}-two-record-print.png`),
      fullPage: true
    })
    await popup.close()
    await expect(rows).toHaveCount(2)
  })
}
