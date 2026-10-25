import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test('映射后转换遇到缺少必填字段时阻止整批提交并恢复按钮', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/art-table-import.html?mode=records-invalid')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('导入')
  sheet.addRow(['名称', '备注'])
  sheet.addRow(['东区分拨站', '完整行'])
  sheet.addRow(['', '缺少名称'])
  await page.locator('input[type="file"]').setInputFiles({
    name: '导入.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer())
  })
  await expect(
    page.getByText('导入文件有 1 行缺少必填字段，请补全后重新导入', { exact: true })
  ).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-received-rows', '0')
  await expect(page.getByRole('button', { name: '导入测试数据' })).toBeEnabled()
})
for (const mode of ['records', 'raw', 'success']) {
  test(`公共表格导入 ${mode} 保持明确的表头映射契约`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/art-table-import.html?mode=${mode}`)
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('导入')
    sheet.addRow(['名称'])
    sheet.addRow(['东区分拨站'])
    await page.locator('input[type="file"]').setInputFiles({
      name: '导入.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    })
    const record =
      mode === 'success'
        ? { name: '东区分拨站' }
        : { name: '东区分拨站', remark: mode === 'records' ? 'mapped' : 'raw' }
    await expect(page.locator('body')).toHaveAttribute(
      'data-received-records',
      JSON.stringify([record])
    )
    await expect(page.locator('body')).toHaveAttribute('data-import-status', 'success')
    await expect(page.getByRole('button', { name: '导入测试数据' })).toBeEnabled()
  })
}
