import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { expect, test, type Locator } from '@playwright/test'
import {
  acceptanceIdentifier,
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { applyAppearance, assertAppearance, prepareAppearance } from './support/appearance'
import { financePaths } from '../../src/router/business-paths'

const enabled =
  process.env.E2E_PAYABLE_LIVE === 'true' && process.env.E2E_PAYABLE_TMS_NATIVE === 'true'

test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25_000
})
test.setTimeout(360_000)

test('普通账号两条真实运输来源审批、应付导入、虚拟付款确认与原单核销', async ({
  page,
  context
}, info) => {
  test.skip(!enabled, '仅显式运行独立租户的真实运输虚拟结算')
  const client = await assertPayableAcceptanceSession(context)
  const sources = acceptanceRows(
    JSON.parse(readFileSync('.artifacts/payable-tms-native-sources.json', 'utf8'))
  )
  expect(sources).toHaveLength(2)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const completed: Array<Record<string, unknown>> = []
  async function selectRow(row: Locator): Promise<void> {
    const checkbox = row.getByRole('checkbox')
    if (!(await checkbox.isChecked())) await checkbox.locator('..').click()
  }
  async function financialDocument(statementId: string) {
    const result = await client
      .from('fms_purchase_payable_document')
      .select('id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('kind', 'financial')
      .eq('tms_statement_id', statementId)
      .maybeSingle()
    expect(result.error).toBeNull()
    if (!result.data) return undefined
    const response = acceptanceRecord(
      await acceptanceRpc(client, 'fms_purchase_payable_list_secure', {
        p_kind: 'financial',
        p_id: acceptanceIdentifier(acceptanceRecord(result.data))
      })
    )
    const rows = acceptanceRows(response.data)
    expect(rows).toHaveLength(1)
    return rows[0]
  }
  for (const source of sources) {
    const index = Number(source.source_index)
    expect([1, 2]).toContain(index)
    expect(source.tenant_id).toBe(payableAcceptanceTenantId)
    assert.ok(typeof source.business_date === 'string')
    assert.ok(typeof source.carrier_name === 'string')
    const carrierId = acceptanceIdentifier({ id: source.carrier_id })
    const waybillId = acceptanceIdentifier({ id: source.waybill_id })
    const expenseId = acceptanceIdentifier({ id: source.expense_id })
    const marker = `QA_AP_TMS_NATIVE_${index}`
    const costList = acceptanceRecord(
      await acceptanceRpc(client, 'tms_list_waybill_costs_secure', {
        p_from: 0,
        p_to: 49,
        p_waybill_id: waybillId,
        p_purpose: 'list'
      })
    )
    const matchingCosts = acceptanceRows(costList.records).filter((row) => row.remark === marker)
    expect(matchingCosts.length).toBeLessThanOrEqual(1)
    let cost = matchingCosts[0]
    if (!cost)
      cost = acceptanceRecord(
        await acceptanceRpc(client, 'tms_save_waybill_cost_secure', {
          p_id: null,
          p_payload: {
            waybill_id: waybillId,
            expense_item_id: expenseId,
            carrier_id: carrierId,
            amount: index * 100,
            occurred_on: source.business_date,
            payee_name: source.carrier_name,
            remark: marker
          }
        })
      )
    const costId = acceptanceIdentifier(cost)
    if (cost.audit_status === 'draft' || cost.audit_status === 'rejected')
      await acceptanceRpc(client, 'start_workflow', {
        p_business_type: 'tms_waybill_cost',
        p_business_id: costId,
        p_business_title: marker,
        p_context: {},
        p_idempotency_key: crypto.randomUUID()
      })
    cost = acceptanceRecord(
      await acceptanceRpc(client, 'tms_get_waybill_cost_secure', { p_id: costId })
    )
    if (cost.audit_status === 'pending_review')
      await acceptanceRpc(client, 'act_workflow_by_business', {
        p_business_type: 'tms_waybill_cost',
        p_business_id: costId,
        p_action: 'approve',
        p_comment: '独立验收租户实际来源审批',
        p_idempotency_key: crypto.randomUUID()
      })
    cost = acceptanceRecord(
      await acceptanceRpc(client, 'tms_get_waybill_cost_secure', { p_id: costId })
    )
    expect(cost.audit_status).toBe('approved')
    const statementList = acceptanceRecord(
      await acceptanceRpc(client, 'tms_list_carrier_statements_secure', {
        p_from: 0,
        p_to: 49,
        p_carrier_id: carrierId,
        p_purpose: 'list'
      })
    )
    const matchingStatements = acceptanceRows(statementList.records).filter(
      (row) => row.remark === marker
    )
    expect(matchingStatements.length).toBeLessThanOrEqual(1)
    let statementId = matchingStatements[0] ? acceptanceIdentifier(matchingStatements[0]) : ''
    if (!statementId)
      statementId = acceptanceIdentifier({
        id: await acceptanceRpc(client, 'tms_create_carrier_statement_secure', {
          p_carrier_id: carrierId,
          p_period_start: source.business_date,
          p_period_end: source.business_date,
          p_cost_ids: [costId],
          p_remark: marker,
          p_statement_no: null
        })
      })
    let statement = acceptanceRecord(
      await acceptanceRpc(client, 'tms_get_carrier_statement_secure', { p_id: statementId })
    )
    if (statement.status === 'draft')
      await acceptanceRpc(client, 'start_workflow', {
        p_business_type: 'tms_carrier_statement',
        p_business_id: statementId,
        p_business_title: marker,
        p_context: {},
        p_idempotency_key: crypto.randomUUID()
      })
    statement = acceptanceRecord(
      await acceptanceRpc(client, 'tms_get_carrier_statement_secure', { p_id: statementId })
    )
    if (statement.status === 'pending_review')
      await acceptanceRpc(client, 'act_workflow_by_business', {
        p_business_type: 'tms_carrier_statement',
        p_business_id: statementId,
        p_action: 'approve',
        p_comment: '独立验收租户实际承运对账审批',
        p_idempotency_key: crypto.randomUUID()
      })
    statement = acceptanceRecord(
      await acceptanceRpc(client, 'tms_get_carrier_statement_secure', { p_id: statementId })
    )
    expect(['confirmed', 'settled']).toContain(statement.status)
    assert.ok(typeof statement.statement_no === 'string')
    await prepareAppearance(page, {
      theme: index === 1 ? 'light' : 'dark',
      boxBorderMode: index === 1
    })
    await page.goto(`#${financePaths.financialPayable}`, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible()
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    await applyAppearance(page, {
      theme: index === 1 ? 'light' : 'dark',
      boxBorderMode: index === 1
    })
    let financial = await financialDocument(statementId)
    if (!financial) {
      await page.getByRole('button', { name: '导入TMS', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '导入TMS承运结算', exact: true })
      const sourceRow = picker.locator('tbody tr').filter({ hasText: statement.statement_no })
      await sourceRow.click()
      const imported = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_import_carrier_payable_secure')
      )
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      expect((await imported).ok()).toBe(true)
      await expect(picker).toBeHidden()
      financial = await financialDocument(statementId)
    }
    assert.ok(financial && typeof financial.document_no === 'string')
    const financialId = acceptanceIdentifier(financial)
    const financialRow = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: financial.document_no })
    for (const [from, label] of [
      ['draft', '提交'],
      ['submitted', '审核']
    ]) {
      if (financial.status !== from) continue
      await selectRow(financialRow)
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(financialRow).toContainText(label === '提交' ? '已提交' : '已审核')
      financial = await financialDocument(statementId)
      assert.ok(financial)
    }
    expect(financial.status).toBe('approved')
    const paymentLinks = await client
      .from('fms_payable_settlement_line')
      .select('document_id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('payable_id', financialId)
    expect(paymentLinks.error).toBeNull()
    const links = acceptanceRows(paymentLinks.data)
    expect(links.length).toBeLessThanOrEqual(1)
    let paymentId = links[0] ? acceptanceIdentifier({ id: links[0].document_id }) : ''
    if (!paymentId) {
      await selectRow(financialRow)
      await page.getByRole('button', { name: '下推', exact: true }).click()
      const pushed = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
      )
      await page
        .locator('.el-dropdown__popper:visible')
        .getByRole('menuitem', { name: '付款单', exact: true })
        .click()
      const response = await pushed
      expect(response.ok()).toBe(true)
      paymentId = acceptanceIdentifier(acceptanceRecord(await response.json()))
      const pushedDrawer = page.getByRole('dialog', { name: '查看付款单', exact: true })
      await expect(pushedDrawer).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(pushedDrawer).toBeHidden()
    }
    const fetchPayment = async () => {
      const result = acceptanceRecord(
        await acceptanceRpc(client, 'fms_payable_settlement_list_secure', {
          p_kind: 'payment',
          p_query: { id: paymentId }
        })
      )
      const rows = acceptanceRows(result.data)
      expect(rows).toHaveLength(1)
      return rows[0]
    }
    let payment = await fetchPayment()
    assert.ok(typeof payment.document_no === 'string')
    await page.goto(`#${financePaths.payablePayment}`, { waitUntil: 'domcontentloaded' })
    const detail = page.getByRole('dialog')
    if (await detail.isVisible()) {
      await page.keyboard.press('Escape')
      await expect(detail).toBeHidden()
    }
    const paymentRow = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: payment.document_no })
    await expect(paymentRow).toBeVisible()
    if (payment.status === 'draft') {
      await paymentRow.getByRole('button', { name: '编辑', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '编辑付款单', exact: true })
      await expect(drawer.getByText(source.carrier_name, { exact: true })).toHaveCount(2)
      const method = drawer.getByRole('combobox', { name: '结算方式', exact: true })
      await method.click()
      await page.getByRole('option', { name: '虚拟结算 · JSFS13', exact: true }).click()
      await expect(drawer.getByRole('combobox', { name: '付款账号', exact: true })).toHaveValue('')
      await method.scrollIntoViewIfNeeded()
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`native-virtual-editor-${index}.png`)
      })
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).toBeHidden()
      payment = await fetchPayment()
    }
    for (const [from, label] of [
      ['draft', '提交'],
      ['submitted', '审核']
    ]) {
      if (payment.status !== from) continue
      await selectRow(paymentRow)
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(paymentRow).toContainText(label === '提交' ? '已提交' : '已审核')
      payment = await fetchPayment()
    }
    if (payment.status === 'approved') {
      await selectRow(paymentRow)
      await page.getByRole('button', { name: '确认付款', exact: true }).click()
      await page
        .locator('.el-dropdown__popper:visible')
        .getByRole('menuitem', { name: '确认付款', exact: true })
        .click()
      const confirmation = page.locator('.el-message-box')
      await expect(confirmation).toContainText('虚拟结算不生成资金流水')
      await confirmation.getByRole('button', { name: '确认登记', exact: true }).click()
      await expect(paymentRow).toContainText('已确认付款')
    }
    payment = await fetchPayment()
    expect(payment.status).toBe('confirmed')
    const lines = acceptanceRows(payment.lines)
    expect(lines).toHaveLength(1)
    expect(lines[0].carrier_id).toBe(carrierId)
    expect(lines[0].fund_account_id).toBeNull()
    financial = await financialDocument(statementId)
    assert.ok(financial)
    expect(Number(financial.written_off_amount)).toBe(index * 100)
    expect(Number(financial.unpaid_amount)).toBe(0)
    statement = acceptanceRecord(
      await acceptanceRpc(client, 'tms_get_carrier_statement_secure', { p_id: statementId })
    )
    expect(statement.status).toBe('settled')
    expect(Number(statement.settled_amount)).toBe(index * 100)
    await assertAppearance(page, {
      theme: index === 1 ? 'light' : 'dark',
      boxBorderMode: index === 1
    })
    await captureBusinessEvidence(page, {
      path: info.outputPath(`native-virtual-confirmed-${index}.png`),
      fullPage: true
    })
    completed.push({ financialId, paymentId, statementId, costId })
  }
  expect(completed).toHaveLength(2)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 两条真实运输应付与付款只读视觉及联查`, async ({ page, context }, info) => {
    test.skip(!enabled, '仅显式运行已完成的独立租户运输结算视觉验收')
    const client = await assertPayableAcceptanceSession(context)
    const sources = acceptanceRows(
      JSON.parse(readFileSync('.artifacts/payable-tms-native-sources.json', 'utf8'))
    )
    expect(sources).toHaveLength(2)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareAppearance(page, { theme, boxBorderMode: theme === 'light' })
    for (const source of sources) {
      const index = Number(source.source_index)
      const carrierId = acceptanceIdentifier({ id: source.carrier_id })
      assert.ok(typeof source.carrier_name === 'string')
      const statementList = acceptanceRecord(
        await acceptanceRpc(client, 'tms_list_carrier_statements_secure', {
          p_from: 0,
          p_to: 49,
          p_carrier_id: carrierId,
          p_purpose: 'list'
        })
      )
      const statements = acceptanceRows(statementList.records).filter(
        (row) => row.remark === `QA_AP_TMS_NATIVE_${index}`
      )
      expect(statements).toHaveLength(1)
      expect(statements[0].status).toBe('settled')
      const financeResponse = await client
        .from('fms_purchase_payable_document')
        .select('id,document_no')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('kind', 'financial')
        .eq('tms_statement_id', acceptanceIdentifier(statements[0]))
        .single()
      expect(financeResponse.error).toBeNull()
      const financial = acceptanceRecord(financeResponse.data)
      const paymentResponse = await client
        .from('fms_payable_settlement_line')
        .select('document_id')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('payable_id', acceptanceIdentifier(financial))
      expect(paymentResponse.error).toBeNull()
      const paymentLinks = acceptanceRows(paymentResponse.data)
      expect(paymentLinks).toHaveLength(1)
      for (const targetDocument of [
        {
          kind: 'financial',
          path: financePaths.financialPayable,
          id: acceptanceIdentifier(financial),
          title: '财务应付单详情'
        },
        {
          kind: 'payment',
          path: financePaths.payablePayment,
          id: acceptanceIdentifier({ id: paymentLinks[0].document_id }),
          title: '查看付款单'
        }
      ]) {
        await page.goto(`#${targetDocument.path}`, { waitUntil: 'domcontentloaded' })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(
          page.getByRole('heading', {
            name: targetDocument.kind === 'financial' ? '财务应付单' : '付款单',
            exact: true
          })
        ).toBeVisible()
        const guide = page.getByRole('button', { name: '知道了', exact: true })
        if (await guide.isVisible()) await guide.click()
        await applyAppearance(page, { theme, boxBorderMode: theme === 'light' })
        await page.goto(`#${targetDocument.path}?recordId=${targetDocument.id}`, {
          waitUntil: 'domcontentloaded'
        })
        const drawer = page.getByRole('dialog', { name: targetDocument.title, exact: true })
        await expect(drawer).toBeVisible()
        await expect(drawer).toContainText(source.carrier_name)
        if (targetDocument.kind === 'financial') {
          await expect(drawer).toContainText('应付验收承运运费')
          await expect(drawer.getByText('carrier_freight', { exact: true })).toHaveCount(0)
        }
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
        await assertAppearance(page, { theme, boxBorderMode: theme === 'light' })
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`native-${targetDocument.kind}-${theme}-${index}-top.png`)
        })
        await drawer.locator('.el-table__body-wrapper tbody tr').first().scrollIntoViewIfNeeded()
        const scrollbar = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
        await scrollbar.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await expect
          .poll(() =>
            scrollbar.evaluate(
              (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1
            )
          )
          .toBe(true)
        await assertAppearance(page, { theme, boxBorderMode: theme === 'light' })
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`native-${targetDocument.kind}-${theme}-${index}-detail.png`)
        })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true)
        await page.keyboard.press('Escape')
        await expect(drawer).toBeHidden()
      }
    }
    expect(errors).toEqual([])
  })
}
