import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const mode of ['customer', 'route', 'work-order']) {
  test(`${mode} 中文表头通过公共表格映射为业务字段`, async ({ page }, info) => {
    const writes: Record<string, unknown>[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const targetTable =
      mode === 'customer'
        ? 'mdm_customer'
        : mode === 'route'
          ? 'mdm_process_route'
          : 'mes_work_order'
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const isWrite =
        request.method() === 'POST' && new URL(request.url()).pathname.endsWith(`/${targetTable}`)
      if (isWrite) writes.push(...request.postDataJSON())
      await route.fulfill({
        json: isWrite ? [{ id: 'imported-row' }] : [],
        headers: {
          'content-range': isWrite ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/business-import-records.html?mode=${mode}`)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('业务导入')
    if (mode === 'customer') {
      sheet.addRow(['客户编号', '客户名称', '启用状态'])
      sheet.addRow(['C-001', '测试映射客户', '启用'])
    } else if (mode === 'route') {
      sheet.addRow(['产品物料ID', '路线名称', '工艺版本', '批量从', '批量至'])
      sheet.addRow(['material-test', '测试映射路线', 'V1', 1, 10])
    } else {
      sheet.addRow(['产品物料ID', '工单数量', '计划结束日期', '销售订单号'])
      sheet.addRow(['material-test', 5, '2026-10-09', 'SO-001'])
    }
    await page.locator('input[type="file"]').setInputFiles({
      name: '业务导入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    })
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].tenant_id).toBe('11111111-1111-4111-8111-111111111111')
    if (mode === 'customer')
      expect(writes[0]).toMatchObject({
        customer_code: 'C-001',
        customer_name: '测试映射客户',
        enabled: true
      })
    else if (mode === 'route')
      expect(writes[0]).toMatchObject({
        material_id: 'material-test',
        name: '测试映射路线',
        version: 'V1',
        batch_from: 1,
        batch_to: 10
      })
    else
      expect(writes[0]).toMatchObject({
        material_id: 'material-test',
        order_quantity: 5,
        planned_end_date: '2026-10-09',
        sales_order_no: 'SO-001'
      })
    expect(Object.keys(writes[0]).some((key) => /[\u3400-\u9fff]/.test(key))).toBe(false)
    await page.screenshot({ path: info.outputPath('business-import-success.png') })
    expect(errors).toEqual([])
  })
}
