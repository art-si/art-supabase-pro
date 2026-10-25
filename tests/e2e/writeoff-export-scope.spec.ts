import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)
const tenant = '11111111-1111-4111-8111-111111111111'

test('核销记录导出保留来源与租户范围且等待期间撤权不下载', async ({ page }, info) => {
  const records = [1, 2, 3].map((index) => ({
    id: `history-${index}`,
    document_no: `QA-WRITEOFF-EXPORT-${index}`,
    source_id: index === 3 ? 'other-source' : 'source-1',
    business_date: '2026-10-25',
    organization_name: '导出验收公司',
    relation_kind: 'receivable_receipt',
    exchange_gain_loss: index === 1 ? 5 : -10,
    status: index === 2 ? 'reversed' : 'approved',
    reason: `导出原因${index}`,
    sides: []
  }))
  const queries: Array<Record<string, unknown>> = []
  let fail = true
  let hold = false
  let release: (() => void) | undefined
  let completed = 0
  let downloads = 0
  page.on('download', () => downloads++)
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arDocumentStatus'
          ? [
              ['approved', '已审核'],
              ['reversed', '已反核销']
            ]
          : code === 'arWriteoffRelation'
            ? [['receivable_receipt', '应收收款核销']]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'fms_receivable_workspace_secure') {
      const query = body.p_query
      const exporting = Number(query.size) > 200
      if (exporting) {
        queries.push(query)
        if (fail) {
          await route.fulfill({
            status: 503,
            json: { code: 'P0001', message: '核销导出读取失败，请重试' }
          })
          completed++
          return
        }
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve
          })
      }
      const rows = records.filter(
        (row) => !query.sourceDocumentId || row.source_id === query.sourceDocumentId
      )
      await route.fulfill({ json: { records: rows, total: rows.length } })
      if (exporting) completed++
      return
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=writeoff&theme=${theme}&sourceDocumentId=source-1&permissionControls=1&permissions=FinanceReceiptWriteoff:View,FinanceReceiptWriteoff:Export`
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  const dialog = page.getByRole('dialog', { name: '核销记录', exact: true })
  await expect(dialog.getByText('QA-WRITEOFF-EXPORT-1', { exact: true })).toBeVisible()
  await expect(dialog.getByText('QA-WRITEOFF-EXPORT-2', { exact: true })).toBeVisible()
  await expect(dialog.getByText('QA-WRITEOFF-EXPORT-3', { exact: true })).toHaveCount(0)
  const exportAll = () => dialog.getByRole('button', { name: '导出', exact: true }).click()
  await exportAll()
  await expect(page.locator('.el-message--error')).toContainText('核销导出读取失败')
  expect(downloads).toBe(0)
  await expect(page.locator('.el-message')).toHaveCount(0)
  fail = false
  hold = true
  await exportAll()
  await expect.poll(() => Boolean(release)).toBe(true)
  await page.keyboard.press('Alt+Shift+E')
  release?.()
  await expect.poll(() => completed).toBe(2)
  await expect(page.locator('.el-message--error')).toContainText('导出范围或权限已变化')
  expect(downloads).toBe(0)
  hold = false
  await page.reload()
  await expect(dialog.getByText('已反核销', { exact: true })).toBeVisible()
  const downloadFile = async (label: string, filename: string) => {
    const event = page.waitForEvent('download')
    await dialog.getByRole('button', { name: label, exact: true }).click()
    const download = await event
    const file = info.outputPath(filename)
    await download.saveAs(file)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    return workbook.worksheets[0]
  }
  const all = await downloadFile('导出', 'writeoff-all.xlsx')
  const text = JSON.stringify(all.getSheetValues())
  expect(all.rowCount).toBe(3)
  expect(text).toContain('QA-WRITEOFF-EXPORT-1')
  expect(text).toContain('QA-WRITEOFF-EXPORT-2')
  expect(text).not.toContain('QA-WRITEOFF-EXPORT-3')
  expect(text).toContain('已反核销')
  expect(text).toContain('应收收款核销')
  expect(all.getRow(1).values).not.toContain('操作')
  await expect(dialog.getByRole('button', { name: '导出选中', exact: true })).toHaveCount(0)
  expect(text).toContain('¥5.00')
  expect(text).toContain('-¥10.00')
  expect(queries).toHaveLength(3)
  for (const query of queries)
    expect(query).toMatchObject({ sourceDocumentId: 'source-1', tenantId: tenant })
  expect(downloads).toBe(1)
  await dialog.screenshot({ path: info.outputPath('writeoff-export-all.png') })
})

test('核销记录仅查看角色没有导出入口', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('fms_receivable_workspace_secure')
        ? { records: [], total: 0 }
        : []
    })
  )
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=writeoff&sourceDocumentId=source-1&permissions=FinanceReceiptWriteoff:View'
  )
  const dialog = page.getByRole('dialog', { name: '核销记录', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /导出/ })).toHaveCount(0)
})
