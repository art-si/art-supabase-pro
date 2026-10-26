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
import { prepareAppearance, applyAppearance, assertAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { financePaths } from '../../src/router/business-paths'

const enabled =
  process.env.E2E_PAYABLE_LIVE === 'true' && process.env.E2E_PAYABLE_SOURCE_LINKS === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25000
})
test.setTimeout(300000)

async function ready(drawer: Locator): Promise<void> {
  await expect(drawer).toBeVisible()
  await expect(
    drawer.locator('[aria-busy="true"]:visible,.el-skeleton:visible,.el-loading-mask:visible')
  ).toHaveCount(0)
  await expect(drawer.locator('.el-alert--error:visible')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
}

async function scrollToBottom(drawer: Locator): Promise<void> {
  const scroll = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect
    .poll(() =>
      scroll.evaluate(
        (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      )
    )
    .toBe(true)
}

test('普通账号两笔已确认付款逐级联查真实应付与原承运商对账，不修改经营记录', async ({
  page,
  context
}, info) => {
  test.skip(!enabled, '仅显式运行已完成的独立租户来源联查验收')
  const client = await assertPayableAcceptanceSession(context)
  const sources = acceptanceRows(
    JSON.parse(readFileSync('.artifacts/payable-tms-native-sources.json', 'utf8'))
  )
  expect(sources).toHaveLength(2)
  const appearance = {
    theme: info.project.use.colorScheme === 'dark' ? ('dark' as const) : ('light' as const),
    boxBorderMode: !info.project.name.includes('shadow')
  }
  const mutations: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (
      /\/rpc\/(fms_(save|act|push|import)|tms_(create|update)|start_workflow|act_workflow)/.test(
        request.url()
      )
    )
      mutations.push(new URL(request.url()).pathname)
  })
  await prepareAppearance(page, appearance)
  for (const source of sources) {
    assert.ok(typeof source.carrier_name === 'string')
    const index = Number(source.source_index)
    const response = acceptanceRecord(
      await acceptanceRpc(client, 'tms_list_carrier_statements_secure', {
        p_from: 0,
        p_to: 49,
        p_carrier_id: source.carrier_id,
        p_purpose: 'list'
      })
    )
    const statements = acceptanceRows(response.records).filter(
      (row) => row.remark === `QA_AP_TMS_NATIVE_${index}`
    )
    expect(statements).toHaveLength(1)
    const statement = statements[0]
    assert.ok(typeof statement.statement_no === 'string')
    const financialResponse = await client
      .from('fms_purchase_payable_document')
      .select('id,document_no')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('kind', 'financial')
      .eq('tms_statement_id', acceptanceIdentifier(statement))
      .single()
    expect(financialResponse.error).toBeNull()
    const financial = acceptanceRecord(financialResponse.data)
    assert.ok(typeof financial.document_no === 'string')
    const paymentResponse = await client
      .from('fms_payable_settlement_line')
      .select('document_id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('payable_id', acceptanceIdentifier(financial))
    expect(paymentResponse.error).toBeNull()
    const paymentLinks = acceptanceRows(paymentResponse.data)
    expect(paymentLinks).toHaveLength(1)
    const paymentId = acceptanceIdentifier({ id: paymentLinks[0].document_id })
    const paymentRecord = acceptanceRows(
      acceptanceRecord(
        await acceptanceRpc(client, 'fms_payable_settlement_list_secure', {
          p_kind: 'payment',
          p_query: { id: paymentId }
        })
      ).data
    )[0]
    expect(paymentRecord.status).toBe('confirmed')
    const line = acceptanceRows(paymentRecord.lines)[0]
    expect(line.source_document_id).toBe(acceptanceIdentifier(financial))
    expect(line.source_document_kind).toBe('financial_payable')

    await page.goto(`#${financePaths.payablePayment}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '付款单', exact: true })).toBeVisible()
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    await applyAppearance(page, appearance)
    await page.goto(`#${financePaths.payablePayment}?recordId=${paymentId}`, {
      waitUntil: 'domcontentloaded'
    })
    const payment = page.getByRole('dialog', { name: '查看付款单', exact: true })
    await ready(payment)
    await expect(payment).toContainText(source.carrier_name)
    await captureBusinessEvidence(payment, {
      path: info.outputPath(`source-payment-${index}-top.png`)
    })
    const sourceInvoice = payment.getByRole('button', { name: financial.document_no, exact: true })
    await sourceInvoice.scrollIntoViewIfNeeded()
    await scrollToBottom(payment)
    await captureBusinessEvidence(payment, {
      path: info.outputPath(`source-payment-${index}-bottom.png`)
    })
    await sourceInvoice.click()
    const invoice = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
    await ready(invoice)
    await expect(payment).toBeHidden()
    await expect(invoice).toContainText(financial.document_no)
    await expect(invoice).toContainText('应付验收承运运费')
    await captureBusinessEvidence(invoice, {
      path: info.outputPath(`source-invoice-${index}-top.png`)
    })
    await expect(invoice.getByRole('switch', { name: '按比例计算付款计划' })).toHaveCount(0)
    const sourceStatement = invoice.getByRole('button', {
      name: statement.statement_no,
      exact: true
    })
    await sourceStatement.scrollIntoViewIfNeeded()
    await scrollToBottom(invoice)
    await captureBusinessEvidence(invoice, {
      path: info.outputPath(`source-invoice-${index}-bottom.png`)
    })
    await sourceStatement.click()
    const original = page.getByRole('dialog', { name: '承运商对账详情', exact: true })
    await ready(original)
    await expect(original.getByText('已结清', { exact: true })).toBeVisible()
    await expect(original.getByText('承运运费', { exact: true })).toBeVisible()
    await expect(invoice).toBeHidden()
    await expect(original).toContainText(statement.statement_no)
    await expect(original).toContainText(source.carrier_name)
    await captureBusinessEvidence(original, {
      path: info.outputPath(`source-statement-${index}-top.png`)
    })
    await scrollToBottom(original)
    await captureBusinessEvidence(original, {
      path: info.outputPath(`source-statement-${index}-bottom.png`)
    })
    await assertAppearance(page, appearance)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.keyboard.press('Escape')
    await expect(original).toBeHidden()
  }
  expect(errors).toEqual([])
  expect(mutations).toEqual([])
})
