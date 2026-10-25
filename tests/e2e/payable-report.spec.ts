import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(180000)

test('应付报表两条记录、组织树、三模式和完整导出', async ({ page }, info) => {
  page.on('pageerror', (error) => {
    void info.attach('browser-error', {
      body: error.stack ?? error.message,
      contentType: 'text/plain'
    })
  })
  const queries: Array<Record<string, unknown>> = []
  let failAction = ''
  let responseMode: 'normal' | 'hidden' | 'empty' = 'normal'
  const tenant = '11111111-1111-4111-8111-111111111111'
  const dicts: Record<string, Array<[string, string]>> = {
    apReportMode: [
      ['detail', '应付明细'],
      ['summary', '应付汇总'],
      ['aging', '财务应付账龄']
    ],
    apReportKind: [
      ['financial', '财务应付'],
      ['estimated', '暂估应付']
    ],
    apReportPartyType: [
      ['supplier', '供应商'],
      ['carrier', '承运商']
    ],
    apReportAgingBasis: [
      ['due', '计划到期日'],
      ['business', '业务日期']
    ],
    apReportAllocation: [
      ['oldest_due', '到期顺序'],
      ['proportional', '按比例']
    ],
    apReportBalanceState: [
      ['ready', '余额可用'],
      ['amount_hidden', '金额不可见']
    ]
  }
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    const body = request.postData() ? request.postDataJSON() : {}
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      return route.fulfill({
        json: (dicts[code] || []).map(([value, label]) => ({
          id: `${code}-${value}`,
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
            status: '1'
          },
          ...[1, 2].map((i) => ({
            id: `org-${i}`,
            tenant_id: tenant,
            parent_id: 'group',
            organization_code: `ORG-${i}`,
            organization_name: `验收公司${i}`,
            status: '1'
          }))
        ]
      })
    if (name === 'fms_payable_report_options_secure')
      return route.fulfill({
        json: {
          books: [],
          organizations: [1, 2].map((i) => ({
            id: `org-${i}`,
            tenant_id: tenant,
            name: `验收公司${i}`,
            code: `ORG-${i}`
          }))
        }
      })
    if (name === 'fms_payable_report_secure') {
      const query = body.p_query
      queries.push(query)
      if (query.action === failAction) {
        failAction = ''
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '报表暂不可用，请重试' }
        })
      }
      const records = [1, 2]
        .filter((i) => !query.organization_id || query.organization_id === `org-${i}`)
        .map((i) => ({
          id: `row-${i}`,
          tenant_id: tenant,
          tenant_name: '验收租户',
          account_set_name: '验收账套',
          organization_name: `验收公司${i}`,
          party_name: `验收供应商${i}`,
          party_type: 'supplier',
          kind: 'financial',
          currency_code: 'CNY',
          base_currency_code: 'CNY',
          document_no: `QA-AP-REPORT-${i}`,
          business_date: '2026-10-01',
          due_date: '2026-10-10',
          document_count: 1,
          amount_readable: true,
          balance_state: 'ready',
          occurrence_amount: i * 150,
          reduction_amount: i * 50,
          balance_amount: i * 100,
          base_balance_amount: i * 100,
          current_amount: 0,
          age1_to30: i * 100,
          age31_to60: 0,
          age61_to90: 0,
          age91_to180: 0,
          age_over180: 0,
          credit_balance: 0
        }))
      const resultRows =
        responseMode === 'empty'
          ? []
          : records.map((row) =>
              responseMode === 'hidden'
                ? {
                    ...row,
                    amount_readable: false,
                    balance_state: 'amount_hidden',
                    occurrence_amount: 987654321,
                    reduction_amount: 987654321,
                    balance_amount: 987654321,
                    base_balance_amount: 987654321,
                    current_amount: 987654321,
                    age1_to30: 987654321
                  }
                : row
            )
      return route.fulfill({
        json: {
          records: resultRows,
          total: resultRows.length,
          unavailable_count: responseMode === 'hidden' ? resultRows.length : 0
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  const permissions = ['View', 'Export', 'Print']
    .map((action) => `FinancePayableReport:${action}`)
    .join(',')
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=ap_report&theme=${theme}&permissions=${encodeURIComponent(permissions)}`
  )
  await expect(page.locator('.business-workspace-header')).toBeVisible({ timeout: 60000 })
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  else await expect(page.locator('html')).not.toHaveClass(/dark/)
  for (const i of [1, 2])
    await expect(page.getByText(`QA-AP-REPORT-${i}`, { exact: true })).toBeVisible()
  const expand = page.getByRole('button', { name: '展开', exact: true })
  if (await expand.isVisible()) await expand.click()
  await page.getByRole('combobox', { name: '结算组织', exact: true }).click()
  const parent = page.getByRole('treeitem', { name: '验收集团', exact: true })
  await expect(parent).toHaveAttribute('aria-disabled', 'true')
  await parent.locator('.el-tree-node__expand-icon').click()
  await page.getByRole('treeitem', { name: '验收公司1', exact: true }).click()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('QA-AP-REPORT-2', { exact: true })).toHaveCount(0)
  for (const mode of ['应付汇总', '财务应付账龄']) {
    await page.getByRole('radio', { name: mode, exact: true }).locator('..').click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByRole('columnheader', { name: '单据数', exact: true })).toBeVisible()
    if (mode === '财务应付账龄')
      await expect(
        page.getByRole('columnheader', { name: '逾期1—30天', exact: true })
      ).toBeAttached()
  }
  failAction = 'export'
  await page.getByRole('button', { name: '导出', exact: true }).click()
  await expect(page.getByText('报表暂不可用，请重试', { exact: true })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloadEvent
  const file = info.outputPath('payable-report.xlsx')
  await download.saveAs(file)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(file)
  const text = JSON.stringify(workbook.worksheets[0].getSheetValues())
  expect(text).toContain('验收供应商1')
  expect(text).not.toContain('验收供应商2')
  expect(text).toContain('逾期1—30天')
  expect(queries.find((query) => query.action === 'export')).toMatchObject({
    mode: 'aging',
    kind: 'financial',
    organization_id: 'org-1',
    current: 1,
    size: 10000
  })
  await page.screenshot({ path: info.outputPath('payable-report-aging.png'), fullPage: true })
  await page.context().addInitScript(() => {
    window.print = () => undefined
  })
  failAction = 'print'
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.getByText('报表暂不可用，请重试', { exact: true }).last()).toBeVisible()
  const popupEvent = page.waitForEvent('popup')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const popup = await popupEvent
  await expect(popup.getByRole('columnheader', { name: '逾期1—30天', exact: true })).toBeVisible()
  await expect(popup.getByText('验收供应商1', { exact: true })).toBeVisible()
  await expect(popup.getByText('验收供应商2', { exact: true })).toHaveCount(0)
  await expect(popup.getByText('财务应付', { exact: true })).toBeVisible()
  expect(queries.find((query) => query.action === 'print')).toMatchObject({
    mode: 'aging',
    kind: 'financial',
    organization_id: 'org-1',
    size: 200
  })
  await popup.screenshot({ path: info.outputPath('payable-print.png'), fullPage: true })
  await popup.close()
  await assertTableFocusContract(page, info)
  failAction = 'view'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('columnheader', { name: '余额状态', exact: true })).toBeAttached()
  responseMode = 'hidden'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('金额不可见', { exact: true })).toBeVisible()
  expect(await page.locator('.el-table').innerText()).not.toContain('987')
  const hiddenDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const hiddenDownload = await hiddenDownloadEvent
  const hiddenFile = info.outputPath('payable-hidden.xlsx')
  await hiddenDownload.saveAs(hiddenFile)
  const hiddenWorkbook = new ExcelJS.Workbook()
  await hiddenWorkbook.xlsx.readFile(hiddenFile)
  expect(JSON.stringify(hiddenWorkbook.worksheets[0].getSheetValues())).not.toContain('987')
  const hiddenPopupEvent = page.waitForEvent('popup')
  await page.getByRole('button', { name: '打印', exact: true }).click()
  const hiddenPopup = await hiddenPopupEvent
  await expect(hiddenPopup.getByText('金额不可见', { exact: true })).toBeVisible()
  expect(await hiddenPopup.locator('body').innerText()).not.toContain('987')
  await hiddenPopup.close()
  responseMode = 'empty'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('当前条件下暂无应付记录', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.getByText('当前查询没有可打印的应付记录', { exact: true })).toBeVisible()
  responseMode = 'normal'
  for (const actions of [[], ['View'], ['View', 'Export'], ['View', 'Print']]) {
    const grants = actions.map((action) => `FinancePayableReport:${action}`).join(',')
    const before = queries.length
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=ap_report&theme=${theme}&permissions=${encodeURIComponent(grants)}`
    )
    if (!actions.includes('View')) {
      await expect(page.getByText('暂无查看权限', { exact: true })).toBeVisible()
      expect(queries.length).toBe(before)
    } else {
      await expect(page.getByText('QA-AP-REPORT-1', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '导出', exact: true })).toHaveCount(
        actions.includes('Export') ? 1 : 0
      )
      await expect(page.getByRole('button', { name: '打印', exact: true })).toHaveCount(
        actions.includes('Print') ? 1 : 0
      )
    }
  }
})
