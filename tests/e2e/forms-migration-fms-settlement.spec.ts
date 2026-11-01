import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111',
  recordId = '44444444-4444-4444-8444-444444444444',
  partyId = '55555555-5555-4555-8555-555555555555',
  statementId = '66666666-6666-4666-8666-666666666666'
const common = { id: recordId, tenantId, status: 'draft' }
const invoice = {
  ...common,
  invoiceRecordNo: 'INV-001',
  direction: 'output',
  customerId: partyId,
  counterpartyNameSnapshot: '验收客户',
  invoiceType: 'vat_special',
  invoiceTitle: '验收开票主体',
  taxNumber: '913100000000000001',
  invoiceNo: '',
  invoiceCode: '',
  issueDate: '2026-11-01',
  taxRate: 0,
  amountExcludingTax: 100,
  taxAmount: 0,
  totalAmount: 100,
  attachments: [],
  fieldAccess: { invoiceAmounts: 'edit', taxIdentity: 'edit', invoiceAttachments: 'edit' }
}
const application = {
  ...common,
  applicationNo: 'PAY-001',
  carrierId: partyId,
  carrierName: '验收承运商',
  plannedPaymentDate: '',
  amount: 100,
  paymentMethod: 'bank_transfer',
  basisUrls: [],
  fieldAccess: { applicationAmounts: 'edit', basisEvidence: 'edit' },
  items: [
    {
      statementId,
      carrierId: partyId,
      statementNoSnapshot: 'STATEMENT-001',
      statementAmountSnapshot: 100,
      outstandingAmountSnapshot: 100,
      appliedAmount: 100
    }
  ]
}
const expense = {
  ...common,
  costNo: 'COST-001',
  waybillId: partyId,
  waybillNo: 'WAYBILL-001',
  waybill: { id: partyId, tenantId, waybillNo: 'WAYBILL-001', plateNo: '沪A12345' },
  expenseItemId: statementId,
  costType: 'other',
  amount: 100,
  occurredOn: '',
  payeeType: 'manual',
  payeeName: '验收收款人',
  payeeBank: '验收银行',
  payeeAccount: '622200000001',
  attachments: [],
  fieldAccess: {
    costAmounts: 'edit',
    paymentDetails: 'edit',
    expenseLocation: 'hidden',
    expenseEvidence: 'edit'
  }
}
const reimbursementSource = {
  ...expense,
  occurredOn: '2026-11-01',
  auditStatus: 'approved',
  settlementStatus: 'unsettled',
  expenseItem: { reimbursementAllowed: true }
}
const prefix = 'modules/art-supabase-fms/src/views/settlement/'
const scenarios = [
  {
    name: '发票登记',
    file: 'invoice-management/modules/invoice-dialog.vue',
    rpc: 'save_tms_invoice_secure',
    row: invoice,
    args: [invoice],
    label: '发票号码',
    key: 'p_invoice_no',
    value: '12345678',
    date: false,
    tabs: 3,
    clear: false
  },
  {
    name: '付款申请',
    file: 'payment-application/modules/payment-application-dialog.vue',
    rpc: 'save_tms_carrier_payment_application_secure',
    row: application,
    args: [application],
    label: '计划付款日期',
    key: 'p_planned_payment_date',
    value: '2026-12-01',
    date: true,
    tabs: 2,
    clear: false
  },
  {
    name: '运单费用',
    file: 'waybill-cost/modules/waybill-expense-dialog.vue',
    rpc: 'tms_save_waybill_cost_secure',
    row: expense,
    args: [{ row: expense }],
    label: '发生日期',
    key: 'occurred_on',
    value: '2026-11-01',
    date: true,
    tabs: 2,
    clear: false
  },
  {
    name: '运单费用转报销',
    file: 'waybill-cost/modules/reimbursement-dialog.vue',
    rpc: 'create_tms_expense_reimbursement_with_driver_secure',
    row: {},
    args: [[reimbursementSource]],
    label: '收款人',
    key: 'p_payee_name',
    value: '验收实际收款人',
    date: false,
    tabs: 2,
    clear: true
  }
]
for (const scenario of scenarios)
  test(`${scenario.name} 隐藏页校验与实际业务保存`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const submissions: Record<string, unknown>[] = [],
      errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        rpc = url.pathname.split('/rpc/')[1]
      if (rpc === scenario.rpc) {
        submissions.push(request.postDataJSON())
        return route.fulfill({ json: scenario.name === '运单费用' ? { id: recordId } : recordId })
      }
      if (rpc === 'tms_find_active_invoice_by_legal_no_secure') return route.fulfill({ json: null })
      if (rpc === 'tms_get_invoice_secure' || rpc === 'tms_get_carrier_payment_application_secure')
        return route.fulfill({ json: scenario.row })
      if (rpc === 'get_effective_ai_feature_configs')
        return route.fulfill({ json: [{ feature: 'waybill_expense_ocr', enabled: false }] })
      if (url.pathname.endsWith('/tms_expense_item'))
        return route.fulfill({
          json: [
            {
              id: statementId,
              tenantId,
              itemCode: 'EXPENSE',
              itemName: '验收费用项目',
              isEnabled: true,
              isSelectable: true,
              parentId: null
            }
          ]
        })
      return route.fulfill({ json: [] })
    })
    const dicts = Object.fromEntries(
      ['tmsInvoiceDirection', 'tmsInvoiceStatus', 'tmsInvoiceType', 'tmsCashPaymentMethod'].map(
        (code) => [
          code,
          ['output', 'draft', 'vat_special', 'bank_transfer'].map((value) => ({
            label: value,
            value
          }))
        ]
      )
    )
    await page.addInitScript(
      (input) => {
        window.formsMigrationInput = input
      },
      {
        args: scenario.args,
        permissions: ['FinanceWaybillCost:Edit', 'FinanceWaybillCost:Reimburse'],
        dicts
      }
    )
    await page.goto(
      '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
        encodeURIComponent(prefix + scenario.file)
    )
    const dialog = page.locator('.el-dialog:visible').first(),
      tabs = dialog.getByRole('tab'),
      confirm = dialog.locator('.el-dialog__footer button').last()
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('open-error')).toBeEmpty()
    await expect(confirm).toBeEnabled({ timeout: 30_000 })
    await expect(tabs).toHaveCount(scenario.tabs)
    const field = page.getByRole(scenario.date ? 'combobox' : 'textbox', {
      name: new RegExp('^\\*?\\s*' + scenario.label + '$')
    })
    await tabs.first().click()
    await expect(field).toBeVisible()
    if (scenario.clear) {
      await field.fill('')
      await field.press('Tab')
    }
    await field.evaluate((node) => node.setAttribute('data-settlement-control', 'preserved'))
    await tabs.last().click()
    await expect(field).toBeHidden()
    await expect(page.locator('[data-settlement-control]')).toHaveCount(1)
    await confirm.click()
    await expect(field).toBeVisible()
    await expect(field).toBeFocused()
    expect(submissions).toHaveLength(0)
    await field.fill(scenario.value)
    await field.press('Tab')
    if (scenario.date) await field.press('Escape')
    await page.screenshot({
      path: testInfo.outputPath('corrected-form.png'),
      animations: 'disabled'
    })
    await confirm.click()
    await expect.poll(() => submissions.length).toBe(1)
    await expect(page.getByTestId('successes')).toHaveText('1')
    const payload = (submissions[0].p_payload || submissions[0]) as Record<string, unknown>
    expect(payload[scenario.key]).toBe(scenario.value)
    if (scenario.name === '付款申请')
      expect(payload).toMatchObject({
        p_application_id: recordId,
        p_carrier_id: partyId,
        p_amount: 100,
        p_allocations: [{ statementId, amount: 100 }]
      })
    if (scenario.name === '发票登记')
      expect(payload).toMatchObject({
        p_invoice_id: recordId,
        p_customer_id: partyId,
        p_total_amount: 100,
        p_tax_amount: 0
      })
    if (scenario.name === '运单费用')
      expect(payload).toMatchObject({
        waybill_id: partyId,
        expense_item_id: statementId,
        amount: 100
      })
    if (scenario.name === '运单费用') {
      expect(payload).not.toHaveProperty('tenant_id')
      expect(submissions[0].p_id).toBe(recordId)
    }
    if (scenario.name === '运单费用转报销') expect(payload.p_cost_ids).toEqual([recordId])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
    expect(errors).toEqual([])
  })
