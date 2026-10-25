import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('演练报表导出保留字典标签、名称和历史值回退', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    await route.fulfill({
      json: path.endsWith('/sys_dictionary')
        ? [
            { value: 'known', label: '已配置标签', name: '不得显示备用名', sort: 0 },
            { value: 'blank', label: '', name: '空标签名称', sort: 1 }
          ]
        : path.endsWith('/smis_emergency_drill_report_secure')
          ? {
              overview: {
                planCount: 4,
                completedCount: 0,
                outstandingCount: 1,
                warningCount: 0,
                lateCount: 0
              },
              rows: ['known', 'blank', 'legacy', null].map((planCategory, index) => ({
                organizationId: `org-${index}`,
                organizationName: ['测试组织 1', '测试组织 1', '测试组织 3', ''][index],
                planCategory,
                planLevel: 'legacy-level',
                planCount: 1,
                completedCount: 0,
                sprintRate: 0,
                drillCount: index + 1,
                lateCount: 0,
                averageIntervalDays: null
              })),
              outstanding: [
                {
                  id: 'plan-test',
                  planNo: 'PLAN-001',
                  drillName: '测试演练',
                  organizationName: '测试组织',
                  planCategory: 'blank',
                  planLevel: 'known',
                  warningStatus: ''
                }
              ]
            }
          : []
    })
  })
  await page.goto('/tests/e2e/fixtures/smis-drill-report.html')
  const exportButton = page.getByRole('button', { name: '导出 Excel', exact: true })
  await expect(exportButton).toBeEnabled({ timeout: 60_000 })
  await expect(page.getByText('空标签名称', { exact: true }).first()).toBeVisible()
  await expect(
    page
      .locator('.drill-report-page__analysis-item')
      .filter({ hasText: '实际演练' })
      .locator('strong')
  ).toHaveText('10')
  await expect(
    page
      .locator('.drill-report-page__analysis-item')
      .filter({ hasText: '覆盖组织' })
      .locator('strong')
  ).toHaveText('2')
  const planNumber = page.getByText('PLAN-001', { exact: true })
  await expect(planNumber).toBeVisible()
  expect(
    await planNumber.evaluate((element) => {
      const body = element.closest('.el-table__body-wrapper')
      if (!body) throw new Error('未找到计划表滚动区域')
      return element.getBoundingClientRect().bottom - body.getBoundingClientRect().bottom
    })
  ).toBeLessThanOrEqual(1)
  const downloadPromise = page.waitForEvent('download')
  await exportButton.click()
  const download = await downloadPromise
  const file = info.outputPath('dictionary-report.xlsx')
  await download.saveAs(file)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const worksheet = workbook.worksheets[0]
  const values: unknown[] = []
  worksheet.eachRow((row) => row.eachCell((cell) => values.push(cell.value)))
  expect(values).toContain('已配置标签')
  expect(values).toContain('空标签名称')
  expect(values).toContain('legacy')
  expect(values).toContain('legacy-level')
  expect(values).toContain('—')
  expect(values).not.toContain('不得显示备用名')
  expect(worksheet.rowCount).toBe(7)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('dictionary-report.png'), fullPage: true })
  expect(errors).toEqual([])
})
