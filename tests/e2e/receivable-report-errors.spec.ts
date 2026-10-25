import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('应收报表导出失败恢复和数据完整性保护', async ({ page }, info) => {
  let mode: 'normal' | 'fail' | 'overflow' | 'incomplete' | 'hold' = 'normal'
  let release = () => {}
  let exportStarted = 0
  let exportFinished = 0
  let downloads = 0
  page.on('download', () => downloads++)
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'fms_ar_report_secure') {
      const isExport = body.p_query.size === 10000
      const responseMode = mode
      if (isExport) {
        exportStarted++
        if (responseMode === 'hold')
          await new Promise<void>((resolve) => {
            release = resolve
          })
        if (responseMode === 'fail') {
          exportFinished++
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '应收导出暂不可用，请重试' }
          })
        }
      }
      const records = [1, 2].map((i) => ({
        id: `ar-${i}`,
        documentNo: `QA-AR-${i}`,
        customerName: `验收应收客户${i}`,
        kind: 'financial',
        currencyCode: 'CNY',
        occurrenceAmount: i * 100,
        balanceAmount: i * 80
      }))
      await route.fulfill({
        json: {
          records,
          total:
            isExport && responseMode === 'overflow'
              ? 10001
              : isExport && responseMode === 'incomplete'
                ? 3
                : 2
        }
      })
      if (isExport) exportFinished++
      return
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=report&arNavigation=1&theme=${theme}&permissions=FinanceReceivableReport:View,FinanceReceivableReport:Export`
  )
  await expect(page.getByText('QA-AR-1', { exact: true })).toBeVisible({ timeout: 60000 })
  const exportButton = page.getByRole('button', { name: '导出', exact: true })
  for (const [nextMode, message] of [
    ['fail', '应收导出暂不可用，请重试'],
    ['overflow', '导出记录超过一万条，请缩小筛选范围后重试'],
    ['incomplete', '报表数据不完整，请重新查询后导出']
  ] as const) {
    mode = nextMode
    await exportButton.click()
    await expect(page.getByText(message, { exact: true })).toBeVisible()
    await expect(exportButton).toBeEnabled()
    expect(downloads).toBe(0)
  }
  mode = 'normal'
  const download = page.waitForEvent('download')
  await exportButton.click()
  await (await download).saveAs(info.outputPath('receivable-retry.xlsx'))
  expect(downloads).toBe(1)
  mode = 'hold'
  const before = exportStarted
  await exportButton.click()
  await expect.poll(() => exportStarted).toBe(before + 1)
  const read = page.waitForResponse(
    (response) =>
      response.url().endsWith('/fms_ar_report_secure') &&
      response.request().postDataJSON().p_query.size !== 10000
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await read
  release()
  await expect(page.getByText('查询范围已变化，请重新查询后导出', { exact: true })).toBeVisible()
  await expect(exportButton).toBeEnabled()
  expect(downloads).toBe(1)
  const beforeLeave = exportStarted
  await exportButton.click()
  await expect.poll(() => exportStarted).toBe(beforeLeave + 1)
  await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
  await expect(page.getByRole('heading', { name: '其他业务页面', exact: true })).toBeVisible()
  release()
  await expect.poll(() => exportFinished).toBe(exportStarted)
  await expect(page.locator('.el-message')).toHaveCount(0)
  expect(downloads).toBe(1)
})
