import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

test('应收报表两条记录、组织树筛选、汇总账龄与导出文件一致', async ({ page }, info) => {
  const queries: Array<Record<string, unknown>> = []
  const tenant = '11111111-1111-4111-8111-111111111111'
  const dictionaries: Record<string, Array<[string, string]>> = {
    arReportMode: [
      ['detail', '应收明细'],
      ['summary', '应收汇总与账龄']
    ],
    arAgingBasis: [
      ['due', '计划到期日'],
      ['business', '业务日期']
    ],
    arDocumentKind: [['financial', '财务应收']]
  }
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      return route.fulfill({
        json: (dictionaries[code] || []).map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: 'group',
            tenant_id: tenant,
            parent_id: null,
            organization_code: 'GROUP',
            organization_name: '验收集团',
            organization_type: 'group',
            status: '1'
          },
          ...[1, 2].map((index) => ({
            id: `org-${index}`,
            tenant_id: tenant,
            parent_id: 'group',
            organization_code: `ORG-${index}`,
            organization_name: `验收结算公司${index}`,
            organization_type: 'company',
            status: '1'
          }))
        ]
      })
    if (name === 'fms_ar_options_secure')
      return route.fulfill({
        json:
          body.p_type === 'organization'
            ? [1, 2].map((index) => ({
                id: `org-${index}`,
                tenant_id: tenant,
                name: `验收结算公司${index}`
              }))
            : []
      })
    if (name === 'fms_ar_report_secure') {
      const query = body.p_query
      queries.push(query)
      const records = [1, 2]
        .filter((index) => !query.organizationId || query.organizationId === `org-${index}`)
        .map((index) => ({
          id: `report-${index}`,
          customerName: `验收账龄客户${index}`,
          currencyCode: 'CNY',
          kind: 'financial',
          documentNo: `QA-AR-REPORT-${index}`,
          organizationName: `验收结算公司${index}`,
          businessDate: '2026-10-01',
          dueDate: '2026-10-10',
          ageDays: 14,
          occurrenceAmount: index * 150,
          balanceAmount: index * 100,
          age0To30: index * 100,
          age31To60: 0,
          age61To90: 0,
          ageOver90: 0
        }))
      return route.fulfill({ json: { records, total: records.length } })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=report&theme=${theme}&permissions=FinanceReceivableReport:View,FinanceReceivableReport:Export`
  )
  await expect(page.getByText('QA-AR-REPORT-1', { exact: true })).toBeVisible()
  await expect(page.getByText('QA-AR-REPORT-2', { exact: true })).toBeVisible()
  const expand = page.getByRole('button', { name: '展开', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.getByRole('combobox', { name: '结算组织', exact: true }).click()
  const parent = page.getByRole('treeitem', { name: '验收集团', exact: true })
  await expect(parent).toHaveAttribute('aria-disabled', 'true')
  await parent.locator('.el-tree-node__expand-icon').click()
  await page.getByRole('treeitem', { name: '验收结算公司1', exact: true }).click()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('QA-AR-REPORT-2', { exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: '应收汇总与账龄', exact: true }).locator('..').click()
  await expect(page.getByRole('columnheader', { name: '单据编号', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '0—30天', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: '0—30天', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '单据编号', exact: true })).toHaveCount(0)
  await page.getByRole('radio', { name: '应收明细', exact: true }).locator('..').click()
  await expect(page.getByRole('columnheader', { name: '0—30天', exact: true })).toBeVisible()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await event
  const file = info.outputPath('report-filtered.xlsx')
  await download.saveAs(file)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const sheet = workbook.worksheets[0]
  const text = sheet
    .getSheetValues()
    .map((row) => JSON.stringify(row))
    .join('\n')
  expect(text).toContain('验收账龄客户1')
  expect(text).not.toContain('验收账龄客户2')
  expect(text).toContain('0—30天')
  const positions: Record<string, number> = {}
  sheet.getRow(1).eachCell((cell, index) => {
    positions[cell.text] = index
  })
  for (const [header, amount] of [
    ['发生额(原币)', 150],
    ['余额(原币)', 100],
    ['0—30天', 100]
  ] as const) {
    expect(positions[header]).toBeGreaterThan(0)
    expect(
      Number(
        sheet
          .getRow(2)
          .getCell(positions[header])
          .text.replace(/[^\d.-]/g, '')
      )
    ).toBe(amount)
  }
  const exported = queries.filter((query) => Number(query.size) > 200)
  expect(exported).toHaveLength(1)
  expect(exported[0]).toMatchObject({ mode: 'summary', organizationId: 'org-1', agingBasis: 'due' })
  await page.screenshot({ path: info.outputPath('report-summary-filtered.png'), fullPage: true })
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=report&theme=${theme}&permissions=FinanceReceivableReport:View`
  )
  await expect(page.getByText('QA-AR-REPORT-1', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(0)
})
