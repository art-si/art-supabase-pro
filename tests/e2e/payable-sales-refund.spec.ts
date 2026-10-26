import { expect, test } from '@playwright/test'
import { assertAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { acceptanceRows } from './support/payable-live-session'
import { receivableDictionaryRows } from './fixtures/receivable-dictionaries'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 20_000 })
test.setTimeout(150_000)

const tenant = '11111111-1111-4111-8111-111111111111'
const organization = {
  id: 'refund-organization',
  tenant_id: tenant,
  parent_id: null,
  organization_code: 'REFUND-ORG',
  organization_name: '验收付款组织',
  organization_type: 'company',
  status: '1',
  sort: 1,
  is_system: false
}
const customers = [1, 2].map((index) => ({
  id: `customer-${index}`,
  code: `CUS-${index}`,
  name: `销售退款验收客户${index}`,
  enabled: true
}))

for (const mode of ['unified', 'legacy', 'blue', 'unverified'] as const) {
  test(`红字应收入口 ${mode} 尊重目标权限且不重复旧申请`, async ({ page }, info) => {
    const theme = info.project.name.includes('dark') ? 'dark' : 'light'
    const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    const source = {
      id: 'credit-receivable',
      tenant_id: tenant,
      kind: 'financial',
      status: 'approved',
      document_no: 'QA-AR-SALES-REFUND',
      is_credit: mode !== 'blue',
      customer_id: customers[0].id,
      customer_name: customers[0].name,
      currency_code: 'USD',
      business_date: '2026-10-26',
      amount: 100,
      tax_amount: 0,
      total_amount: 100,
      outstanding_amount: 100,
      available_amount: 100,
      document_type_name: '标准财务应收',
      organization_name: organization.organization_name,
      settlement_organization_id: organization.id,
      accounting_date: '2026-10-26',
      settlement_method: 'cash',
      account_set_id: 'original-ar-book',
      account_set_name: '销售退款原账套',
      base_currency_code: 'CNY',
      currency_id: 'USD',
      exchange_rate: 7.2,
      book_snapshot_version: 1,
      book_context: {
        configured: mode !== 'unverified',
        message: mode === 'unverified' ? '应收来源存在不同账套的记账证据，请先核对' : undefined,
        account_set_id: 'original-ar-book',
        account_set_name: '销售退款原账套',
        base_currency_code: 'CNY',
        exchange_rate: 7.2
      },
      lines: [
        {
          id: 'credit-ar-line',
          line_no: 10,
          basis: 'amount',
          material_description: '原红字应收服务金额',
          quantity: 0,
          base_quantity: 0,
          unit_price: 100,
          tax_inclusive_unit_price: 100,
          amount: 100,
          tax_amount: 0,
          total_amount: 100,
          tax_rate: 0,
          discount_method: 'none',
          gift: false
        }
      ]
    }
    const created = {
      id: 'unified-sales-application',
      kind: 'application',
      tenant_id: tenant,
      document_no: 'QA-UNIFIED-SALES-APPLICATION',
      status: 'draft',
      currency_code: 'USD',
      base_currency_code: 'CNY',
      exchange_rate: 7,
      account_set_id: 'original-ar-book',
      account_set_name: '销售退款原账套',
      business_date: '2026-10-26',
      amount: 100,
      frozen: false,
      version: 1,
      details: {},
      document_type_name: '销售退款申请',
      organization_id: organization.id,
      organization_name: organization.organization_name,
      applicant_name: '验收经办人',
      reason: `销售退款申请：${source.document_no}`,
      lines: [
        {
          id: 'unified-sales-line',
          line_no: 10,
          customer_id: customers[0].id,
          customer_name: customers[0].name,
          payee_customer_id: customers[0].id,
          payee_customer_name: customers[0].name,
          receivable_line_id: 'credit-ar-line',
          source_document_id: source.id,
          source_document_no: source.document_no,
          source_document_kind: 'financial_receivable',
          amount: 100,
          approved_amount: 100,
          planned_amount: 100,
          cash_discount: 0,
          tax_rate: 0,
          purpose_name: '销售退款',
          bank_account: '',
          bank_account_name: '',
          bank_name: '',
          details: { source_line_no: '10' }
        }
      ]
    }
    const pushed: unknown[] = []
    const legacyWrites: unknown[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'get_accessible_applications')
        return route.fulfill({
          json: [{ code: 'fms', name: 'FMS财务管理', base_url: '/', sort: 1 }]
        })
      if (name === 'sys_dictionary') {
        const parameters = new URL(route.request().url()).searchParams
        const typeCode = parameters.get('dict_type_table.code')?.replace(/^eq\./, '')
        const value = parameters.get('value')?.replace(/^eq\./, '')
        return route.fulfill({
          json: receivableDictionaryRows.filter(
            (item) =>
              (!typeCode || item.dict_type_table.code === typeCode) &&
              (!value || item.value === value)
          )
        })
      }
      if (name === 'mdm_organization') return route.fulfill({ json: [organization] })
      if (name === 'fms_receivable_workspace_secure')
        return route.fulfill({ json: { records: [source], total: 1 } })
      if (name === 'fms_push_payable_settlement_secure') {
        pushed.push(route.request().postDataJSON())
        return route.fulfill({ json: created })
      }
      if (name === 'fms_create_credit_payment_request_secure') {
        legacyWrites.push(route.request().postDataJSON())
        return route.fulfill({ status: 500, json: { message: '此测试不得重复写入旧申请' } })
      }
      if (name === 'fms_payable_settlement_list_secure')
        return route.fulfill({ json: { data: [created], total: 1 } })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            tenant_id: tenant,
            supplier: [],
            customer: customers,
            purpose: [],
            method: [],
            fund: [],
            document_type: [],
            currency: [],
            project: [],
            organization: [],
            expense: [],
            purchase: [],
            payable: [],
            receivable: []
          }
        })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, catalog: null, profiles: [] } })
      return route.fulfill({ json: [] })
    })
    const permissions = [
      'FinanceFinancialReceivable:View',
      'FinanceFinancialReceivable:Push',
      ...(mode === 'legacy'
        ? ['FinanceReceivablePaymentRequest:Add', 'FinanceReceivablePaymentRequest:View']
        : ['FinancePayableApplication:Add', 'FinancePayableApplication:View'])
    ].join(',')
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=receivable&sourceLinks&permissions=${permissions}&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded' }
    )
    const row = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: source.document_no })
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect(row).toContainText('已审核')
    if (mode === 'unverified') {
      await row.getByRole('button', { name: '查看', exact: true }).click()
      const sourceDrawer = page.getByRole('dialog')
      await expect(sourceDrawer).toContainText('应收来源存在不同账套的记账证据，请先核对')
      await expect(sourceDrawer.getByText('原记账汇率', { exact: true })).toHaveCount(0)
      await captureBusinessEvidence(page, {
        path: info.outputPath('sales-refund-source-unverified.png')
      })
      expect(pushed).toEqual([])
      expect(legacyWrites).toEqual([])
      expect(errors).toEqual([])
      return
    }
    await row.locator('.el-checkbox').click()
    await page.getByRole('button', { name: '下推', exact: true }).click()
    if (mode === 'legacy') {
      await expect(page.getByRole('menuitem', { name: '销售退款申请', exact: true })).toHaveCount(0)
      await page.getByRole('menuitem', { name: '付款申请（贷方余额）', exact: true }).click()
      await expect(
        page.getByRole('dialog', { name: '贷方余额生成付款申请', exact: true })
      ).toBeVisible()
      expect(pushed).toEqual([])
    } else {
      await expect(
        page.getByRole('menuitem', { name: '付款申请（贷方余额）', exact: true })
      ).toHaveCount(0)
      if (mode === 'unified')
        await captureBusinessEvidence(page, {
          path: info.outputPath('sales-refund-source-action.png')
        })
      await page.getByRole('menuitem', { name: '销售退款申请', exact: true }).click()
      if (mode === 'blue') {
        await expect(
          page.getByText('仅已审核红字财务应收可发起销售退款申请', { exact: true })
        ).toBeVisible()
        expect(pushed).toEqual([])
      } else {
        await expect(page.getByRole('heading', { name: '付款申请单', exact: true })).toBeVisible()
        const drawer = page.getByRole('dialog')
        await expect(drawer).toContainText(created.document_no)
        await expect(drawer).toContainText(customers[0].name)
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
        expect(pushed).toEqual([{ p_id: source.id, p_kind: 'application', p_source: 'receivable' }])
        await expect(page.locator('.el-message')).toHaveCount(0)
        await expect(drawer.locator('.el-skeleton:visible,.el-loading-mask:visible')).toHaveCount(0)
        await captureBusinessEvidence(page, {
          path: info.outputPath('sales-refund-source-target.png')
        })
        await drawer.getByRole('button', { name: source.document_no, exact: true }).click()
        await expect(
          page.getByRole('heading', { name: '财务应收单', exact: true, level: 1 })
        ).toBeVisible()
        await expect(page.getByRole('dialog')).toContainText(source.document_no)
        await expect(page.getByRole('dialog')).toContainText('7.2')
        await expect(page.getByRole('dialog').getByText('financial', { exact: true })).toHaveCount(
          0
        )
        await captureBusinessEvidence(page, {
          path: info.outputPath('sales-refund-source-return.png')
        })
      }
    }
    expect(legacyWrites).toEqual([])
    expect(errors).toEqual([])
  })
}

for (const [kind, currency] of [
  ['application', 'USD'],
  ['payment', 'CNY']
] as const) {
  test(`${currency} ${kind} 保留真实客户来源、核对未知币种账号并保存`, async ({ page }, info) => {
    const theme = info.project.name.includes('dark') ? 'dark' : 'light'
    const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    const makeDocument = (index: number) => ({
      id: `sales-${kind}-${index}`,
      tenant_id: tenant,
      kind,
      record_key: `sales-${kind}-${index}`,
      document_no: `QA-SALES-${kind}-${index}`,
      document_type_id: kind === 'application' ? 'sales-application-type' : 'other-payment-type',
      document_type_name: kind === 'application' ? '销售退款申请' : '其他付款',
      status: 'draft',
      business_date: '2026-10-26',
      currency_code: currency,
      account_set_id: 'original-ar-book',
      account_set_name: '销售退款原账套',
      base_currency_code: 'CNY',
      exchange_rate: currency === 'USD' ? 7 : 1,
      amount: 100 * index,
      counterparty_name: customers[index - 1].name,
      frozen: false,
      version: 1,
      reason: '按原红字应收退还客户本金',
      organization_id: organization.id,
      organization_name: organization.organization_name,
      applicant_name: '验收经办人',
      details: { fee: 0 },
      lines: [
        {
          id: `sales-line-${index}`,
          line_no: 10,
          purpose_id: 'sales-refund-purpose',
          purpose_name: '销售退款',
          customer_id: customers[index - 1].id,
          customer_name: customers[index - 1].name,
          payee_customer_id: customers[index - 1].id,
          payee_customer_name: customers[index - 1].name,
          receivable_line_id: `ar-line-${index}`,
          source_document_id: `ar-${index}`,
          source_document_no: `QA-AR-CREDIT-${index}`,
          source_document_kind: 'financial_receivable',
          supplier_id: null,
          payee_supplier_id: null,
          carrier_id: null,
          payable_id: null,
          purchase_id: null,
          application_line_id: kind === 'payment' ? `approved-application-line-${index}` : null,
          amount: 100 * index,
          approved_amount: 100 * index,
          planned_amount: 100 * index,
          cash_discount: 0,
          tax_rate: 0,
          settlement_method_id: 'cash-method',
          settlement_method_name: '现金',
          fund_account_id: 'original-cash',
          fund_account_name: '原账套现金账户',
          bank_account: '',
          bank_account_name: '',
          bank_name: '',
          details: { source_line_no: '10' }
        }
      ]
    })
    let documents: Array<Record<string, unknown>> = [makeDocument(1), makeDocument(2)]
    const saved: Array<Record<string, unknown>> = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const request: { p_query?: { id?: string }; p_document?: Record<string, unknown> } =
        route.request().postDataJSON() || {}
      if (name === 'fms_payable_settlement_list_secure') {
        const data = request.p_query?.id
          ? documents.filter((document) => document.id === request.p_query?.id)
          : documents
        return route.fulfill({ json: { data, total: data.length } })
      }
      if (name === 'mdm_organization') return route.fulfill({ json: [organization] })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            tenant_id: tenant,
            supplier: [{ id: 'supplier-not-customer', code: 'SUP-1', name: '不得冒用的供应商' }],
            customer: customers,
            purpose: [
              {
                id: 'sales-refund-purpose',
                code: 'AP-SALES-REFUND',
                name: '销售退款',
                business_type: 'sales_refund',
                receivable_writeoff: true,
                payable_writeoff: false
              },
              { id: 'purchase-purpose', code: '201', name: '采购付款', business_type: 'purchase' }
            ],
            document_type:
              kind === 'application'
                ? [
                    {
                      id: 'sales-application-type',
                      code: 'AP_APP_SALES_REFUND',
                      name: '销售退款申请'
                    },
                    {
                      id: 'purchase-application-type',
                      code: 'AP_APP_PURCHASE',
                      name: '采购付款申请'
                    }
                  ]
                : [{ id: 'other-payment-type', code: 'AP_PAYMENT_OTHER', name: '其他付款' }],
            method: [
              { id: 'cash-method', code: 'JSFS01', name: '现金', category: 'cash' },
              { id: 'virtual-method', code: 'VIRTUAL', name: '虚拟结算', category: 'virtual' }
            ],
            fund: [
              {
                id: 'original-cash',
                code: 'CASH-1',
                name: '原账套现金账户',
                category: 'cash',
                currency_code: currency,
                account_set_id: 'original-ar-book'
              },
              {
                id: 'wrong-book-cash',
                code: 'CASH-2',
                name: '不同账套现金账户',
                category: 'cash',
                currency_code: currency,
                account_set_id: 'other-book'
              }
            ],
            currency: [{ id: currency, code: currency, name: currency }],
            project: [],
            organization: [],
            expense: [],
            purchase: [],
            payable: [],
            receivable: customers.map((customer, index) => ({
              id: `ar-line-${index + 1}`,
              receivable_line_id: `ar-line-${index + 1}`,
              source_document_id: `ar-${index + 1}`,
              source_document_no: `QA-AR-CREDIT-${index + 1}`,
              code: `QA-AR-CREDIT-${index + 1} / 10`,
              source_line_no: 10,
              customer_id: customer.id,
              payee_customer_id: customer.id,
              name: customer.name,
              currency_code: currency,
              account_set_id: 'original-ar-book',
              account_set_name: '销售退款原账套',
              base_currency_code: 'CNY',
              amount: 100 * (index + 1),
              exchange_rate: 7.2,
              kind: 'financial_receivable'
            })),
            bank: customers.map((customer, index) => ({
              id: `customer-bank-${index + 1}`,
              customer_id: customer.id,
              bank_account: `0000000000000000000${index + 1}`,
              account_name: '',
              bank_name: '虚构客户开户行',
              currency_code: null
            }))
          }
        })
      if (name === 'fms_save_payable_settlement_secure' && request.p_document) {
        const record = request.p_document
        saved.push(record)
        documents = documents.map((document) => (document.id === record.id ? record : document))
        return route.fulfill({ json: record })
      }
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, catalog: null, profiles: [] } })
      return route.fulfill({ json: [] })
    })
    const prefix = kind === 'application' ? 'FinancePayableApplication' : 'FinancePayablePayment'
    const permissions = [
      `${prefix}:View`,
      `${prefix}:Edit`,
      'FinanceFinancialReceivable:View'
    ].join(',')
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&permissions=${permissions}&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, { theme, boxBorderMode: box === 'border-mode' })
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect(page.locator('.el-skeleton:visible,.el-loading-mask:visible')).toHaveCount(0)
    await captureBusinessEvidence(page, { path: info.outputPath('sales-refund-list.png') })
    await rows.first().getByRole('button', { name: '编辑', exact: true }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await expect(drawer.getByRole('combobox', { name: '往来单位', exact: true })).toHaveCount(0)
    await expect(drawer.getByText(customers[0].name, { exact: true }).first()).toBeVisible()
    if (kind === 'application') {
      await drawer.getByRole('combobox', { name: '来源单据', exact: true }).press('Enter')
      await page.getByRole('option').filter({ hasText: 'QA-AR-CREDIT-2 / 10' }).click()
      await expect(drawer.getByText(customers[1].name, { exact: true }).first()).toBeVisible()
    } else {
      await expect(drawer.getByRole('spinbutton', { name: '现金折扣', exact: true })).toHaveCount(0)
      await expect(drawer.getByRole('spinbutton', { name: '税率', exact: true })).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: '新增明细', exact: true })).toBeDisabled()
    }
    const payeeIndex = kind === 'application' ? 0 : 1
    await drawer.getByRole('combobox', { name: '收款客户', exact: true }).press('Enter')
    await page
      .getByRole('option', {
        name: `${customers[payeeIndex].name} · ${customers[payeeIndex].code}`,
        exact: true
      })
      .click()
    const bank = drawer.getByRole('combobox', { name: '对方银行账号', exact: true })
    await expect(bank).toHaveValue('')
    await bank.press('Enter')
    await captureBusinessEvidence(page, { path: info.outputPath('sales-refund-bank-options.png') })
    await page
      .getByRole('option')
      .filter({ hasText: `0000000000000000000${payeeIndex + 1}` })
      .click()
    await expect(drawer.getByRole('textbox', { name: '对方账号名称', exact: true })).toHaveValue('')
    await drawer
      .getByRole('textbox', { name: '对方账号名称', exact: true })
      .fill('已核对虚构账号名称')
    if (kind === 'payment') {
      await drawer.getByRole('button', { name: '复制明细', exact: true }).click()
      const amounts = drawer.getByRole('spinbutton', { name: '实付金额', exact: true })
      await expect(amounts).toHaveCount(2)
      await amounts.nth(0).fill('60')
      await amounts.nth(0).press('Tab')
      await amounts.nth(1).fill('40')
      await amounts.nth(1).press('Tab')
    }
    await drawer.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = 0
    })
    await drawer.locator('.art-section-card').nth(1).scrollIntoViewIfNeeded()
    await captureBusinessEvidence(page, {
      path: info.outputPath('sales-refund-editor-parties.png')
    })
    await drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
      element.scrollTop = 0
    })
    await captureBusinessEvidence(page, { path: info.outputPath('sales-refund-editor.png') })
    await drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await drawer.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await captureBusinessEvidence(page, { path: info.outputPath('sales-refund-editor-lower.png') })
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(drawer).toBeHidden()
    expect(saved).toHaveLength(1)
    const record = saved[0]
    expect(record.currency_code).toBe(currency)
    expect(Number(record.exchange_rate)).toBe(currency === 'USD' ? 7 : 1)
    expect(record.account_set_id).toBe('original-ar-book')
    const actualLines = acceptanceRows(record.lines)
    for (const line of actualLines) {
      expect(line.customer_id).toBe(kind === 'application' ? customers[1].id : customers[0].id)
      expect(line.payee_customer_id).toBe(customers[payeeIndex].id)
      expect(line.receivable_line_id).toBe(kind === 'application' ? 'ar-line-2' : 'ar-line-1')
      expect(line.supplier_id).toBeNull()
      expect(line.payee_supplier_id).toBeNull()
      if (kind === 'payment') expect(line.application_line_id).toBe('approved-application-line-1')
    }
    expect(actualLines.reduce((sum, line) => sum + Number(line.amount), 0)).toBe(
      kind === 'application' ? 200 : 100
    )
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
