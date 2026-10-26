import assert from 'node:assert/strict'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { expect, test, type Locator, type Page, type Response } from '@playwright/test'
import {
  acceptanceIdentifier,
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { prepareAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { financePaths } from '../../src/router/business-paths'

const enabled =
  process.env.E2E_PAYABLE_LIVE === 'true' && process.env.E2E_PAYABLE_FOREIGN_NATIVE === 'true'
const journal = '.artifacts/payable-foreign-native-records.jsonl'
const purpose = 'payable-foreign-native-01a15dad'

test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-currency.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25_000
})
test.setTimeout(360_000)

async function selectRow(row: Locator): Promise<void> {
  if (!(await row.getByRole('checkbox').isChecked())) await row.locator('.el-checkbox').click()
}

async function visibleRow(page: Page, row: Locator): Promise<void> {
  const retry = page.getByRole('button', { name: '重新加载', exact: true })
  await expect(row.or(retry).first()).toBeVisible({ timeout: 25_000 })
  if (await retry.isVisible()) await retry.click()
  await expect(row).toBeVisible({ timeout: 25_000 })
}

async function approve(page: Page, row: Locator): Promise<void> {
  await visibleRow(page, row)
  if ((await row.innerText()).includes('已审核')) return
  await selectRow(row)
  if (!(await row.innerText()).includes('已提交')) {
    const submitted = page.waitForResponse((response) =>
      /\/rpc\/fms_act_(purchase_payable|payable_settlement)_secure$/.test(response.url())
    )
    const refreshed = page.waitForResponse((response) =>
      /\/rpc\/fms_(purchase_payable_list|payable_settlement_list)_secure$/.test(response.url())
    )
    await page.getByRole('button', { name: '提交', exact: true }).click()
    expect((await submitted).ok()).toBe(true)
    expect((await refreshed).ok()).toBe(true)
    await expect(row).toContainText('已提交')
    await selectRow(row)
  }
  const approved = page.waitForResponse((response) =>
    /\/rpc\/fms_act_(purchase_payable|payable_settlement)_secure$/.test(response.url())
  )
  const refreshed = page.waitForResponse((response) =>
    /\/rpc\/fms_(purchase_payable_list|payable_settlement_list)_secure$/.test(response.url())
  )
  await page.getByRole('button', { name: '审核', exact: true }).click()
  expect((await approved).ok()).toBe(true)
  expect((await refreshed).ok()).toBe(true)
  await expect(row).toContainText('已审核')
}

async function saved(response: Response, kind: string, currency: string) {
  expect(response.ok()).toBe(true)
  const document = acceptanceRecord(await response.json())
  expect(document.tenant_id).toBe(payableAcceptanceTenantId)
  expect(document.currency_code).toBe(currency)
  expect(document.account_set_id).toBe('cf3eeddd-49b0-4e62-97a9-cab2769cb633')
  assert.equal(typeof document.document_no, 'string')
  const record = { id: acceptanceIdentifier(document), documentNo: document.document_no }
  appendFileSync(journal, JSON.stringify({ purpose, kind, currency, ...record }) + '\n')
  return record
}

function previous(kind: string, currency: string): { id: string; documentNo: string } | undefined {
  if (!existsSync(journal)) return undefined
  const entries = acceptanceRows(
    readFileSync(journal, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  ).filter(
    (entry) => entry.purpose === purpose && entry.kind === kind && entry.currency === currency
  )
  const record = entries.at(-1)
  if (!record) return undefined
  assert.equal(typeof record.documentNo, 'string')
  return { id: acceptanceIdentifier(record), documentNo: record.documentNo }
}

test('两条真实外币财务应付、付款申请和付款确认取消保持原账套与独立汇率', async ({
  page,
  context
}, info) => {
  test.skip(!enabled, '仅独立验收租户显式运行真实外币业务，不模拟业务接口')
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('response', async (response) => {
    if (!response.url().endsWith('/rpc/fms_payable_settlement_list_secure')) return
    const request = response.request().postDataJSON()
    let summary: Record<string, unknown>
    try {
      const body = acceptanceRecord(await response.json())
      summary = { code: body.code, total: body.total }
      if (Array.isArray(body.data)) {
        const documents = acceptanceRows(body.data)
        summary.kinds = documents.map((row) => row.kind)
        summary.states = documents.map((row) => ({ id: row.id, status: row.status }))
      }
    } catch {
      summary = { responseBody: 'unavailable' }
    }
    appendFileSync(
      '.artifacts/payable-foreign-native-list-responses.jsonl',
      JSON.stringify({
        kind: request?.p_kind,
        query: request?.p_query,
        status: response.status(),
        ...summary
      }) + '\n'
    )
  })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const tableRows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
  async function visit(path: string): Promise<void> {
    await page.goto(`#${path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    if (await page.getByRole('dialog').isVisible()) {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    }
  }
  async function push(row: Locator, kind: string, label: string, currency: string) {
    await selectRow(row)
    const pending = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
    )
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page
      .getByRole('menu', { name: '下推', exact: true })
      .getByRole('menuitem', { name: label, exact: true })
      .click()
    const result = await saved(await pending, kind, currency)
    await expect(page.getByRole('dialog')).toContainText(result.documentNo)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    return result
  }
  for (const [index, currency, sourceRate] of [
    [1, 'USD', 7.2],
    [2, 'EUR', 8.1]
  ] as const) {
    await visit(financePaths.financialPayable)
    let financial = previous('financial', currency)
    if (!financial) {
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '新增财务应付单', exact: true })
      await expect(drawer.getByRole('textbox', { name: /结算供应商$/ })).toBeEnabled()
      await drawer.getByRole('combobox', { name: /单据类型$/ }).press('Enter')
      await page.getByRole('option', { name: '其他应付', exact: true }).click()
      for (const [field, supplierIndex] of [
        ['结算供应商', index],
        ['收款供应商', index === 1 ? 2 : 1]
      ] as const) {
        await drawer.getByRole('textbox', { name: new RegExp(`${field}$`) }).click()
        const picker = page.getByRole('dialog', { name: `选择${field}`, exact: true })
        await picker
          .locator('tbody tr')
          .filter({ hasText: `验收虚构供应商${supplierIndex}` })
          .click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
      }
      await drawer.getByRole('combobox', { name: /结算币种$/ }).press('Enter')
      await page.getByRole('option', { name: new RegExp(`\\b${currency}\\b`) }).click()
      const quote = drawer.getByRole('spinbutton', { name: /记账汇率$/ })
      await expect(quote).toBeEnabled()
      await quote.fill(String(sourceRate))
      await quote.press('Tab')
      await expect(drawer).toContainText('付款须沿用原账套和原币')
      await drawer.getByRole('button', { name: '选择物料', exact: true }).click()
      const materials = page.getByRole('dialog', { name: '数据来源物料编码', exact: true })
      await materials
        .locator('tbody tr')
        .filter({ hasText: `QA_AP_MAT_${index}` })
        .locator('.el-checkbox')
        .click()
      await materials.getByRole('button', { name: '确定', exact: true }).click()
      await drawer.getByRole('spinbutton', { name: '数量', exact: true }).fill('1')
      await drawer.getByRole('spinbutton', { name: '含税单价', exact: true }).fill('100')
      await drawer.getByRole('combobox', { name: '税率', exact: true }).press('Enter')
      await page.getByRole('option', { name: /(^|\D)0%$/ }).click()
      await drawer
        .getByRole('textbox', { name: '备注', exact: true })
        .first()
        .fill(`${purpose}-${currency}`)
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      await captureBusinessEvidence(page, {
        path: info.outputPath(`financial-${currency}-create.png`)
      })
      const pending = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_purchase_payable_secure')
      )
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      financial = await saved(await pending, 'financial', currency)
      await expect(drawer).toBeHidden()
    }
    const financialRow = tableRows.filter({ hasText: financial.documentNo })
    await approve(page, financialRow)
    const source = acceptanceRows(
      acceptanceRecord(
        await acceptanceRpc(client, 'fms_purchase_payable_list_secure', {
          p_kind: 'financial',
          p_id: financial.id
        })
      ).data
    )[0]
    expect(Number(source.exchange_rate)).toBe(sourceRate)
    expect(source.payee_supplier_name).toBe(`验收虚构供应商${index === 1 ? 2 : 1}`)
    let application = previous('application', currency)
    if (!application) application = await push(financialRow, 'application', '付款申请', currency)
    else await visit(financePaths.payableApplication)
    const applicationRow = tableRows.filter({ hasText: application.documentNo })
    await visibleRow(page, applicationRow)
    if (!(await applicationRow.innerText()).includes('已关闭')) {
      if (!(await applicationRow.innerText()).includes('已审核')) {
        await applicationRow.getByRole('button', { name: '编辑', exact: true }).click()
        const editor = page.getByRole('dialog', { name: '编辑付款申请单', exact: true })
        await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
        await editor.getByRole('combobox', { name: '付款账号', exact: true }).press('Enter')
        await page.getByRole('option', { name: new RegExp(`外币界面验收${currency}现金`) }).click()
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await expect(editor).toBeHidden()
        await approve(page, applicationRow)
      }
    }
    let payment = previous('payment', currency)
    if (!payment) {
      if (index === 1) payment = await push(applicationRow, 'payment', '付款单', currency)
      else {
        if (!(await applicationRow.innerText()).includes('已关闭')) {
          await selectRow(applicationRow)
          await page.getByRole('button', { name: '关闭', exact: true }).click()
          const reason = page.getByRole('dialog', { name: '处理原因', exact: true })
          await reason.getByRole('textbox').fill('独立验收取消请款预留，再从原币财务应付直接付款')
          await reason.getByRole('button', { name: '确定', exact: true }).click()
          await expect(applicationRow).toContainText('已关闭')
        }
        await visit(financePaths.financialPayable)
        payment = await push(
          tableRows.filter({ hasText: financial.documentNo }),
          'payment',
          '付款单',
          currency
        )
      }
    } else await visit(financePaths.payablePayment)
    const paymentRow = tableRows.filter({ hasText: payment.documentNo })
    await visibleRow(page, paymentRow)
    const currentPayment = acceptanceRows(
      acceptanceRecord(
        await acceptanceRpc(client, 'fms_payable_settlement_list_secure', {
          p_kind: 'payment',
          p_query: { id: payment.id, current: 1, size: 1 }
        })
      ).data
    )[0]
    expect(currentPayment.currency_code).toBe(currency)
    expect(currentPayment.account_set_id).toBe('cf3eeddd-49b0-4e62-97a9-cab2769cb633')
    expect(Number(currentPayment.exchange_rate)).toBe(index === 1 ? 7 : 8)
    expect(acceptanceRows(currentPayment.lines)[0].payee_supplier_name).toBe(
      source.payee_supplier_name
    )
    if (currentPayment.status === 'draft') {
      await paymentRow.getByRole('button', { name: '编辑', exact: true }).click()
      const editor = page.getByRole('dialog', { name: '编辑付款单', exact: true })
      await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      await editor.getByRole('combobox', { name: '付款账号', exact: true }).press('Enter')
      await page.getByRole('option', { name: new RegExp(`外币界面验收${currency}现金`) }).click()
      const pendingSave = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_settlement_secure')
      )
      await editor.getByRole('button', { name: '保存', exact: true }).click()
      expect((await pendingSave).ok()).toBe(true)
      await expect(editor).toBeHidden()
    }
    const executionResponse = await client
      .from('fms_payable_payment_execution')
      .select(
        'id,status,amount,currency_code,exchange_rate,account_set_id,fund_ledger_id,reversal_ledger_id'
      )
      .eq('document_id', payment.id)
    expect(executionResponse.error).toBeNull()
    const executions = acceptanceRows(executionResponse.data)
    const completed = previous('payment-complete', currency)
    if (currentPayment.status === 'approved' && executions.length > 0) {
      if (completed) expect(completed.id).toBe(payment.id)
      expect(executions).toHaveLength(1)
      expect(executions[0].status).toBe('reversed')
      expect(Number(executions[0].amount)).toBe(100)
      expect(executions[0].currency_code).toBe(currency)
      expect(Number(executions[0].exchange_rate)).toBe(index === 1 ? 7 : 8)
      expect(executions[0].account_set_id).toBe(currentPayment.account_set_id)
      expect(executions[0].fund_ledger_id).toEqual(expect.any(String))
      expect(executions[0].reversal_ledger_id).toEqual(expect.any(String))
      const ledgerResponse = await client
        .from('fms_fund_ledger_entry')
        .select('id,reversal_of_id,fund_account_id,account_set_id,amount,direction')
        .in('id', [String(executions[0].fund_ledger_id), String(executions[0].reversal_ledger_id)])
      expect(ledgerResponse.error?.code).toBe('42501')
      expect(ledgerResponse.data).toBeNull()
      await expect(paymentRow).toContainText('已审核')
      await captureBusinessEvidence(page, {
        path: info.outputPath(`payment-${currency}-cancelled-recovered.png`)
      })
      if (!completed)
        appendFileSync(
          journal,
          JSON.stringify({ purpose, kind: 'payment-complete', currency, ...payment }) + '\n'
        )
      continue
    }
    if (!(await paymentRow.innerText()).includes('已确认付款')) {
      await approve(page, paymentRow)
      await selectRow(paymentRow)
      await page.getByRole('button', { name: '确认付款', exact: true }).click()
      await page.getByRole('menuitem', { name: '确认付款', exact: true }).click()
      await page.getByRole('button', { name: '确认登记', exact: true }).click()
      await expect(paymentRow).toContainText('已确认付款')
    }
    const actualPayment = acceptanceRows(
      acceptanceRecord(
        await acceptanceRpc(client, 'fms_payable_settlement_list_secure', {
          p_kind: 'payment',
          p_query: { id: payment.id, current: 1, size: 1 }
        })
      ).data
    )[0]
    expect(actualPayment.currency_code).toBe(currency)
    expect(Number(actualPayment.exchange_rate)).toBe(index === 1 ? 7 : 8)
    const paymentLines = acceptanceRows(actualPayment.lines)
    expect(paymentLines).toHaveLength(1)
    expect(paymentLines[0].payee_supplier_name).toBe(source.payee_supplier_name)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`payment-${currency}-confirmed.png`)
    })
    await selectRow(paymentRow)
    await page.getByRole('button', { name: '确认付款', exact: true }).click()
    await page.getByRole('menuitem', { name: '取消付款', exact: true }).click()
    const cancellation = page.getByRole('dialog', { name: '处理原因', exact: true })
    await cancellation
      .getByRole('textbox')
      .fill('仅虚构现金账户验收：按原币和原执行冲回，不代表实际银行退款')
    const cancelled = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_act_payable_settlement_secure')
    )
    const refreshed = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_payable_settlement_list_secure')
    )
    await cancellation.getByRole('button', { name: '确定', exact: true }).click()
    expect((await cancelled).ok()).toBe(true)
    expect((await refreshed).ok()).toBe(true)
    await expect(paymentRow).toContainText('已审核')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`payment-${currency}-cancelled.png`)
    })
    appendFileSync(
      journal,
      JSON.stringify({ purpose, kind: 'payment-complete', currency, ...payment }) + '\n'
    )
  }
  expect(errors).toEqual([])
})
