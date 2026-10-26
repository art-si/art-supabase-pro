import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })

for (const [kind, title] of [
  ['application', '付款申请单'],
  ['payment', '付款单'],
  ['refund', '付款退款单']
] as const) {
  test(`${title} 两张外币单据保留原币、原账套及原汇率，账户不得跨账套`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const documents = ['USD', 'EUR'].map((currency, index) => ({
      id: `document-${index + 1}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      record_key: `document-${index + 1}`,
      kind,
      document_no: `QA-${kind}-${currency}`,
      document_type_id: 'type',
      document_type_name: title,
      status: 'draft',
      business_date: '2026-10-25',
      currency_code: currency,
      currency_id: `currency-${currency}`,
      base_currency_code: 'CNY',
      account_set_id: 'source-book',
      account_set_name: '验收原账套',
      exchange_rate: index === 0 ? 7.123456789123 : 7.8,
      fx_snapshot_version: 1,
      amount: 100,
      payment_status: 'none',
      frozen: false,
      reason: '虚构外币验收数据',
      remark: '',
      version: 1,
      details: { fee: 2, payment_type: 'active' },
      lines: [
        {
          id: `line-${index + 1}`,
          line_no: 10,
          purpose_id: 'purpose',
          purpose_name: kind === 'refund' ? '退采购付款' : '采购付款',
          supplier_id: 'supplier',
          supplier_name: '虚构验收供应商',
          payee_supplier_id: 'supplier',
          payee_supplier_name: '虚构验收供应商',
          settlement_method_id: 'remittance',
          settlement_method_name: '电汇',
          fund_account_id: `fund-${currency}`,
          fund_account_name: `原账套${currency}账户`,
          account_set_id: 'source-book',
          refund_payment_line_id: kind === 'refund' ? `original-${index + 1}` : undefined,
          refund_payment_document_no: kind === 'refund' ? `QA-ORIGINAL-${currency}` : undefined,
          source_purpose_business_type: kind === 'refund' ? 'purchase' : undefined,
          amount: 100,
          approved_amount: 100,
          planned_amount: 100,
          cash_discount: 0,
          expired_discount_amount: kind === 'refund' ? 5 : 0,
          tax_rate: 0,
          paid_amount: 20,
          counterparty_balance: 700,
          counterparty_balance_currency_code: 'CNY',
          bank_account: '',
          bank_account_name: '',
          bank_name: '',
          bank_reference: '',
          fund_purpose: '',
          remark: '',
          details: {}
        }
      ]
    }))
    const saved: string[] = []
    let organizationReads = 0
    let organizationBlocked = false
    let releaseOrganization: () => void = () => undefined
    const organizationGate = new Promise<void>((resolve) => {
      releaseOrganization = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const request: {
        p_query?: { id?: string }
        p_document?: (typeof documents)[number]
      } = route.request().postDataJSON() || {}
      if (name === 'mdm_organization') {
        organizationReads++
        if (kind === 'application' && organizationReads === 3) {
          organizationBlocked = true
          await organizationGate
        }
        return route.fulfill({ json: [] })
      }
      if (name === 'fms_payable_settlement_list_secure') {
        const data = documents.filter(
          (row) => !request.p_query?.id || request.p_query.id === row.id
        )
        return route.fulfill({ json: { data, total: data.length } })
      }
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            tenant_id: documents[0].tenant_id,
            supplier: [{ id: 'supplier', code: 'SUP', name: '虚构验收供应商' }],
            purpose: [
              {
                id: 'purpose',
                code: '201',
                name: kind === 'refund' ? '退采购付款' : '采购付款',
                business_type: kind === 'refund' ? 'purchase_refund' : 'purchase'
              }
            ],
            method: [{ id: 'remittance', code: 'JSFS04', name: '电汇', category: 'remittance' }],
            fund: ['USD', 'EUR'].flatMap((currency) =>
              ['source-book', 'other-book'].map((book) => ({
                id: book === 'source-book' ? `fund-${currency}` : `other-${currency}`,
                code: `${book}-${currency}`,
                name: `${book === 'source-book' ? '原账套' : '其他账套'}${currency}账户`,
                currency_code: currency,
                account_set_id: book,
                account_set_name: book === 'source-book' ? '验收原账套' : '禁止跨账套',
                category: 'bank'
              }))
            ),
            document_type: [{ id: 'type', code: 'TYPE', name: title, is_default: true }],
            currency: ['CNY', 'USD', 'EUR'].map((currency) => ({
              id: currency,
              code: currency,
              name: currency
            })),
            project: [],
            organization: [],
            payable: [],
            purchase: [],
            expense: [],
            bank: [],
            refund_source: []
          }
        })
      if (name === 'fms_save_payable_settlement_secure') {
        expect(request.p_document).toBeDefined()
        const document = request.p_document!
        expect(document.account_set_id).toBe('source-book')
        expect(document.base_currency_code).toBe('CNY')
        const original = documents.find((row) => row.id === document.id)
        if (
          document.currency_code !== original?.currency_code ||
          document.business_date !== original?.business_date
        ) {
          expect(document.exchange_rate).toBeNull()
          expect(document.currency_id).toBeNull()
          expect(document.fx_snapshot_version).toBeUndefined()
        } else expect(document.exchange_rate).toBe(original?.exchange_rate)
        expect(document.lines[0].fund_account_id).toBe(`fund-${document.currency_code}`)
        saved.push(document.id)
        return route.fulfill({ json: document })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const box = info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded' }
    )
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    for (const [index, document] of documents.entries()) {
      await expect(rows.nth(index)).toContainText(index === 0 ? 'US$100.00' : '€100.00')
      await rows.nth(index).getByRole('button', { name: '查看', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: `查看${title}`, exact: true })
      await expect(drawer).toContainText('验收原账套')
      await expect(drawer).toContainText(String(document.exchange_rate))
      const amountSection = drawer
        .locator('.art-section-card')
        .filter({ hasText: kind === 'refund' ? '退款金额说明' : '金额与付款说明' })
      await expect(amountSection).toContainText(index === 0 ? 'US$100.00' : '€100.00')
      await expect(amountSection).not.toContainText('¥')
      if (index === 0 && kind === 'payment') {
        await captureBusinessEvidence(drawer, {
          path: `.artifacts/payable-settlement-currency-${info.project.name}.png`
        })
        await amountSection.scrollIntoViewIfNeeded()
        await captureBusinessEvidence(drawer, {
          path: `.artifacts/payable-settlement-currency-amounts-${info.project.name}.png`
        })
      }
      await drawer.getByRole('button', { name: /关闭此/ }).click()
      await expect(drawer).not.toBeVisible()
      await rows.nth(index).getByRole('button', { name: '编辑', exact: true }).click()
      const editor = page.getByRole('dialog', { name: `编辑${title}`, exact: true })
      if (kind === 'application' && index === 0) {
        try {
          await expect.poll(() => organizationBlocked).toBe(true)
          await expect(editor.locator('.art-section-card').first()).toHaveAttribute(
            'aria-busy',
            'false'
          )
          await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
        } finally {
          releaseOrganization()
        }
        await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      }
      const account = editor.getByRole('combobox', {
        name: kind === 'refund' ? '退款收款账户' : '付款账号',
        exact: true
      })
      await account.press('Enter')
      await expect(page.getByRole('option', { name: /禁止跨账套/ })).toHaveCount(0)
      await expect(page.getByRole('option', { name: /账户/ })).toHaveCount(1)
      if (index === 0 && kind === 'payment')
        await captureBusinessEvidence(page, {
          path: `.artifacts/payable-settlement-currency-accounts-${info.project.name}.png`
        })
      await page
        .getByRole('option', { name: new RegExp(`原账套${document.currency_code}账户`) })
        .click()
      await editor.getByRole('button', { name: '保存', exact: true }).click()
      await expect(editor).not.toBeVisible()
    }
    expect(saved).toEqual(documents.map((document) => document.id))
    if (kind === 'payment') {
      for (const [index, original] of documents.entries()) {
        await rows.nth(index).getByRole('button', { name: '编辑', exact: true }).click()
        const editor = page.getByRole('dialog', { name: `编辑${title}`, exact: true })
        const currency = editor.getByRole('combobox', { name: '付款币种', exact: true })
        await currency.press('Enter')
        const target = original.currency_code === 'USD' ? 'EUR' : 'USD'
        await page.getByRole('option', { name: target, exact: true }).click()
        await expect(editor.getByRole('spinbutton', { name: /^\*?\s*记账汇率$/ })).toHaveValue('')
        const account = editor.getByRole('combobox', { name: '付款账号', exact: true })
        await expect(account).toHaveValue('')
        if (index === 0 && info.project.name === 'desktop-1440')
          await captureBusinessEvidence(editor, {
            path: '.artifacts/payable-settlement-currency-changed.png'
          })
        await account.press('Enter')
        await page.getByRole('option', { name: new RegExp(`原账套${target}账户`) }).click()
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await expect(editor).not.toBeVisible()
      }
      expect(saved).toEqual([...documents, ...documents].map((document) => document.id))
    }
    expect(errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
