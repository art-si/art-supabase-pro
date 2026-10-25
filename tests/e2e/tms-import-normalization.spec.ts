import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const mode of ['cargo', 'station']) {
  test(`${mode} 导入复用公共启停和数值规则`, async ({ page }, info) => {
    const errors: string[] = []
    const writes: Record<string, unknown>[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith('/rpc/import_tms_stations')) {
        writes.push(...request.postDataJSON().p_rows)
        await route.fulfill({ json: { success: true } })
      } else if (path.endsWith('/mdm_cargo') && request.method() === 'POST') {
        writes.push(...request.postDataJSON())
        await route.fulfill({ json: [] })
      } else {
        await route.fulfill({
          json: path.endsWith('/mdm_material')
            ? [
                {
                  id: 'material-test',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  material_code: 'MAT-001',
                  material_name: '导入测试物料',
                  basic_unit: '件'
                }
              ]
            : [],
          headers: {
            'content-range': path.endsWith('/mdm_material') ? '0-0/1' : '*/0',
            'access-control-expose-headers': 'content-range'
          }
        })
      }
    })
    await page.goto(`/tests/e2e/fixtures/tms-import-normalization.html?mode=${mode}`)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('导入')
    sheet.addRow(
      mode === 'cargo' ? ['物料编码', '长(m)', '宽(m)', '状态'] : ['站名称', '类型', '状态']
    )
    for (const state of ['停用', '否', 'false', '启用', '']) {
      sheet.addRow(mode === 'cargo' ? ['MAT-001', '  ', 0, state] : ['测试站点', '发货站', state])
    }
    await page.locator('input[type="file"]').setInputFiles({
      name: '导入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    })
    await expect.poll(() => writes.length).toBe(5)
    expect(writes.map((row) => row.enabled)).toEqual([false, false, false, true, true])
    expect(writes.every((row) => row.tenant_id === '11111111-1111-4111-8111-111111111111')).toBe(
      true
    )
    if (mode === 'cargo') {
      expect(writes.every((row) => row.length_m === null && row.width_m === 0)).toBe(true)
    }
    await expect(page.getByText('导入成功', { exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('import-success.png') })
    expect(errors).toEqual([])
  })
}
