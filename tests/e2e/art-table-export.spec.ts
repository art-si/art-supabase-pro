import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

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
