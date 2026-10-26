import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('默认导出读取字典名称、历史停用值、动态值和嵌套字段，保留零与否', async ({ page }) => {
  await page.route('**/rest/v1/sys_dictionary?**', (route) => {
    const parameters = new URL(route.request().url()).searchParams
    const code = parameters.get('dict_type_table.code')?.replace(/^eq\./, '') || ''
    const value = parameters.get('value')?.replace(/^eq\./, '')
    const item =
      code === 'qaExportState'
        ? value === 'retired'
          ? { value: 'retired', label: '历史停用', status: '0' }
          : { value: 'approved', label: '已审核', status: '1' }
        : code === 'qaExportKind'
          ? { value: 'financial', label: '', name: '财务应付', status: '1' }
          : { value: 'false', label: '否', status: '1' }
    return route.fulfill({
      json: [
        {
          id: `${code}-${item.value}`,
          type_id: code,
          code: item.value,
          sort: 1,
          ...item,
          dict_type_table: { code, name: code }
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/art-table-export.html?mode=dictionary')
  await expect(page.getByText('测试记录-0', { exact: true })).toBeVisible()
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const path = await (await pending).path()
  if (!path) throw new Error('字典导出未生成文件')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const worksheet = workbook.worksheets[0]
  expect(worksheet.rowCount).toBe(3)
  expect(worksheet.getCell('B2').value).toBe('已审核')
  expect(worksheet.getCell('B3').value).toBe('历史停用')
  expect(worksheet.getCell('C2').value).toBe('财务应付')
  expect(worksheet.getCell('D2').value).toBe('否')
  expect(worksheet.getCell('E2').value).toBe('0')
})

for (const mode of ['complete', 'incomplete', 'over-limit']) {
  test(`共享表格默认分页导出 ${mode}`, async ({ page }) => {
    const errors: string[] = []
    const downloads: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.goto(`/tests/e2e/fixtures/art-table-export.html?mode=${mode}`)
    await expect(page.getByText('测试记录-0', { exact: true })).toBeVisible()
    const button = page.getByRole('button', { name: '导出', exact: true })
    if (mode !== 'complete') {
      await button.click()
      await expect(
        page.getByText(
          mode === 'incomplete'
            ? '数据未完整加载，请刷新后重试'
            : '导出数据不能超过 10000 行，请缩小筛选范围后重试',
          { exact: true }
        )
      ).toBeVisible()
      await expect(button).toBeEnabled()
      expect(downloads).toEqual([])
      await expect(page.locator('body')).toHaveAttribute(
        'data-requests',
        mode === 'incomplete' ? '[1,2]' : '[1]'
      )
      await page.screenshot({ path: test.info().outputPath('export-error.png'), fullPage: true })
      if (mode === 'over-limit') return
    }
    const pending = page.waitForEvent('download')
    await button.click()
    const path = await (await pending).path()
    if (!path) throw new Error('导出未生成文件')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path)
    expect(workbook.worksheets[0].rowCount).toBe(1002)
    expect(workbook.worksheets[0].getRow(1002).getCell(1).value).toBe('测试记录-1000')
    await expect(button).toBeEnabled()
    expect(errors).toEqual([])
    await page.screenshot({ path: test.info().outputPath('export-complete.png'), fullPage: true })
  })
}
