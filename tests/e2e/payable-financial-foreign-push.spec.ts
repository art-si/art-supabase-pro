import { expect, test } from '@playwright/test'
import { assertAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })

for (const [currency, kind, menuLabel, title] of [
  ['USD', 'application', '付款申请', '付款申请单'],
  ['EUR', 'payment', '付款单', '付款单']
] as const) {
  test(`外币财务应付 ${currency} 保持来源上下文下推${title}`, async ({ page }, info) => {
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    const source = {
      id: `source-${currency}`,
      record_key: `source-${currency}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      kind: 'financial',
      document_no: `QA-AP-${currency}`,
      document_type_name: '费用应付',
      source_type: 'manual',
      business_date: '2026-10-26',
      status: 'approved',
      supplier_id: 'supplier',
      supplier_name: '外币验收供应商',
      currency_code: currency,
      base_currency_code: 'CNY',
      account_set_id: 'source-book',
      account_set_name: '原核算账套',
      exchange_rate: 7.2,
      total_amount: 100,
      unpaid_amount: 100,
      frozen_amount: 0,
      is_credit: false,
      is_reversal: false,
      standard_purchase: false,
      lines: [
        {
          id: 'source-line',
          line_no: 10,
          material_description: '外币服务费用',
          quantity: 1,
          unit_price: 100,
          amount: 100,
          tax_amount: 0,
          total_amount: 100
        }
      ]
    }
    const created = {
      id: `downstream-${kind}`,
      tenant_id: source.tenant_id,
      kind,
      document_no: `QA-${kind}-${currency}`,
      status: 'draft',
      currency_code: currency,
      base_currency_code: 'CNY',
      account_set_id: source.account_set_id,
      account_set_name: source.account_set_name,
      exchange_rate: 6.9,
      business_date: '2026-10-26',
      amount: 100,
      reason: '外币财务应付下推',
      counterparty_name: source.supplier_name,
      frozen: false,
      version: 1,
      details: {},
      lines: [
        {
          id: 'payment-line',
          line_no: 10,
          payable_id: source.id,
          source_document_no: source.document_no,
          supplier_id: source.supplier_id,
          supplier_name: source.supplier_name,
          payee_supplier_id: source.supplier_id,
          payee_supplier_name: source.supplier_name,
          amount: 100,
          approved_amount: 100,
          planned_amount: 100,
          cash_discount: 0,
          tax_rate: 0,
          details: {}
        }
      ]
    }
    const requests: unknown[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({ json: { data: [source], total: 1 } })
      if (name === 'fms_push_payable_settlement_secure') {
        requests.push(route.request().postDataJSON())
        return route.fulfill({ json: created })
      }
      if (name === 'fms_payable_settlement_list_secure')
        return route.fulfill({ json: { data: [created], total: 1 } })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({ json: { purpose: [], method: [], fund: [], supplier: [] } })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, catalog: null, profiles: [] } })
      return route.fulfill({ json: [] })
    })
    const prefix = kind === 'application' ? 'FinancePayableApplication' : 'FinancePayablePayment'
    const permissions = [
      'FinancePurchasePayable:View',
      'FinancePurchasePayable:Push',
      `${prefix}:View`,
      `${prefix}:Add`
    ].join(',')
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=financial&sourceLinks&permissions=${permissions}&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, { theme, boxBorderMode: box === 'border-mode' })
    const row = page
      .locator('.el-table__body-wrapper tbody tr')
      .filter({ hasText: source.document_no })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const sourceDrawer = page.getByRole('dialog')
    await expect(sourceDrawer).toContainText('原单记账汇率')
    await expect(sourceDrawer).toContainText('7.2')
    await expect(sourceDrawer).not.toContainText('跨币入口尚未开放')
    await expect(page.getByText('已使用前端默认列', { exact: true })).toHaveCount(0)
    await captureBusinessEvidence(page, { path: info.outputPath('foreign-payable-source.png') })
    await sourceDrawer
      .locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
    await captureBusinessEvidence(page, {
      path: info.outputPath('foreign-payable-source-lower.png')
    })
    await page.keyboard.press('Escape')
    await expect(sourceDrawer).toBeHidden()
    await row.getByRole('checkbox').locator('..').click()
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page.getByRole('menuitem', { name: menuLabel, exact: true }).click()
    await expect
      .poll(() => requests)
      .toEqual([{ p_id: source.id, p_kind: kind, p_source: 'payable' }])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText(created.document_no)
    await expect(page.getByRole('dialog')).toContainText(currency)
    await expect(page.getByRole('dialog')).toContainText('原核算账套')
    await expect(page.getByRole('dialog')).toContainText('6.9')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await expect(page.getByText('已使用前端默认列', { exact: true })).toHaveCount(0)
    await captureBusinessEvidence(page, { path: info.outputPath('foreign-payable-downstream.png') })
    await page
      .getByRole('dialog')
      .locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
    await captureBusinessEvidence(page, {
      path: info.outputPath('foreign-payable-downstream-lower.png')
    })
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
