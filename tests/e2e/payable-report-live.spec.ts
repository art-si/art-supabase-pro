import assert from 'node:assert/strict'
import { appendFileSync, readFileSync } from 'node:fs'
import dayjs from 'dayjs'
import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord as record,
  acceptanceRows as rows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc,
  payableAcceptanceTenantId as tenantId
} from './support/payable-live-session'
import { prepareAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off'
})
test.skip(!enabled, '仅显式在独立验收租户运行真实应付报表流程')
test.setTimeout(300_000)

test('普通账号两笔真实应付新增审核、报表汇总账龄、打印导出及来源联查', async ({
  page,
  context
}, info) => {
  const client = await assertPayableAcceptanceSession(context)
  const setup = record(JSON.parse(readFileSync('.artifacts/apar-live-context.json', 'utf8')))
  expect(setup.tenantId).toBe(tenantId)
  const typeResponse = await client
    .from('mdm_document_type')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('document_type_code', 'AP_FIN_EXPENSE')
  expect(typeResponse.error).toBeNull()
  const typeId = identifier(rows(typeResponse.data)[0])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
  const expected: Array<{
    id: string
    documentNo: string
    amount: number
    future: number
    overdue: number
  }> = []
  for (const index of [1, 2]) {
    const code = `QA_RPT_${index}`
    const supplierResponse = await client
      .from('mdm_supplier')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('supplier_code', code)
    expect(supplierResponse.error).toBeNull()
    const suppliers = rows(supplierResponse.data)
    expect(suppliers.length).toBeLessThanOrEqual(1)
    const supplier = suppliers.length
      ? identifier(suppliers[0])
      : await rpc(client, 'smis_save_supplier_secure', {
          p_id: null,
          p_payload: {
            supplier_code: code,
            supplier_name: `独立报表验收${index}`,
            supplier_category: 'Equipment_Supplier',
            supplier_type: 'general',
            enterprise_nature: 'state_owned',
            industry: 'coal_mining',
            address_detail: '独立验收租户合成资料，不接真实银行',
            remark: '应付报表验收专用往来，不影响既有核销方案'
          }
        })
    assert.equal(typeof supplier, 'string')
    const marker = `QA-RPT-LIVE-${index}`
    const prior = await client
      .from('fms_purchase_payable_document')
      .select('id,status')
      .eq('tenant_id', tenantId)
      .eq('kind', 'financial')
      .contains('details', { invoice_no: marker })
    expect(prior.error).toBeNull()
    expect(rows(prior.data).length).toBeLessThanOrEqual(1)
    const amount = index * 150
    const overdue = index * 50
    const saved = prior.data?.length
      ? rows(prior.data)[0]
      : record(
          await rpc(client, 'fms_save_purchase_payable_secure', {
            p_document: {
              kind: 'financial',
              document_type_id: typeId,
              supplier_id: supplier,
              organization_id: setup.organizationId,
              business_date: today,
              currency_code: 'CNY',
              exchange_rate: 1,
              input_tax_inclusive_price: false,
              invoice_no: marker,
              remark: '独立报表两笔验收，保留历史且不发起实际付款',
              payment_plans: [
                { due_date: dayjs(today).subtract(1, 'day').format('YYYY-MM-DD'), amount: overdue },
                {
                  due_date: dayjs(today).add(30, 'day').format('YYYY-MM-DD'),
                  amount: amount - overdue
                }
              ],
              lines: [
                {
                  material_id: setup.materialId,
                  inventory_unit_id: setup.inventoryUnitId,
                  quantity: 1,
                  unit_price: amount,
                  tax_rate: 0
                }
              ]
            }
          })
        )
    const id = identifier(saved)
    let source = rows(
      record(
        await rpc(client, 'fms_purchase_payable_list_secure', {
          p_kind: 'financial',
          p_id: id,
          p_limit: 1
        })
      ).data
    )[0]
    for (const status of ['draft', 'submitted']) {
      if (source.status !== status) continue
      await rpc(client, 'fms_act_purchase_payable_secure', {
        p_ids: [id],
        p_action: status === 'draft' ? 'submit' : 'approve'
      })
      source = rows(
        record(
          await rpc(client, 'fms_purchase_payable_list_secure', {
            p_kind: 'financial',
            p_id: id,
            p_limit: 1
          })
        ).data
      )[0]
    }
    expect(source.status).toBe('approved')
    const report = record(
      await rpc(client, 'fms_payable_report_secure', { p_query: { keyword: code, mode: 'aging' } })
    )
    expect(report.total).toBe(1)
    const result = rows(report.records)[0]
    expect(Number(result.balance_amount)).toBe(amount)
    expect(Number(result.current_amount)).toBe(amount - overdue)
    expect(Number(result.age1_to30)).toBe(overdue)
    expected.push({
      id,
      documentNo: String(source.document_no),
      amount,
      future: amount - overdue,
      overdue
    })
    appendFileSync(
      '.artifacts/payable-report-real-records.jsonl',
      JSON.stringify({ marker, id, documentNo: source.document_no }) + '\n'
    )
  }
  const errors: string[] = []
  const loadFailures: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('requestfailed', (request) => {
    const url = new URL(request.url())
    loadFailures.push(
      `${request.method()} ${url.origin}${url.pathname} ${request.failure()?.errorText || ''}`
    )
  })
  page.on('response', (response) => {
    if (response.status() < 400) return
    const url = new URL(response.url())
    loadFailures.push(`${response.status()} ${url.origin}${url.pathname}`)
  })
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  await page.goto('#/fms/accounts-payable/payable-report', { waitUntil: 'domcontentloaded' })
  try {
    await expect(page.getByRole('heading', { name: '应付汇总与账龄', exact: true })).toBeVisible({
      timeout: 60_000
    })
  } catch (error) {
    await info.attach('payable-report-bootstrap-diagnostics', {
      body: JSON.stringify({ errors, loadFailures }),
      contentType: 'application/json'
    })
    throw error
  }
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const query = page.getByRole('textbox', { name: '查询条件', exact: true })
  if (!(await query.isVisible()))
    await page.getByRole('button', { name: '展开', exact: true }).click()
  await query.fill('QA_RPT_')
  const ready = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_payable_report_secure') &&
      response.request().postDataJSON()?.p_query?.keyword === 'QA_RPT_'
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  expect((await ready).ok()).toBe(true)
  await expect(page.locator('.el-button.is-loading')).toHaveCount(0)
  const tableRows = page.locator('.el-table__body-wrapper tbody tr')
  await expect(tableRows).toHaveCount(2)
  await captureBusinessEvidence(page, {
    path: info.outputPath('report-real-detail.png'),
    fullPage: true
  })
  for (const mode of ['应付汇总', '财务应付账龄']) {
    await page.getByRole('radio', { name: mode, exact: true }).locator('..').click()
    const response = page.waitForResponse(
      (entry) =>
        entry.url().endsWith('/rpc/fms_payable_report_secure') &&
        entry.request().postDataJSON()?.p_query?.mode ===
          (mode === '应付汇总' ? 'summary' : 'aging')
    )
    await page.getByRole('button', { name: '查询', exact: true }).click()
    expect((await response).ok()).toBe(true)
    await expect(page.locator('.el-button.is-loading')).toHaveCount(0)
    await expect(tableRows).toHaveCount(2)
    await captureBusinessEvidence(page, {
      path: info.outputPath(
        mode === '应付汇总' ? 'report-real-summary.png' : 'report-real-aging-left.png'
      ),
      fullPage: true
    })
  }
  await expect(page.getByRole('columnheader', { name: '逾期1—30天', exact: true })).toHaveCount(1)
  await tableRows
    .filter({ hasText: '独立报表验收1' })
    .getByText(`¥${expected[0].future.toFixed(2)}`, { exact: true })
    .first()
    .evaluate((element) => {
      const scroller = element.closest('.el-scrollbar__wrap')
      if (!scroller) throw new Error('账龄金额未位于表格滚动区')
      const fixed = scroller.querySelector('td.el-table-fixed-column--left')
      const left = fixed?.getBoundingClientRect().right ?? scroller.getBoundingClientRect().left
      scroller.scrollLeft += element.getBoundingClientRect().left - left - 16
    })
  await captureBusinessEvidence(page, {
    path: info.outputPath('report-real-aging-current.png'),
    fullPage: true
  })
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(page.getByRole('cell', { name: '独立报表验收1', exact: true })).toBeVisible()
  for (const scenario of expected) {
    const row = tableRows.filter({ hasText: `独立报表验收${expected.indexOf(scenario) + 1}` })
    await expect(row).toContainText(`¥${scenario.future.toFixed(2)}`)
    await expect(row).toContainText(`¥${scenario.overdue.toFixed(2)}`)
  }
  await captureBusinessEvidence(page, {
    path: info.outputPath('report-real-aging-amounts.png'),
    fullPage: true
  })
  const download = page.waitForEvent('download')
  const exportResponse = page.waitForResponse(
    (entry) =>
      entry.url().endsWith('/rpc/fms_payable_report_secure') &&
      entry.request().postDataJSON()?.p_query?.action === 'export'
  )
  await page.getByRole('button', { name: '导出查询结果', exact: true }).click()
  expect((await exportResponse).ok()).toBe(true)
  const exported = await download
  expect(exported.suggestedFilename()).toContain('应付报表')
  const path = await exported.path()
  assert.ok(path)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path)
  const worksheet = workbook.worksheets[0]
  expect(worksheet.rowCount).toBe(3)
  const headers: string[] = []
  worksheet.getRow(1).eachCell((cell) => headers.push(cell.text))
  for (const [index, scenario] of expected.entries()) {
    const data = worksheet.getRow(index + 2)
    expect(data.getCell(headers.indexOf('往来单位') + 1).text).toBe(`独立报表验收${index + 1}`)
    expect(data.getCell(headers.indexOf('单据类别') + 1).text).toBe('财务应付')
    expect(data.getCell(headers.indexOf('余额状态') + 1).text).toBe('可用')
    expect(data.getCell(headers.indexOf('余额（原币）') + 1).text).toBe(
      `¥${scenario.amount.toFixed(2)}`
    )
  }
  const popupReady = page.waitForEvent('popup')
  await page.getByRole('button', { name: '打印本页', exact: true }).click()
  const popup = await popupReady
  await expect(popup.getByRole('cell', { name: '独立报表验收1', exact: true })).toBeVisible()
  await expect(popup.getByText(/账龄依据：计划到期日/)).toBeVisible()
  await captureBusinessEvidence(popup, {
    path: info.outputPath('report-real-print.png'),
    fullPage: true
  })
  await popup.close()
  await page.getByRole('radio', { name: '单据明细', exact: true }).locator('..').click()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  for (const scenario of expected) {
    const row = tableRows.filter({ hasText: scenario.documentNo })
    await row.getByRole('link', { name: scenario.documentNo, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`recordId=${scenario.id}`))
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await page.goBack()
    await expect(page.getByRole('heading', { name: '应付汇总与账龄', exact: true })).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
